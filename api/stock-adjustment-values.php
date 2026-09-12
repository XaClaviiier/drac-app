<?php
/** Validate target stock under the inventory mutation lock; never trust a client delta. */
function adjustmentLineValues(PDO $pdo, array $input, string $warehouseId, string $itemId): array {
    $target = null;
    $before = null;
    if (array_key_exists('targetQuantity', $input) && $input['targetQuantity'] !== null) {
        $target = parseBoundedDecimalInteger($input['targetQuantity'], '0', '2147483647', 'Stok akhir');
        $before = parseBoundedDecimalInteger($input['stockBefore'] ?? null, '-2147483647', '2147483647', 'Stok awal');
        $stmt = $pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE');
        $stmt->execute([$warehouseId, $itemId]);
        $current = (int)($stmt->fetchColumn() ?: 0);
        if ($current !== $before) throw new DomainException('Stok gudang berubah. Muat ulang data dan tentukan kembali stok akhir.', 409);
        $quantity = $target - $current;
    } else {
        $quantity = $input['quantity'] ?? null;
    }
    $quantity = parseBoundedDecimalInteger($quantity, '-2147483647', '2147483647', 'Kuantitas penyesuaian');
    $cost = (string)($input['unitCost'] ?? '0');
    if (!preg_match('/^\d{1,12}(\.\d{1,4})?$/D', $cost)) throw new InvalidArgumentException('Biaya satuan harus positif atau nol, maksimal 4 desimal.');
    $notes = (string)($input['lineNotes'] ?? '');
    if (strlen($notes) > 1000) throw new InvalidArgumentException('Keterangan barang terlalu panjang.');
    return [$quantity, $cost, $target, $before, $notes];
}
