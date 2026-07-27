<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['customerRefId'] = $r['customer_ref_id'];
            $r['customerId'] = $r['customer_id'];
            $r['customerName'] = $r['customer_name'];
            $r['vehicleInfo'] = $r['vehicle_info'];
            $r['total'] = (float)$r['total'];
            $r['payment'] = (float)$r['payment'];
            $r['age'] = (int)$r['age'];
            $r['woId'] = $r['wo_id'];
            $r['woNumber'] = $r['wo_number'];
            $r['branchId'] = $r['branch_id'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $invoiceId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $invoiceId,
                $d['invoiceNumber'], $d['date'],
                $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
                $d['vehicleInfo'] ?? '', $d['description'] ?? '',
                $d['total'] ?? 0, $d['payment'] ?? 0,
                $d['status'] ?? 'Belum Lunas', $d['age'] ?? 0,
                $d['woId'] ?? null, $d['woNumber'] ?? null,
                $d['branchId'] ?? 'BR-001'
            ]);

            // Stok dipotong di AKHIR, saat faktur dibuat dari WO.
            // Hanya item Persediaan; jasa dan header Group tidak mengurangi stok.
            if (!empty($d['items'])) {
                $itemStmt = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stockStmt = $pdo->prepare("UPDATE items SET stock = GREATEST(0, stock - ?), sellable_stock = GREATEST(0, sellable_stock - ?) WHERE id = ? AND type = 'Persediaan'");
                foreach ($d['items'] as $item) {
                    $qty = (int)($item['qty'] ?? 1);
                    $price = (float)($item['price'] ?? 0);
                    $itemStmt->execute([
                        $invoiceId, $item['itemId'] ?? null, $item['code'] ?? '',
                        $item['name'] ?? '', $item['description'] ?? '',
                        $price, $qty, $price * $qty
                    ]);
                    if (!empty($item['itemId'])) {
                        $stockStmt->execute([$qty, $qty, $item['itemId']]);
                    }
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $invoiceId], 'Faktur disimpan dan stok diperbarui');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menyimpan faktur', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, status=?, age=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $d['invoiceNumber'], $d['date'],
            $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
            $d['vehicleInfo'] ?? '', $d['description'] ?? '',
            $d['total'] ?? 0, $d['payment'] ?? 0,
            $d['status'] ?? 'Belum Lunas', $d['age'] ?? 0,
            $d['branchId'] ?? 'BR-001', $id
        ]);
        respondSuccess(null, 'Faktur diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->beginTransaction();
        try {
            // Kembalikan stok sebelum detail ikut terhapus oleh ON DELETE CASCADE.
            $details = $pdo->prepare("SELECT item_id, qty FROM sales_invoice_items WHERE invoice_id = ?");
            $details->execute([$id]);
            $restore = $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = 'Persediaan'");
            foreach ($details->fetchAll() as $detail) {
                if (!empty($detail['item_id'])) {
                    $restore->execute([(int)$detail['qty'], (int)$detail['qty'], $detail['item_id']]);
                }
            }
            $pdo->prepare("DELETE FROM sales_invoices WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(null, 'Faktur dihapus dan stok dikembalikan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menghapus faktur', 500, $e->getMessage());
        }
        break;

    default: respondError('Method not allowed', 405);
}
