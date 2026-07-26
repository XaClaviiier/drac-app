<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC, receipt_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['receiptNumber'] = $r['receipt_number'];
            $r['supplierId'] = $r['supplier_id'];
            $r['supplierName'] = $r['supplier_name'];
            $r['doNumber'] = $r['do_number'];
            $r['branchId'] = $r['branch_id'];
            $r['receivedBy'] = $r['received_by'];
            $r['createdAt'] = $r['created_at'];
            // Load items
            $stmt = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $stmt->execute([$r['id']]);
            $items = $stmt->fetchAll();
            $r['items'] = array_map(function($i) {
                return [
                    'id' => (string)$i['id'],
                    'itemId' => $i['item_id'],
                    'itemCode' => $i['item_code'],
                    'itemName' => $i['item_name'],
                    'qty' => (int)$i['qty'],
                    'unit' => $i['unit'],
                    'qtyInvoiced' => (int)$i['qty_invoiced'],
                ];
            }, $items);
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $rId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO goods_receipts (id, receipt_number, date, supplier_id, supplier_name, do_number, status, notes, branch_id, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $rId, $d['receiptNumber'], $d['date'],
                $d['supplierId'], $d['supplierName'], $d['doNumber'] ?? '',
                $d['status'] ?? 'Draft', $d['notes'] ?? '',
                $d['branchId'] ?? 'BR-001', $d['receivedBy'] ?? null
            ]);

            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['items'] as $i) {
                    $iStmt->execute([$rId, $i['itemId'], $i['itemCode'] ?? '', $i['itemName'] ?? '', $i['qty'] ?? 0, $i['unit'] ?? '', $i['qtyInvoiced'] ?? 0]);
                }
            }

            // Auto-increment stock jika status Diterima
            if (($d['status'] ?? '') === 'Diterima' && !empty($d['items'])) {
                foreach ($d['items'] as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = 'Persediaan'")
                        ->execute([$i['qty'], $i['qty'], $i['itemId']]);
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $rId], 'Penerimaan disimpan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan penerimaan', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            // Get old status untuk logic stock
            $oldRow = $pdo->query("SELECT status FROM goods_receipts WHERE id = " . $pdo->quote($id))->fetch();
            $oldStatus = $oldRow['status'] ?? '';
            $oldItems = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $oldItems->execute([$id]);
            $oldItemsList = $oldItems->fetchAll();

            $stmt = $pdo->prepare("UPDATE goods_receipts SET receipt_number=?, date=?, supplier_id=?, supplier_name=?, do_number=?, status=?, notes=?, branch_id=?, received_by=? WHERE id=?");
            $stmt->execute([
                $d['receiptNumber'], $d['date'],
                $d['supplierId'], $d['supplierName'], $d['doNumber'] ?? '',
                $d['status'] ?? 'Draft', $d['notes'] ?? '',
                $d['branchId'] ?? 'BR-001', $d['receivedBy'] ?? null,
                $id
            ]);

            $pdo->prepare("DELETE FROM goods_receipt_items WHERE receipt_id = ?")->execute([$id]);
            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['items'] as $i) {
                    $iStmt->execute([$id, $i['itemId'], $i['itemCode'] ?? '', $i['itemName'] ?? '', $i['qty'] ?? 0, $i['unit'] ?? '', $i['qtyInvoiced'] ?? 0]);
                }
            }

            // Stock logic
            $newStatus = $d['status'] ?? 'Draft';
            $wasReceived = in_array($oldStatus, ['Diterima', 'Difakturkan', 'Sebagian']);
            $isReceived = in_array($newStatus, ['Diterima', 'Difakturkan', 'Sebagian']);

            if (!$wasReceived && $isReceived) {
                // Add stock
                foreach ($d['items'] as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = 'Persediaan'")
                        ->execute([$i['qty'], $i['qty'], $i['itemId']]);
                }
            } elseif ($wasReceived && !$isReceived) {
                // Reverse stock (pakai data lama)
                foreach ($oldItemsList as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock - ?, sellable_stock = sellable_stock - ? WHERE id = ? AND type = 'Persediaan'")
                        ->execute([$i['qty'], $i['qty'], $i['item_id']]);
                }
            }

            $pdo->commit();
            respondSuccess(null, 'Penerimaan diupdate');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update penerimaan', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        // Reverse stock kalau status Diterima
        $row = $pdo->query("SELECT status FROM goods_receipts WHERE id = " . $pdo->quote($id))->fetch();
        if ($row && $row['status'] === 'Diterima') {
            $items = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $items->execute([$id]);
            foreach ($items->fetchAll() as $i) {
                $pdo->prepare("UPDATE items SET stock = stock - ?, sellable_stock = sellable_stock - ? WHERE id = ? AND type = 'Persediaan'")
                    ->execute([$i['qty'], $i['qty'], $i['item_id']]);
            }
        }
        $pdo->prepare("DELETE FROM goods_receipts WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Penerimaan dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
