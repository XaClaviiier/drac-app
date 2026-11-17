<?php

function inventoryReceiptUnitCost(array $line): float {
    $quantity = (int)($line['qty'] ?? 0);
    if ($quantity <= 0) throw new InvalidArgumentException('Kuantitas penerimaan harus lebih dari nol');
    $gross = $quantity * max(0, (float)($line['unitPrice'] ?? 0));
    $percent = min(100, max(0, (float)($line['discountPercent'] ?? 0)));
    $discount = min($gross, max(0, (float)($line['discountAmount'] ?? $gross * $percent / 100)));
    return round(($gross - $discount) / $quantity, 4);
}

/** Moving average per item across all warehouses; quantities remain warehouse-specific. */
function inventoryAverageHistory(array $movements, float $defaultCost = 0): array {
    $defaultCost = max(0, $defaultCost);
    $warehouses = [];
    $movementCosts = [];
    $transferCosts = [];
    $globalQuantity = 0;
    $globalAverage = $defaultCost;
    $empty = static fn() => ['quantity' => 0, 'averageCost' => $defaultCost];
    foreach ($movements as $movement) {
        $quantity = abs((int)$movement['quantity']);
        if (!$quantity) continue;
        $type = (string)$movement['movement_type'];
        $source = (string)($movement['source_warehouse_id'] ?? '');
        $destination = (string)($movement['destination_warehouse_id'] ?? '');
        $out = $type === 'transfer_receive' ? '' : $source;
        $in = $type === 'transfer_send' ? '' : $destination;
        if ((int)$movement['quantity'] < 0) [$out, $in] = [$in, $out];
        $sourceState = $warehouses[$out !== '' ? $out : $source] ?? $empty();
        $storedCost = isset($movement['unit_cost']) ? max(0, (float)$movement['unit_cost']) : null;
        $originalCost = $movementCosts[(string)($movement['reversal_of_id'] ?? '')] ?? null;
        $transferKey = (string)($movement['reference_type'] ?? '').'|'.(string)($movement['reference_id'] ?? '');
        $sent = $transferCosts[$transferKey] ?? null;

        if ($originalCost !== null) {
            $cost = $originalCost;
        } elseif ($type === 'transfer_receive' && $sent && $sent['quantity'] > 0) {
            $cost = $sent['value'] / $sent['quantity'];
        } elseif ($out !== '' && $in !== '') {
            // A warehouse transfer does not change the global HPP.
            $cost = $globalAverage;
        } elseif ($out !== '' && !in_array($type, ['reversal', 'cost_adjustment', 'cost_adjustment_reversal'], true)) {
            $cost = $globalAverage;
        } else {
            $cost = $storedCost ?? $globalAverage;
        }
        $cost = round(max(0, $cost), 4);
        if ($type === 'transfer_send') {
            $transferCosts[$transferKey] = [
                'quantity' => ($sent['quantity'] ?? 0) + $quantity,
                'value' => ($sent['value'] ?? 0) + $quantity * $cost,
            ];
        }
        if ($out !== '') {
            $state = $warehouses[$out] ?? $empty();
            $remaining = $state['quantity'] - $quantity;
            if ($type === 'reversal' && $remaining > 0 && $state['quantity'] > 0) {
                // Return an incoming lot at its original cost, preserving the remaining weighted value.
                $state['averageCost'] = round(max(0, ($state['quantity'] * $state['averageCost'] - $quantity * $cost) / $remaining), 4);
            }
            $state['quantity'] = $remaining;
            $warehouses[$out] = $state;
        }
        if ($in !== '') {
            $state = $warehouses[$in] ?? $empty();
            // At zero/negative stock the next receipt establishes the cost of the newly available stock.
            $state['averageCost'] = $state['quantity'] > 0
                ? round(($state['quantity'] * $state['averageCost'] + $quantity * $cost) / ($state['quantity'] + $quantity), 4)
                : $cost;
            $state['quantity'] += $quantity;
            $warehouses[$in] = $state;
        }

        // Direct transfers move stock between warehouses in one movement and
        // therefore leave the global pool unchanged.
        if ($out !== '' && $in !== '') {
            // no global quantity change
        } elseif ($in !== '') {
            $globalAverage = $globalQuantity > 0
                ? round(($globalQuantity * $globalAverage + $quantity * $cost) / ($globalQuantity + $quantity), 4)
                : $cost;
            $globalQuantity += $quantity;
        } elseif ($out !== '') {
            $remainingGlobal = $globalQuantity - $quantity;
            if ($type === 'reversal' && $remainingGlobal > 0 && $globalQuantity > 0) {
                $globalAverage = round(max(0, ($globalQuantity * $globalAverage - $quantity * $cost) / $remainingGlobal), 4);
            }
            $globalQuantity = $remainingGlobal;
        }
        foreach ($warehouses as &$warehouseState) $warehouseState['averageCost'] = $globalAverage;
        unset($warehouseState);
        $movementCosts[(string)$movement['id']] = $storedCost ?? $cost;
    }
    return ['warehouses' => $warehouses, 'averageCost' => $globalAverage, 'quantity' => $globalQuantity, 'movementCosts' => $movementCosts, 'transferCosts' => $transferCosts];
}

