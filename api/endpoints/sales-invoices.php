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
            $r['paymentMethod'] = $r['payment_method'] ?? 'Tunai';
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
            if ($id === 'from-work-order') {
                $woId = $d['woId'] ?? null;
                if (!$woId) throw new Exception('WO wajib dipilih');

                $woStmt = $pdo->prepare("SELECT * FROM work_orders WHERE id = ? FOR UPDATE");
                $woStmt->execute([$woId]);
                $wo = $woStmt->fetch();
                if (!$wo) throw new Exception('WO tidak ditemukan');
                if (!empty($wo['invoice_id']) || $wo['status'] === 'Dibayar') {
                    throw new Exception('WO sudah memiliki faktur');
                }
                if ($wo['status'] !== 'Selesai') {
                    throw new Exception('WO harus berstatus Selesai sebelum difakturkan');
                }

                $date = $d['date'] ?? date('Y-m-d');
                $payment = max(0, (float)($d['payment'] ?? 0));
                $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
                if (!in_array($paymentMethod, ['Tunai', 'QRIS/Transfer'], true)) {
                    throw new Exception('Metode pembayaran tidak valid');
                }
                $total = (float)$wo['total'];
                $status = $payment >= $total ? 'Lunas' : 'Belum Lunas';
                $invoiceId = generateId();
                $invoiceNumber = nextDocumentNumber($pdo, 'sales_invoice', $wo['branch_id'], $date);

                $servicesStmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
                $servicesStmt->execute([$woId]);
                $services = $servicesStmt->fetchAll();
                $description = implode(', ', array_map(function($service) {
                    return $service['name'];
                }, $services));

                $insertInvoice = $pdo->prepare("
                    INSERT INTO sales_invoices (
                        id, invoice_number, date, customer_ref_id, customer_id, customer_name,
                        vehicle_info, description, total, payment, payment_method, status, age,
                        wo_id, wo_number, branch_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                ");
                $insertInvoice->execute([
                    $invoiceId, $invoiceNumber, $date,
                    $wo['customer_ref_id'], $wo['customer_id'], $wo['customer_name'],
                    trim($wo['vehicle_info'] . ' ' . $wo['plate_number']),
                    $description, $total, $payment, $paymentMethod, $status,
                    $woId, $wo['wo_number'], $wo['branch_id'],
                ]);

                $insertItem = $pdo->prepare("
                    INSERT INTO sales_invoice_items
                    (invoice_id, item_id, code, name, description, price, qty, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($services as $service) {
                    $insertItem->execute([
                        $invoiceId, $service['item_id'], $service['code'], $service['name'],
                        $service['description'], $service['price'], $service['qty'], $service['subtotal'],
                    ]);
                    if (!empty($service['item_id'])) {
                        adjustBranchStockAllowNegative($pdo, $wo['branch_id'], $service['item_id'], -(int)$service['qty']);
                    }
                }

                $updateWo = $pdo->prepare("
                    UPDATE work_orders
                    SET status = 'Dibayar', invoice_id = ?, invoice_number = ?
                    WHERE id = ?
                ");
                $updateWo->execute([$invoiceId, $invoiceNumber, $woId]);

                $pdo->commit();
                respondSuccess([
                    'id' => $invoiceId,
                    'invoiceNumber' => $invoiceNumber,
                    'status' => $status,
                    'paymentMethod' => $paymentMethod,
                ], 'Faktur berhasil dibuat dari WO');
            }

            $invoiceId = $d['id'] ?? generateId();
            $branchId = $d['branchId'] ?? 'BR-001';
            $invoiceNumber = nextDocumentNumber($pdo, 'sales_invoice', $branchId, $d['date'] ?? null);
            $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
            if (!in_array($paymentMethod, ['Tunai', 'QRIS/Transfer'], true)) {
                throw new Exception('Metode pembayaran tidak valid');
            }
            $stmt = $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, payment_method, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $invoiceId,
                $invoiceNumber, $d['date'],
                $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
                $d['vehicleInfo'] ?? '', $d['description'] ?? '',
                $d['total'] ?? 0, $d['payment'] ?? 0, $paymentMethod,
                $d['status'] ?? 'Belum Lunas', $d['age'] ?? 0,
                $d['woId'] ?? null, $d['woNumber'] ?? null,
                $branchId
            ]);

            // Stok dipotong di AKHIR, saat faktur dibuat dari WO.
            // Hanya item Persediaan; jasa dan header Group tidak mengurangi stok.
            if (!empty($d['items'])) {
                $itemStmt = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['items'] as $item) {
                    $qty = (int)($item['qty'] ?? 1);
                    $price = (float)($item['price'] ?? 0);
                    $itemStmt->execute([
                        $invoiceId, $item['itemId'] ?? null, $item['code'] ?? '',
                        $item['name'] ?? '', $item['description'] ?? '',
                        $price, $qty, $price * $qty
                    ]);
                    if (!empty($item['itemId'])) {
                        adjustBranchStockAllowNegative($pdo, $branchId, $item['itemId'], -$qty);
                    }
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $invoiceId, 'invoiceNumber' => $invoiceNumber], 'Faktur disimpan dan stok diperbarui');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
        if (!in_array($paymentMethod, ['Tunai', 'QRIS/Transfer'], true)) respondError('Metode pembayaran tidak valid', 422);
        $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, payment_method=?, status=?, age=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $d['invoiceNumber'], $d['date'],
            $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
            $d['vehicleInfo'] ?? '', $d['description'] ?? '',
            $d['total'] ?? 0, $d['payment'] ?? 0, $paymentMethod,
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
            $details = $pdo->prepare("
                SELECT d.item_id, d.qty, i.branch_id
                FROM sales_invoice_items d
                JOIN sales_invoices i ON i.id = d.invoice_id
                WHERE d.invoice_id = ?
            ");
            $details->execute([$id]);
            foreach ($details->fetchAll() as $detail) {
                if (!empty($detail['item_id'])) {
                    adjustBranchStockAllowNegative($pdo, $detail['branch_id'], $detail['item_id'], (int)$detail['qty']);
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
