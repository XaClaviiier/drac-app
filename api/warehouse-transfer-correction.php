<?php

// Called only by the transfer endpoint; all changes share its inventory transaction.
function correctReceivedWarehouseTransfer(PDO $pdo, array $actor, string $id, array $input): void {
    $reason = trim((string)($input['reason'] ?? ''));
    if ($reason === '' || mb_strlen($reason) > 255) throw new InvalidArgumentException('Alasan koreksi wajib diisi, maksimal 255 karakter');
    $revision = parseBoundedDecimalInteger($input['revision'] ?? null, '0', '2147483646', 'Versi transfer');
    if (!is_array($input['items'] ?? null) || !$input['items']) throw new InvalidArgumentException('Minimal satu barang wajib diisi');
    $quantities = [];
    foreach ($input['items'] as $line) {
        $itemId = (string)($line['itemId'] ?? '');
        if ($itemId === '' || isset($quantities[$itemId])) throw new InvalidArgumentException('Barang kosong atau berulang');
        $quantities[$itemId] = parseBoundedDecimalInteger($line['qty'] ?? null, '1', '2147483647', 'Kuantitas koreksi');
    }
    $authorization = lockInventoryMutationAuthorization($pdo, $actor, 'item:edit');
    assertLockedInventoryOwnerOrAdministrator($authorization);
    $actor = $authorization['actor'];
    $query = $pdo->prepare('SELECT * FROM warehouse_transfers WHERE id=? FOR UPDATE');
    $query->execute([$id]);
    $transfer = $query->fetch();
    if (!$transfer || $transfer['status'] !== 'Diterima') throw new DomainException('Hanya transfer yang sudah diterima seluruhnya dapat dikoreksi');
    if ((int)$transfer['revision'] !== $revision) throw new DomainException('Transfer sudah diubah. Muat ulang lalu periksa kembali koreksi Anda.', 409);
    $source = (string)$transfer['source_warehouse_id'];
    $destination = (string)$transfer['destination_warehouse_id'];
    $warehouses = lockActiveInventoryWarehouses($pdo, [$source, $destination]);
    foreach ($warehouses as $warehouse) assertLockedInventoryBranchAccess($authorization, (string)$warehouse['branch_id']);
    $query = $pdo->prepare('SELECT * FROM warehouse_transfer_items WHERE transfer_id=? ORDER BY id FOR UPDATE');
    $query->execute([$id]);
    $before = $query->fetchAll();
    $previous = [];
    foreach ($before as $line) {
        $sent = parseBoundedDecimalInteger($line['qty_sent'], '1', '2147483647', 'Kuantitas kirim tersimpan');
        $received = parseBoundedDecimalInteger($line['qty_received'], '0', (string)$sent, 'Kuantitas terima tersimpan');
        if ($sent !== $received) throw new DomainException('Rincian transfer belum diterima seluruhnya');
        $previous[(string)$line['item_id']] = $sent;
    }
    if (!$previous) throw new DomainException('Rincian transfer tersimpan kosong');
    $deltas = [];
    foreach (array_unique(array_merge(array_keys($previous), array_keys($quantities))) as $itemId) {
        $delta = ($quantities[$itemId] ?? 0) - ($previous[$itemId] ?? 0);
        if ($delta !== 0) $deltas[$itemId] = $delta;
    }
    if (!$deltas) throw new InvalidArgumentException('Belum ada perubahan rincian barang');
    $itemIds = array_keys($deltas);
    sort($itemIds, SORT_STRING);
    $placeholders = implode(',', array_fill(0, count($itemIds), '?'));
    $itemQuery = $pdo->prepare("SELECT id,type FROM items WHERE id IN ($placeholders) ORDER BY id FOR UPDATE");
    $itemQuery->execute($itemIds);
    $storedItems = $itemQuery->fetchAll();
    if (count($storedItems) !== count($itemIds)) throw new DomainException('Master barang transfer tidak ditemukan');
    foreach ($storedItems as $item) if ($item['type'] !== 'Persediaan') throw new DomainException('Tipe barang transfer sudah berubah');
    // Existing inactive items may be reduced/removed; added or increased items must be active.
    $increased = array_keys(array_filter($deltas, static fn($delta) => $delta > 0));
    $masters = $increased ? lockActiveInventoryItems($pdo, $increased) : [];
    $stock = $pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE');
    foreach ($deltas as $itemId => $delta) {
        $warehouseId = $delta > 0 ? $source : $destination;
        $stock->execute([$warehouseId, $itemId]);
        $available = (int)($stock->fetchColumn() ?: 0);
        if ($available < abs($delta)) throw new DomainException('Koreksi ditolak: stok barang '.$itemId.' di '.$warehouses[$warehouseId]['name'].' tinggal '.$available.', diperlukan '.abs($delta));
    }
    foreach ($deltas as $itemId => $delta) {
        adjustWarehouseStockAllowNegative($pdo, $source, (string)$warehouses[$source]['branch_id'], (string)$itemId, -$delta);
        adjustWarehouseStockAllowNegative($pdo, $destination, (string)$warehouses[$destination]['branch_id'], (string)$itemId, $delta);
        // A correction moves only the difference, preserving the original send/receive history.
        recordStockMovement($pdo, (string)$itemId, $delta > 0 ? $source : $destination, $delta > 0 ? $destination : $source, abs($delta), 'reversal', 'warehouse_transfer', $id, (string)$transfer['transfer_number'], 'Koreksi transfer: '.$reason, (string)$actor['id']);
    }
    $delete = $pdo->prepare('DELETE FROM warehouse_transfer_items WHERE transfer_id=? AND item_id=?');
    $update = $pdo->prepare('UPDATE warehouse_transfer_items SET qty_sent=?,qty_received=? WHERE transfer_id=? AND item_id=?');
    $insert = $pdo->prepare('INSERT INTO warehouse_transfer_items(transfer_id,item_id,item_code,item_name,category_name,unit,qty_sent,qty_received) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($previous as $itemId => $qty) if (!isset($quantities[$itemId])) $delete->execute([$id, $itemId]);
    foreach ($quantities as $itemId => $qty) {
        if (isset($previous[$itemId])) $update->execute([$qty, $qty, $id, $itemId]);
        else {
            $item = $masters[$itemId];
            $insert->execute([$id, $itemId, $item['code'], $item['name'], $item['category_name'], $item['unit'], $qty, $qty]);
        }
    }
    $query->execute([$id]);
    $after = $query->fetchAll();
    $pdo->prepare('UPDATE warehouse_transfers SET revision=revision+1 WHERE id=?')->execute([$id]);
    $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('warehouse_transfer',?,?,'correct',?,?,?,?)")->execute([
        $id, $transfer['transfer_number'], $reason,
        json_encode(['before' => $before, 'after' => $after, 'revisionBefore' => $revision, 'revisionAfter' => $revision + 1], JSON_THROW_ON_ERROR),
        $actor['id'], $actor['name'] ?? $actor['username'],
    ]);
}
