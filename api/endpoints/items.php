<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
        $stockTable = $pdo->query("SHOW TABLES LIKE 'branch_item_stocks'")->fetch();
        $stockRows = $stockTable
            ? $pdo->query("SELECT branch_id, item_id, stock, sellable_stock FROM branch_item_stocks")->fetchAll()
            : [];
        $stocksByItem = [];
        foreach ($stockRows as $stockRow) {
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
        $pdo->beginTransaction();
        try {
            $itemId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO items (id, code, name, category_id, category_name, type, brand, unit, stock, sellable_stock, purchase_price, selling_price, is_active, is_quick_service, description, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $itemId, $d['code'], $d['name'],
                $d['categoryId'] ?? '', $d['categoryName'] ?? '',
                $d['type'], $d['brand'] ?? '', $d['unit'] ?? 'PCS',
                $d['stock'] ?? 0, $d['sellableStock'] ?? 0,
                $d['purchasePrice'] ?? 0, $d['sellingPrice'] ?? 0,
                $d['isActive'] ?? 1, $d['isQuickService'] ?? 0,
                $d['description'] ?? '', $d['branchId'] ?? 'BR-001'
            ]);

            $stockStmt = $pdo->prepare("
                INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = VALUES(stock), sellable_stock = VALUES(sellable_stock)
            ");
            $stockStmt->execute([
                $d['branchId'] ?? 'BR-001', $itemId,
                max(0, (int)($d['stock'] ?? 0)), max(0, (int)($d['sellableStock'] ?? 0)),
            ]);

            // Insert group members
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['groupMembers'] as $m) {
                    $memStmt->execute([$itemId, $m['itemId'], $m['itemCode'], $m['itemName'], $m['itemType'], $m['qty'], $m['unitPrice']]);
                }
            }
            $pdo->commit();
            respondSuccess(['id' => $itemId], 'Barang/Jasa ditambahkan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menambah item', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("UPDATE items SET code=?, name=?, category_id=?, category_name=?, type=?, brand=?, unit=?, stock=?, sellable_stock=?, purchase_price=?, selling_price=?, is_active=?, is_quick_service=?, description=?, branch_id=? WHERE id=?");
            $stmt->execute([
                $d['code'], $d['name'],
                $d['categoryId'] ?? '', $d['categoryName'] ?? '',
                $d['type'], $d['brand'] ?? '', $d['unit'] ?? 'PCS',
                $d['stock'] ?? 0, $d['sellableStock'] ?? 0,
                $d['purchasePrice'] ?? 0, $d['sellingPrice'] ?? 0,
                $d['isActive'] ?? 1, $d['isQuickService'] ?? 0,
                $d['description'] ?? '', $d['branchId'] ?? 'BR-001', $id
            ]);

            $stockStmt = $pdo->prepare("
                INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = VALUES(stock), sellable_stock = VALUES(sellable_stock)
            ");
            $stockStmt->execute([
                $d['branchId'] ?? 'BR-001', $id,
                max(0, (int)($d['stock'] ?? 0)), max(0, (int)($d['sellableStock'] ?? 0)),
            ]);

            // Refresh group members
            $pdo->prepare("DELETE FROM item_group_members WHERE group_item_id = ?")->execute([$id]);
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['groupMembers'] as $m) {
                    $memStmt->execute([$id, $m['itemId'], $m['itemCode'], $m['itemName'], $m['itemType'], $m['qty'], $m['unitPrice']]);
                }
            }
            $pdo->commit();
            respondSuccess(null, 'Item diupdate');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update item', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM items WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Item dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