function inventoryAverageForItem(PDO $pdo, string $itemId, string $date): array {
    return inventoryAverageForItems($pdo, [$itemId], $date)[$itemId] ?? inventoryAverageHistory([]) + ['defaultCost' => 0.0];
}

function inventoryAverageForItems(PDO $pdo, array $itemIds, string $date): array {
    if (!$itemIds) return [];
    $result = [];
    foreach (array_chunk(array_values(array_unique($itemIds)), 500) as $ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $items = $pdo->prepare("SELECT id,purchase_price FROM items WHERE id IN ($marks)");
        $items->execute($ids);
        $defaults = [];
        foreach ($items->fetchAll() as $item) $defaults[$item['id']] = max(0, (float)$item['purchase_price']);
        // Document times are placeholders (00:00/12:00/23:59), not the order in which goods moved.
        $movements = $pdo->prepare("SELECT id,item_id,source_warehouse_id,destination_warehouse_id,quantity,unit_cost,movement_type,reference_type,reference_id,reversal_of_id
            FROM stock_movements WHERE item_id IN ($marks) AND is_voided=0 AND COALESCE(occurred_at,created_at)<=?
            ORDER BY item_id,DATE(COALESCE(occurred_at,created_at)),movement_sequence");
        $movements->execute([...$ids, $date.' 23:59:59']);
        $grouped = [];
        foreach ($movements->fetchAll() as $movement) $grouped[$movement['item_id']][] = $movement;
        foreach ($defaults as $id => $default) $result[$id] = inventoryAverageHistory($grouped[$id] ?? [], $default) + ['defaultCost' => $default];
    }
    return $result;
}

/** Freeze new movement costs, including default-valued opening stock, without rewriting old movements. */
function inventoryMovementUnitCost(PDO $pdo, string $itemId, ?string $source, ?string $destination, string $type, string $referenceType, ?string $referenceId, string $date, ?string $reversalOfId): ?float {
    if (($source === null || $source === '') && ($destination === null || $destination === '')) return null;
    $history = inventoryAverageForItem($pdo, $itemId, $date);
    if ($reversalOfId && isset($history['movementCosts'][$reversalOfId])) return $history['movementCosts'][$reversalOfId];
    if (in_array($type, ['transfer_receive', 'reversal'], true)) {
        $sent = $history['transferCosts'][$referenceType.'|'.(string)$referenceId] ?? null;
        if ($sent && $sent['quantity'] > 0) return round($sent['value'] / $sent['quantity'], 4);
    }
    $warehouse = $source !== null && $source !== '' ? $source : $destination;
    return $history['averageCost'] ?? $history['defaultCost'];
}
