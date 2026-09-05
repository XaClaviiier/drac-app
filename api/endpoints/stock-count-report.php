<?php
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
if ($method !== 'GET') respondError('Method not allowed', 405);

$date = trim((string)($_GET['date'] ?? ''));
$warehouseId = trim((string)($_GET['warehouseId'] ?? ''));
$branchId = trim((string)($_GET['branchId'] ?? 'ALL'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) respondError('Tanggal laporan tidak valid', 422);
if ($date > date('Y-m-d')) respondError('Tanggal laporan tidak boleh melewati hari ini', 422);
if ($warehouseId === '') respondError('Gudang wajib dipilih', 422);

$accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);
if(!$accessibleBranchIds)respondError('Gudang tidak ditemukan atau nonaktif',404);
$branchMarks=implode(',',array_fill(0,count($accessibleBranchIds),'?'));
$warehouseStmt = $pdo->prepare("SELECT w.id,w.code,w.name,w.branch_id,b.name branch_name,w.is_default
    FROM warehouses w JOIN branches b ON b.id=w.branch_id
    WHERE w.id=? AND w.branch_id IN ($branchMarks) AND w.is_active=1 AND w.is_system=0 LIMIT 1");
$warehouseStmt->execute(array_merge([$warehouseId],$accessibleBranchIds));
$warehouse = $warehouseStmt->fetch();
if (!$warehouse) respondError('Gudang tidak ditemukan atau nonaktif', 404);
if ($branchId !== 'ALL' && $branchId !== (string)$warehouse['branch_id']) respondError('Gudang bukan milik cabang yang dipilih', 422);

$items = $pdo->query("SELECT id,code,name,unit,category_id,category_name,brand
    FROM items WHERE type='Persediaan' AND is_active=1
    ORDER BY category_name,name,code")->fetchAll();
$categoryUsage = [];
$usageRows = $pdo->query("SELECT COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori') category_name,
        COALESCE(SUM(ABS(d.qty)),0) usage_count
    FROM sales_invoice_items d
    JOIN items i ON i.id=d.item_id COLLATE utf8mb4_unicode_ci
    WHERE i.type='Persediaan'
    GROUP BY COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori')")->fetchAll();
foreach ($usageRows as $usageRow) $categoryUsage[(string)$usageRow['category_name']] = (int)$usageRow['usage_count'];
usort($items, static function(array $left, array $right) use ($categoryUsage): int {
    $leftCategory = (string)($left['category_name'] ?: 'Tanpa Kategori');
    $rightCategory = (string)($right['category_name'] ?: 'Tanpa Kategori');
    $usageComparison = ($categoryUsage[$rightCategory] ?? 0) <=> ($categoryUsage[$leftCategory] ?? 0);
    return $usageComparison
        ?: strcasecmp($leftCategory, $rightCategory)
        ?: strcasecmp((string)$left['name'], (string)$right['name'])
        ?: strcasecmp((string)$left['code'], (string)$right['code']);
});
$quantities = array_fill_keys(array_map(fn($row) => (string)$row['id'], $items), 0);
$currentStmt = $pdo->prepare('SELECT item_id,quantity FROM warehouse_stocks WHERE warehouse_id=?');
$currentStmt->execute([$warehouseId]);
foreach ($currentStmt->fetchAll() as $row) $quantities[(string)$row['item_id']] = (int)$row['quantity'];
$rollback = function(string $itemId, int $delta) use (&$quantities): void {
    if (array_key_exists($itemId, $quantities)) $quantities[$itemId] += $delta;
};

// Penjualan dikembalikan hanya ke gudang aktual yang dipakai oleh tiap baris faktur.
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.qty) qty
    FROM sales_invoices i JOIN sales_invoice_items d ON d.invoice_id=i.id
    JOIN items it ON it.id=d.item_id COLLATE utf8mb4_unicode_ci
    WHERE i.branch_id=? AND d.warehouse_id=? AND i.date>? AND it.type='Persediaan'
      AND COALESCE(i.backdate_reason,'')<>'Input Cepat Historis (stok tidak dipotong)'
    GROUP BY d.item_id");
$stmt->execute([$warehouse['branch_id'], $warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], (int)$row['qty']);

// Penerimaan setelah tanggal laporan belum menjadi bagian dari saldo lampau.
$receiptStatuses = "'Diterima','Difakturkan','Sebagian'";
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.qty) qty FROM goods_receipts r
    JOIN goods_receipt_items d ON d.receipt_id=r.id
    WHERE r.warehouse_id=? AND r.date>? AND r.status IN ($receiptStatuses) GROUP BY d.item_id");
$stmt->execute([$warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], -(int)$row['qty']);
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.qty) qty FROM goods_receipts r
    JOIN goods_receipt_items d ON d.receipt_id=r.id
    WHERE r.source_type='Transfer Gudang' AND r.source_warehouse_id=? AND r.date>?
      AND r.status IN ($receiptStatuses) GROUP BY d.item_id");
