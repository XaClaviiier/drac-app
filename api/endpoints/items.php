<?php
switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
        $stockTable = $pdo->query("SHOW TABLES LIKE 'branch_item_stocks'")->fetch();
        $stockRows = $stockTable
            ? $pdo->query("SELECT branch_id, item_id, stock, sellable_stock FROM branch_item_stocks")->fetchAll()
            : [];
        $stocksByItem = [];
        foreach ($stockRows as $stockRow) {
            if (!isset($allowedBranchMap[(string)$stockRow['branch_id']])) continue;
            $stocksByItem[$stockRow['item_id']][$stockRow['branch_id']] = [
                'stock' => (int)$stockRow['stock'],
                'sellableStock' => (int)$stockRow['sellable_stock'],
            ];
        }
        foreach ($rows as &$r) {
            $r['categoryId'] = $r['category_id'];
            $r['categoryName'] = $r['category_name'];
            $r['sellableStock'] = (int)$r['sellable_stock'];
            $r['purchasePrice'] = (float)$r['purchase_price'];
            $r['sellingPrice'] = (float)$r['selling_price'];
            $r['isActive'] = (bool)$r['is_active'];
            $r['isQuickService'] = (bool)$r['is_quick_service'];
            $r['receiptDescription'] = $r['receipt_description'] ?? '';
            $r['branchId'] = $r['branch_id'];
            $r['branchStocks'] = $stocksByItem[$r['id']] ?? [];
            // Load group members
            if ($r['type'] === 'Group') {
                $stmt = $pdo->prepare("SELECT * FROM item_group_members WHERE group_item_id = ?");
                $stmt->execute([$r['id']]);
                $members = $stmt->fetchAll();
                $r['groupMembers'] = array_map(function($m) {
                    return [
                        'itemId' => $m['member_item_id'],
                        'itemCode' => $m['member_code'],
                        'itemName' => $m['member_name'],
                        'itemType' => $m['member_type'],
                        'qty' => (int)$m['qty'],
                        'unitPrice' => (float)$m['unit_price'],
                    ];
                }, $members);
            }
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $branchId = (string)($d['branchId'] ?? '');
        requireAccessibleBranch($pdo, $actor, $branchId);
        $type = (string)($d['type'] ?? '');
        if (!in_array($type, ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'], true)) respondError('Jenis barang/jasa tidak valid', 422);
        if (trim((string)($d['code'] ?? '')) === '' || trim((string)($d['name'] ?? '')) === '') respondError('Kode dan nama wajib diisi', 422);
        $barcode = trim((string)($d['barcode'] ?? ''));
        if ($barcode !== '') {
            $check = $pdo->prepare("SELECT id, name FROM items WHERE barcode = ? LIMIT 1");
            $check->execute([$barcode]);
            if ($duplicate = $check->fetch()) respondError("Barcode sudah dipakai oleh {$duplicate['name']}", 409);
        }
        $pdo->beginTransaction();
        try {
            $itemId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO items (id, code, name, category_id, category_name, type, brand, unit, stock, sellable_stock, purchase_price, selling_price, is_active, is_quick_service, description, receipt_description, barcode, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $itemId, $d['code'], $d['name'],
                ($d['categoryId'] ?? '') ?: null, $d['categoryName'] ?? '',
                $type, $d['brand'] ?? '', $d['unit'] ?? 'PCS',
                0, 0,
                max(0, (float)($d['purchasePrice'] ?? 0)), max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $d['isQuickService'] ?? 0,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                !empty(trim((string)($d['barcode'] ?? ''))) ? trim((string)$d['barcode']) : null,
                $branchId
            ]);

            $stockStmt = $pdo->prepare("
                INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = VALUES(stock), sellable_stock = VALUES(sellable_stock)
            ");
            $stockStmt->execute([
                $branchId, $itemId, 0, 0,
            ]);
            $warehouseStock = $pdo->prepare("
                INSERT INTO warehouse_stocks (warehouse_id,item_id,quantity,reserved_quantity)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),reserved_quantity=VALUES(reserved_quantity)
            ");
            $warehouseStock->execute([defaultWarehouseId($pdo,$branchId),$itemId,0,0]);

            // Insert group members
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $memberCheck = $pdo->prepare("SELECT code,name,type,selling_price FROM items WHERE id=? AND is_active=1");
                $seenMembers = [];
                foreach ($d['groupMembers'] as $m) {
                    $memberId = (string)($m['itemId'] ?? '');
                    if ($memberId === '' || $memberId === $itemId || isset($seenMembers[$memberId])) throw new InvalidArgumentException('Komponen paket tidak valid atau duplikat');
                    $memberCheck->execute([$memberId]);
                    $member = $memberCheck->fetch();
                    if (!$member || $member['type'] === 'Group') throw new InvalidArgumentException('Komponen paket harus barang/jasa aktif dan bukan paket lain');
                    $qty = max(1, (int)($m['qty'] ?? 1));
                    $memStmt->execute([$itemId, $memberId, $member['code'], $member['name'], $member['type'], $qty, max(0, (float)$member['selling_price'])]);
                    $seenMembers[$memberId] = true;
                }
            }
            $pdo->commit();
            respondSuccess(['id' => $itemId], 'Barang/Jasa ditambahkan');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menambah item', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $type = (string)($d['type'] ?? '');
        if (!in_array($type, ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'], true)) respondError('Jenis barang/jasa tidak valid', 422);
        if (trim((string)($d['code'] ?? '')) === '' || trim((string)($d['name'] ?? '')) === '') respondError('Kode dan nama wajib diisi', 422);
        $barcode = trim((string)($d['barcode'] ?? ''));
        if ($barcode !== '') {
            $check = $pdo->prepare("SELECT id, name FROM items WHERE barcode = ? AND id <> ? LIMIT 1");
            $check->execute([$barcode, $id]);
            if ($duplicate = $check->fetch()) respondError("Barcode sudah dipakai oleh {$duplicate['name']}", 409);
        }
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("UPDATE items SET code=?, name=?, category_id=?, category_name=?, type=?, brand=?, unit=?, purchase_price=?, selling_price=?, is_active=?, is_quick_service=?, description=?, receipt_description=?, barcode=? WHERE id=?");
            $stmt->execute([
                $d['code'], $d['name'],
                ($d['categoryId'] ?? '') ?: null, $d['categoryName'] ?? '',
                $type, $d['brand'] ?? '', $d['unit'] ?? 'PCS',
                max(0, (float)($d['purchasePrice'] ?? 0)), max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $d['isQuickService'] ?? 0,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                !empty(trim((string)($d['barcode'] ?? ''))) ? trim((string)$d['barcode']) : null,
                $id
            ]);

            // Refresh group members
            $pdo->prepare("DELETE FROM item_group_members WHERE group_item_id = ?")->execute([$id]);
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $memberCheck = $pdo->prepare("SELECT code,name,type,selling_price FROM items WHERE id=? AND is_active=1");
                $seenMembers = [];
                foreach ($d['groupMembers'] as $m) {
                    $memberId = (string)($m['itemId'] ?? '');
                    if ($memberId === '' || $memberId === $id || isset($seenMembers[$memberId])) throw new InvalidArgumentException('Komponen paket tidak valid atau duplikat');
                    $memberCheck->execute([$memberId]);
                    $member = $memberCheck->fetch();
                    if (!$member || $member['type'] === 'Group') throw new InvalidArgumentException('Komponen paket harus barang/jasa aktif dan bukan paket lain');
                    $qty = max(1, (int)($m['qty'] ?? 1));
                    $memStmt->execute([$id, $memberId, $member['code'], $member['name'], $member['type'], $qty, max(0, (float)$member['selling_price'])]);
                    $seenMembers[$memberId] = true;
                }
            }
            $pdo->commit();
            respondSuccess(null, 'Item diupdate');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update item', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $references = [
            'work_order_services' => 'item_id', 'sales_invoice_items' => 'item_id',
            'goods_receipt_items' => 'item_id', 'purchase_invoice_items' => 'item_id',
            'item_group_members' => 'member_item_id',
        ];
        foreach ($references as $table => $column) {
            $check = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$column}=?");
            $check->execute([$id]);
            if ((int)$check->fetchColumn() > 0) respondError('Barang/jasa sudah dipakai. Nonaktifkan agar histori transaksi tetap utuh.', 409);
        }
        $pdo->prepare("DELETE FROM items WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Item dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
