<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['dueDate'] = $r['due_date'];
            $r['supplierId'] = $r['supplier_id'];
            $r['supplierName'] = $r['supplier_name'];
            $r['supplierInvoiceNumber'] = $r['supplier_invoice_number'];
            $r['subtotal'] = (float)$r['subtotal'];
            $r['discount'] = (float)$r['discount'];
            $r['tax'] = (float)$r['tax'];
            $r['total'] = (float)$r['total'];
            $r['paidAmount'] = (float)$r['paid_amount'];
            $r['branchId'] = $r['branch_id'];
            $r['createdAt'] = $r['created_at'];

            // Load items
            $stmt = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id = ?");
            $stmt->execute([$r['id']]);
            $r['items'] = array_map(function($i) {
                return [
                    'id' => (string)$i['id'],
                    'receiptId' => $i['receipt_id'],
                    'receiptNumber' => $i['receipt_number'],
                    'itemId' => $i['item_id'],
                    'itemCode' => $i['item_code'],
                    'itemName' => $i['item_name'],
                    'qty' => (int)$i['qty'],
                    'unit' => $i['unit'],
                    'unitPrice' => (float)$i['unit_price'],
                    'discount' => (float)$i['discount'],
                    'subtotal' => (float)$i['subtotal'],
                ];
            }, $stmt->fetchAll());

            // Get receipt IDs (unique)
            $r['receiptIds'] = array_values(array_unique(array_map(function($x) { return $x['receiptId']; }, $r['items'])));

            // Load payments
            $pStmt = $pdo->prepare("SELECT * FROM purchase_payments WHERE invoice_id = ? ORDER BY date");
            $pStmt->execute([$r['id']]);
            $r['payments'] = array_map(function($p) {
                return [
                    'id' => $p['id'],
                    'paymentNumber' => $p['payment_number'],
                    'date' => $p['date'],
                    'amount' => (float)$p['amount'],
                    'paymentMethod' => $p['payment_method'],
                    'bankAccount' => $p['bank_account'],
                    'notes' => $p['notes'],
                ];
            }, $pStmt->fetchAll());
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $piId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO purchase_invoices (id, invoice_number, date, due_date, supplier_id, supplier_name, supplier_invoice_number, subtotal, discount, tax, total, paid_amount, status, notes, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $piId, $d['invoiceNumber'], $d['date'], $d['dueDate'] ?? null,
                $d['supplierId'], $d['supplierName'],
                $d['supplierInvoiceNumber'] ?? '',
                $d['subtotal'] ?? 0, $d['discount'] ?? 0, $d['tax'] ?? 0,
                $d['total'] ?? 0, $d['paidAmount'] ?? 0,
                $d['status'] ?? 'Belum Lunas', $d['notes'] ?? '',
                $d['branchId'] ?? 'BR-001'
            ]);

            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO purchase_invoice_items (invoice_id, receipt_id, receipt_number, item_id, item_code, item_name, qty, unit, unit_price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['items'] as $i) {
                    $iStmt->execute([
                        $piId, $i['receiptId'] ?? null, $i['receiptNumber'] ?? '',
                        $i['itemId'], $i['itemCode'], $i['itemName'],
                        $i['qty'], $i['unit'] ?? '', $i['unitPrice'], $i['discount'] ?? 0, $i['subtotal']
                    ]);

                    // Update qty_invoiced di goods_receipt_items
                    if (!empty($i['receiptId'])) {
                        $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced = qty_invoiced + ? WHERE receipt_id = ? AND item_id = ?")
                            ->execute([$i['qty'], $i['receiptId'], $i['itemId']]);
                    }
                }
            }

            // Update status penerimaan
            if (!empty($d['receiptIds'])) {
                foreach ($d['receiptIds'] as $rid) {
                    $itemsRow = $pdo->prepare("SELECT SUM(qty) as tot, SUM(qty_invoiced) as inv FROM goods_receipt_items WHERE receipt_id = ?");
                    $itemsRow->execute([$rid]);
                    $r = $itemsRow->fetch();
                    $newStatus = 'Diterima';
                    if ($r['inv'] >= $r['tot']) $newStatus = 'Difakturkan';
                    elseif ($r['inv'] > 0) $newStatus = 'Sebagian';
                    $pdo->prepare("UPDATE goods_receipts SET status = ? WHERE id = ?")->execute([$newStatus, $rid]);
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $piId], 'Faktur pembelian dibuat');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan faktur pembelian', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE purchase_invoices SET date=?, due_date=?, supplier_invoice_number=?, subtotal=?, discount=?, tax=?, total=?, status=?, notes=? WHERE id=?");
        $stmt->execute([
            $d['date'], $d['dueDate'] ?? null,
            $d['supplierInvoiceNumber'] ?? '',
            $d['subtotal'] ?? 0, $d['discount'] ?? 0, $d['tax'] ?? 0,
            $d['total'] ?? 0, $d['status'] ?? 'Belum Lunas',
            $d['notes'] ?? '', $id
        ]);
        respondSuccess(null, 'Faktur pembelian diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        // Reverse qty_invoiced
        $items = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id = ?");
        $items->execute([$id]);
        foreach ($items->fetchAll() as $i) {
            if (!empty($i['receipt_id'])) {
                $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced = GREATEST(0, qty_invoiced - ?) WHERE receipt_id = ? AND item_id = ?")
                    ->execute([$i['qty'], $i['receipt_id'], $i['item_id']]);
            }
        }
        $pdo->prepare("DELETE FROM purchase_invoices WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Faktur pembelian dihapus');
        break;

    default:
        // ===== SUB-ACTION: /purchase-invoices/{id}/payments =====
        if ($action === 'payments' && $method === 'POST') {
            $d = getInput();
            $payId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO purchase_payments (id, payment_number, invoice_id, date, amount, payment_method, bank_account, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $payId, $d['paymentNumber'], $id, $d['date'],
                $d['amount'], $d['paymentMethod'] ?? 'Kas',
                $d['bankAccount'] ?? '', $d['notes'] ?? ''
            ]);
            // Recalculate paidAmount
            $sum = $pdo->prepare("SELECT SUM(amount) as tot FROM purchase_payments WHERE invoice_id = ?");
            $sum->execute([$id]);
            $paid = (float)($sum->fetch()['tot'] ?? 0);
            $inv = $pdo->prepare("SELECT total FROM purchase_invoices WHERE id = ?");
            $inv->execute([$id]);
            $total = (float)($inv->fetch()['total'] ?? 0);
            $status = $paid >= $total ? 'Lunas' : ($paid > 0 ? 'Sebagian' : 'Belum Lunas');
            $pdo->prepare("UPDATE purchase_invoices SET paid_amount = ?, status = ? WHERE id = ?")->execute([$paid, $status, $id]);
            respondSuccess(null, 'Pembayaran dicatat');
        }
        respondError('Method not allowed', 405);
}