$stmt->execute([$warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], (int)$row['qty']);

// Transfer gudang standar: qty kirim telah keluar dari sumber dan qty terima
// telah masuk ke tujuan.
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.qty_sent) sent,SUM(d.qty_received) received
    FROM warehouse_transfers t JOIN warehouse_transfer_items d ON d.transfer_id=t.id
    WHERE t.source_warehouse_id=? AND t.transfer_date>? AND t.status<>'Draft' GROUP BY d.item_id");
$stmt->execute([$warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], (int)$row['sent']);
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.qty_received) received
    FROM warehouse_transfers t JOIN warehouse_transfer_items d ON d.transfer_id=t.id
    WHERE t.destination_warehouse_id=? AND t.transfer_date>? AND t.status<>'Draft' GROUP BY d.item_id");
$stmt->execute([$warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], -(int)$row['received']);

// Penyesuaian berstatus Posted memakai tanggal dokumen sebagai tanggal efektif.
$stmt = $pdo->prepare("SELECT d.item_id,SUM(d.quantity) qty FROM stock_adjustments a
    JOIN stock_adjustment_items d ON d.adjustment_id=a.id
    WHERE d.warehouse_id=? AND a.adjustment_date>? AND a.status='Posted' GROUP BY d.item_id");
$stmt->execute([$warehouseId, $date]);
foreach ($stmt->fetchAll() as $row) $rollback((string)$row['item_id'], -(int)$row['qty']);

// Mutasi manual/legacy yang tidak berasal dari dokumen di atas.
$stmt = $pdo->prepare("SELECT item_id,source_warehouse_id,destination_warehouse_id,quantity
    FROM stock_movements WHERE is_voided=0 AND COALESCE(occurred_at,created_at)>CONCAT(?,' 23:59:59')
      AND movement_type IN ('transfer','adjustment')
      AND notes NOT LIKE 'STOCK_ADJUSTMENT:%'
      AND notes NOT LIKE 'CANCEL_STOCK_ADJUSTMENT:%'");
$stmt->execute([$date]);
foreach ($stmt->fetchAll() as $row) {
    if ((string)$row['source_warehouse_id'] === $warehouseId) $rollback((string)$row['item_id'], (int)$row['quantity']);
    if ((string)$row['destination_warehouse_id'] === $warehouseId) $rollback((string)$row['item_id'], -(int)$row['quantity']);
}

$rows = array_map(function($item) use ($quantities, $categoryUsage) {
    $categoryName = (string)($item['category_name'] ?: 'Tanpa Kategori');
    return [
        'id' => (string)$item['id'], 'code' => (string)$item['code'], 'name' => (string)$item['name'],
        'unit' => (string)($item['unit'] ?? ''), 'categoryId' => (string)($item['category_id'] ?? ''),
        'categoryName' => $categoryName, 'categoryUsageCount' => (int)($categoryUsage[$categoryName] ?? 0),
        'brand' => (string)($item['brand'] ?? ''),
        'quantity' => (int)($quantities[(string)$item['id']] ?? 0),
    ];
}, $items);

respondSuccess([
    'date' => $date,
    'warehouse' => ['id'=>(string)$warehouse['id'],'code'=>(string)$warehouse['code'],'name'=>(string)$warehouse['name']],
    'branch' => ['id'=>(string)$warehouse['branch_id'],'name'=>(string)$warehouse['branch_name']],
    'rows' => $rows,
]);
