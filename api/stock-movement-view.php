<?php

function isStockValuationMovement(array $row): bool {
    return in_array($row['movement_type'], ['cost_adjustment', 'cost_adjustment_reversal'], true);
}

/** Project valuation OUT/IN pairs for display, without modifying the inventory ledger. */
function projectStockMovementValuations(array $rows): array {
    $groups = [];
    $keys = [];
    foreach ($rows as $index => $row) {
        if (!isStockValuationMovement($row)) continue;
        $source = (string)($row['source_warehouse_id'] ?? '');
        $destination = (string)($row['destination_warehouse_id'] ?? '');
        if (($source === '') === ($destination === '') || (int)$row['quantity'] <= 0) continue;
        $reference = (string)($row['reference_id'] ?? $row['correction_group_id'] ?? '');
        $pairKey = '';
        if (preg_match('/^(HPP:.+):(?:CANCEL_)?(?:OUT|IN)$/', (string)($row['idempotency_key'] ?? ''), $match)) {
            $pairKey = $match[1];
        }
        if ($reference === '' && $pairKey === '') continue;
        $key = json_encode([$row['movement_type'], $row['reference_type'] ?? '', $reference,
            $row['item_id'], $source ?: $destination, $pairKey]);
        $keys[$index] = $key;
        $groups[$key][] = $index;
    }

    $result = [];
    $consumed = [];
    foreach ($rows as $index => $row) {
        if (isset($consumed[$index])) continue;
        if (!isStockValuationMovement($row)) { $result[] = $row; continue; }
        $out = !empty($row['source_warehouse_id']) && empty($row['destination_warehouse_id']) ? $row : null;
        $in = !empty($row['destination_warehouse_id']) && empty($row['source_warehouse_id']) ? $row : null;
        $indices = isset($keys[$index]) ? $groups[$keys[$index]] : [];
        // Never guess a pair when a legacy reference contains several candidate movements.
        if (count($indices) === 2) {
            $otherIndex = $indices[0] === $index ? $indices[1] : $indices[0];
            $other = $rows[$otherIndex];
            if ((int)$row['quantity'] === (int)$other['quantity']) {
                if ($out && empty($other['source_warehouse_id']) && !empty($other['destination_warehouse_id'])) $in = $other;
                if ($in && empty($other['destination_warehouse_id']) && !empty($other['source_warehouse_id'])) $out = $other;
                if ($out && $in) $consumed[$otherIndex] = true;
            }
        }
        $row['valuation'] = [
            'quantity' => (int)$row['quantity'],
            'unitCostBefore' => isset($out['unit_cost']) ? (float)$out['unit_cost'] : null,
            'unitCostAfter' => isset($in['unit_cost']) ? (float)$in['unit_cost'] : null,
            'complete' => $out !== null && $in !== null,
        ];
        $row['_valuation_search'] = ($out['notes'] ?? '').' '.($in['notes'] ?? '');
        $row['notes'] = $row['movement_type'] === 'cost_adjustment' ? 'Penyesuaian HPP' : 'Pembatalan HPP';
        // A valuation belongs to one warehouse; it is not a warehouse transfer.
        $row['destination_warehouse_id'] = $in['destination_warehouse_id'] ?? $out['source_warehouse_id'] ?? $row['destination_warehouse_id'];
        $row['destination_name'] = $in['destination_name'] ?? $out['source_name'] ?? $row['destination_name'];
        $row['destination_branch_id'] = $in['destination_branch_id'] ?? $out['source_branch_id'] ?? $row['destination_branch_id'];
        $row['source_warehouse_id'] = null;
        $row['source_name'] = null;
        $row['source_branch_id'] = null;
        $row['unit_cost'] = $row['valuation']['unitCostAfter'];
        $result[] = $row;
    }
    return $result;
}
