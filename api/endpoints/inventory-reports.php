<?php
// Dedicated read-only reports. Cost fields are added server-side only for administrators.
$actor = requireAuthenticatedUser($pdo);
if ($method !== 'GET') respondError('Method not allowed', 405);
$reportPermission = match ($id) {
    'movements' => 'report:stock_movements',
    'stock-card' => 'report:stock_card',
    default => 'report:inventory',
};
if ($id === 'options') requireAnyReportPermission($pdo, $actor, ['report:inventory', 'report:stock_card', 'report:stock_movements', 'report:stock_opname']);
else requireReportPermission($pdo, $actor, $reportPermission);
// Keep older production databases compatible when this endpoint is deployed
// before the shared API bootstrap has run again.
ensureTableColumn($pdo, 'stock_movements', 'verified_at', 'DATETIME NULL AFTER void_reason');
ensureTableColumn($pdo, 'stock_movements', 'verified_by', 'VARCHAR(20) NULL AFTER verified_at');
ensureTableColumn($pdo, 'stock_movements', 'verification_note', 'VARCHAR(255) NULL AFTER verified_by');

try {
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    $allowed = array_map('strval', getAccessibleBranchIds($pdo, $actor));
    $branchId = trim((string)($_GET['branchId'] ?? 'ALL'));
    if ($branchId !== 'ALL' && !in_array($branchId, $allowed, true)) throw new DomainException('Cabang tidak dapat diakses', 403);
    $branchIds = $branchId === 'ALL' ? $allowed : [$branchId];
    $marks = implode(',', array_fill(0, max(1, count($branchIds)), '?'));
    $warehouseQuery = $pdo->prepare("SELECT w.id,CASE WHEN w.is_active=1 THEN w.name ELSE CONCAT(w.name,' (Nonaktif)') END name,w.is_active isActive,w.branch_id branchId,b.name branchName
        FROM warehouses w JOIN branches b ON b.id=w.branch_id
        WHERE w.is_system=0 AND w.branch_id IN ($marks) ORDER BY b.name,w.name");
    $warehouseQuery->execute($branchIds ?: ['__no_access__']);
    $warehouses = $warehouseQuery->fetchAll();
    $warehouseMap = array_column($warehouses, null, 'id');
    $warehouseId = trim((string)($_GET['warehouseId'] ?? ''));
    if ($warehouseId !== '' && !isset($warehouseMap[$warehouseId])) throw new DomainException('Gudang tidak dapat diakses pada cabang ini', 403);
    $canViewCosts = authenticatedUserIsOwnerOrAdministrator($pdo, $actor);
    // Inactive items still have a reportable history even when their closing stock is zero.
    $itemQuery = $pdo->query("SELECT i.id,i.code,i.name,i.unit,i.category_name categoryName,i.is_active isActive FROM items i
        WHERE i.type='Persediaan' ORDER BY i.name,i.code");
    $items = $itemQuery->fetchAll();
    $payload = ['warehouses' => $warehouses, 'items' => $items, 'canViewCosts' => $canViewCosts,
        'canVerifyMovements' => authenticatedUserIsOwnerOrAdministrator($pdo, $actor), 'asOf' => date('c')];

    if ($id === 'options') {
        $pdo->commit();
        respondSuccess($payload);
    }
    if ($id === 'balances') {
        $stockQuery = $pdo->prepare("SELECT ws.warehouse_id,ws.item_id,ws.quantity,ws.reserved_quantity
            FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id WHERE w.branch_id IN ($marks)");
        $stockQuery->execute($branchIds ?: ['__no_access__']);
        $stocks = [];
        foreach ($stockQuery->fetchAll() as $stock) $stocks[$stock['warehouse_id']][$stock['item_id']] = $stock;
        $costs = $canViewCosts ? inventoryAverageForItems($pdo, array_column($items, 'id'), date('Y-m-d')) : [];
        $rows = [];
        foreach ($items as $item) foreach ($warehouses as $warehouse) {
            if ($warehouseId !== '' && $warehouse['id'] !== $warehouseId) continue;
            $stock = $stocks[$warehouse['id']][$item['id']] ?? [];
            $quantity = (int)($stock['quantity'] ?? 0);
            if ((!$item['isActive'] || !$warehouse['isActive']) && $quantity === 0) continue;
            $row = [
                'itemId' => $item['id'], 'code' => $item['code'], 'name' => $item['name'], 'unit' => $item['unit'],
                'categoryName' => $item['categoryName'], 'warehouseId' => $warehouse['id'], 'warehouseName' => $warehouse['name'],
                'branchId' => $warehouse['branchId'], 'branchName' => $warehouse['branchName'], 'quantity' => $quantity,
                'reservedQuantity' => (int)($stock['reserved_quantity'] ?? 0),
            ];
            if ($canViewCosts) {
                $cost = $costs[$item['id']]['averageCost'] ?? $costs[$item['id']]['defaultCost'] ?? 0;
                $row['averageCost'] = $cost;
                $row['inventoryValue'] = round($quantity * $cost, 2);
            }
            $rows[] = $row;
        }
        $payload['rows'] = $rows;
    } elseif ($id === 'movements') {
        require_once __DIR__.'/../inventory-movement-report.php';
        $dateFrom = itemUsageDate($_GET['dateFrom'] ?? '');
        $dateTo = itemUsageDate($_GET['dateTo'] ?? '');
        if ($dateFrom > $dateTo) throw new InvalidArgumentException('Tanggal awal harus sebelum atau sama dengan tanggal akhir');
        $payload += ['dateFrom' => $dateFrom, 'dateTo' => $dateTo,
            'rows' => inventoryMovementReport($pdo, $warehouses, $warehouseId, $dateFrom, $dateTo)];
    } elseif ($id === 'stock-card') {
        $itemId = trim((string)($_GET['itemId'] ?? ''));
        $dateFrom = itemUsageDate($_GET['dateFrom'] ?? '');
        $dateTo = itemUsageDate($_GET['dateTo'] ?? '');
        if ($dateFrom > $dateTo) throw new InvalidArgumentException('Tanggal awal harus sebelum atau sama dengan tanggal akhir');
        if ($warehouseId === '') throw new InvalidArgumentException('Pilih satu gudang untuk melihat saldo kartu stok');
        $item = array_column($items, null, 'id')[$itemId] ?? null;
        if (!$item) throw new InvalidArgumentException('Pilih barang persediaan yang tersedia');
        $stockQuery = $pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?');
        $stockQuery->execute([$warehouseId, $itemId]);
        $closing = (int)($stockQuery->fetchColumn() ?: 0);
        $query = $pdo->prepare("SELECT id,movement_sequence,source_warehouse_id,destination_warehouse_id,quantity,movement_type,
            reference_type,reference_id,reference_number,notes,COALESCE(occurred_at,created_at) effective_at
            FROM stock_movements WHERE item_id=? AND (source_warehouse_id=? OR destination_warehouse_id=?) AND is_voided=0
            ORDER BY DATE(COALESCE(occurred_at,created_at)),movement_sequence");
        $query->execute([$itemId, $warehouseId, $warehouseId]);
        $rows = [];
        $incomingTotal = 0;
        $outgoingTotal = 0;
        foreach ($query->fetchAll() as $movement) {
            // Revaluation records contain a paired OUT/IN solely for cost; physical stock stays fixed.
            if (in_array($movement['movement_type'], ['cost_adjustment', 'cost_adjustment_reversal'], true)) continue;
            $qty = (int)$movement['quantity'];
            $source = (string)$movement['source_warehouse_id'] === $warehouseId && $movement['movement_type'] !== 'transfer_receive';
            $destination = (string)$movement['destination_warehouse_id'] === $warehouseId && $movement['movement_type'] !== 'transfer_send';
            $incoming = $qty >= 0 ? ($destination ? $qty : 0) : ($source ? -$qty : 0);
            $outgoing = $qty >= 0 ? ($source ? $qty : 0) : ($destination ? -$qty : 0);
            if (!$incoming && !$outgoing) continue;
            $date = substr($movement['effective_at'], 0, 10);
            if ($date > $dateTo) { $closing -= $incoming - $outgoing; continue; }
            if ($date < $dateFrom) continue;
            $incomingTotal += $incoming;
            $outgoingTotal += $outgoing;
            $rows[] = [
                'id' => $movement['id'], 'itemId' => $itemId, 'itemName' => $item['name'],
                'movementSequence' => (int)$movement['movement_sequence'], 'quantity' => abs($qty),
                'movementType' => $movement['movement_type'], 'referenceType' => $movement['reference_type'],
                'referenceId' => $movement['reference_id'], 'referenceNumber' => $movement['reference_number'],
                'notes' => $movement['notes'], 'occurredAt' => $movement['effective_at'], 'createdAt' => $movement['effective_at'],
                'incoming' => $incoming, 'outgoing' => $outgoing,
            ];
        }
        $opening = $closing - $incomingTotal + $outgoingTotal;
        $running = $opening;
        foreach ($rows as &$row) { $running += $row['incoming'] - $row['outgoing']; $row['balance'] = $running; }
        unset($row);
        $payload += ['item' => $item, 'warehouse' => $warehouseMap[$warehouseId], 'dateFrom' => $dateFrom, 'dateTo' => $dateTo,
            'opening' => $opening, 'incoming' => $incomingTotal, 'outgoing' => $outgoingTotal, 'closing' => $closing, 'rows' => $rows];
    } else {
        throw new DomainException('Laporan persediaan tidak ditemukan', 404);
    }
    $pdo->commit();
    respondSuccess($payload);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($error->getMessage(), transactionExceptionStatus($error, 422));
}
