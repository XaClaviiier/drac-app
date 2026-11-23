<?php

/** Physical movements for every item, projected onto each accessible warehouse. */
function inventoryMovementReport(PDO $pdo, array $warehouses, string $warehouseId, string $dateFrom, string $dateTo): array {
    $warehouseMap = array_column($warehouses, null, 'id');
    $warehouseIds = $warehouseId !== '' ? [$warehouseId] : array_keys($warehouseMap);
    if (!$warehouseIds) return [];
    $marks = implode(',', array_fill(0, count($warehouseIds), '?'));
    // Filter the complete ledger by period and scope before reading it. The recent
    // movements feed's 200-row limit must never truncate a historical report.
    $query = $pdo->prepare("SELECT m.id,m.movement_sequence,m.item_id,i.code,i.name,i.unit,
        m.source_warehouse_id,m.destination_warehouse_id,m.quantity,m.movement_type,
        m.reference_type,m.reference_id,m.reference_number,m.notes,
        COALESCE(m.occurred_at,m.created_at) effective_at
        FROM stock_movements m JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci
        WHERE m.is_voided=0 AND i.type='Persediaan' AND m.quantity<>0
        AND m.movement_type NOT IN ('cost_adjustment','cost_adjustment_reversal')
        AND COALESCE(m.occurred_at,m.created_at)>=? AND COALESCE(m.occurred_at,m.created_at)<=?
        AND (m.source_warehouse_id IN ($marks) OR m.destination_warehouse_id IN ($marks))
        ORDER BY DATE(COALESCE(m.occurred_at,m.created_at)),m.movement_sequence");
    $query->execute(array_merge([$dateFrom.' 00:00:00', $dateTo.' 23:59:59'], $warehouseIds, $warehouseIds));
    $visible = array_fill_keys($warehouseIds, true);
    $rows = [];
    while ($movement = $query->fetch()) {
        $quantity = (int)$movement['quantity'];
        $type = (string)$movement['movement_type'];
        $sourceId = (string)($movement['source_warehouse_id'] ?? '');
        $destinationId = (string)($movement['destination_warehouse_id'] ?? '');
        foreach (array_unique([$sourceId, $destinationId]) as $id) {
            if (!isset($visible[$id])) continue;
            $source = $sourceId === $id && $type !== 'transfer_receive';
            $destination = $destinationId === $id && $type !== 'transfer_send';
            $incoming = $quantity >= 0 ? ($destination ? $quantity : 0) : ($source ? -$quantity : 0);
            $outgoing = $quantity >= 0 ? ($source ? $quantity : 0) : ($destination ? -$quantity : 0);
            if (!$incoming && !$outgoing) continue;
            $warehouse = $warehouseMap[$id];
            $rows[] = [
                'id' => $movement['id'], 'movementSequence' => (int)$movement['movement_sequence'],
                'itemId' => $movement['item_id'], 'itemCode' => $movement['code'],
                'itemName' => $movement['name'], 'unit' => $movement['unit'],
                'warehouseId' => $id, 'warehouseName' => $warehouse['name'],
                'branchId' => $warehouse['branchId'], 'branchName' => $warehouse['branchName'],
                'movementType' => $type, 'referenceType' => $movement['reference_type'],
                'referenceId' => $movement['reference_id'], 'referenceNumber' => $movement['reference_number'],
                'notes' => $movement['notes'] ?? '', 'quantity' => abs($quantity),
                'occurredAt' => $movement['effective_at'], 'createdAt' => $movement['effective_at'],
                'incoming' => $incoming, 'outgoing' => $outgoing,
            ];
        }
    }
    return $rows;
}
