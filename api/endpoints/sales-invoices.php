<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        $detailRows = $pdo->query("SELECT * FROM sales_invoice_items ORDER BY id")->fetchAll();
        $detailsByInvoice = [];
        foreach ($detailRows as $detail) {
            $detailsByInvoice[$detail['invoice_id']][] = [
                'id' => (string)$detail['id'], 'itemId' => $detail['item_id'], 'code' => $detail['code'],
                'name' => $detail['name'], 'description' => $detail['description'],
                'price' => (float)$detail['price'], 'qty' => (int)$detail['qty'],
            ];
        }
        foreach ($rows as &$r) {
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['customerRefId'] = $r['customer_ref_id'];
            $r['customerId'] = $r['customer_id'];
            $r['customerName'] = $r['customer_name'];
            $r['vehicleInfo'] = $r['vehicle_info'];
            $r['total'] = (float)$r['total'];
            $r['payment'] = (float)$r['payment'];
            $r['paymentMethod'] = $r['payment_method'] ?? 'Tunai';
            $r['paymentDate'] = $r['payment_date'] ?? null;
            $r['backdateReason'] = $r['backdate_reason'] ?? null;
            $r['age'] = (int)$r['age'];
            $r['woId'] = $r['wo_id'];
            $r['woNumber'] = $r['wo_number'];
            $r['branchId'] = $r['branch_id'];
            $r['items'] = $detailsByInvoice[$r['id']] ?? [];
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
                $paymentDate = $payment > 0 ? ($d['paymentDate'] ?? $date) : null;
                $backdateReason = trim((string)($d['backdateReason'] ?? ''));
                if ($date > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) {
                    throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
                }
                if ($paymentDate && $paymentDate < $date) {
                    throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
                }
                if (isBackdateReasonRequired($pdo) && ($date < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') {
                    throw new Exception('Alasan tanggal mundur wajib diisi');
                }
                $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
                if (!in_array($paymentMethod, ['Tunai', 'QRIS/Transfer'], true)) {
                    throw new Exception('Metode pembayaran tidak valid');
                }
                $servicesStmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
                $servicesStmt->execute([$woId]);
                $services = $servicesStmt->fetchAll();
                $invoiceItems = isset($d['items']) && is_array($d['items']) ? $d['items'] : array_map(function($service) {
                    return [
                        'itemId' => $service['item_id'], 'code' => $service['code'], 'name' => $service['name'],
                        'description' => $service['description'], 'price' => (float)$service['price'], 'qty' => (int)$service['qty'],
                    ];
                }, $services);
                if (count($invoiceItems) === 0) throw new Exception('Tambahkan minimal satu barang atau jasa ke faktur');
                $total = array_reduce($invoiceItems, function($sum, $item) {
                    return $sum + max(0, (float)($item['price'] ?? 0)) * max(1, (int)($item['qty'] ?? 1));
                }, 0);
                $status = $payment >= $total ? 'Lunas' : 'Belum Lunas';
                $invoiceId = generateId();
                $invoiceNumber = nextDocumentNumber($pdo, 'sales_invoice', $wo['branch_id'], $date);

                $description = implode(', ', array_map(function($service) {
                    return !empty($service['description']) ? $service['description'] : $service['name'];
                }, $invoiceItems));

                $insertInvoice = $pdo->prepare("
                    INSERT INTO sales_invoices (
                        id, invoice_number, date, customer_ref_id, customer_id, customer_name,
                        vehicle_info, description, total, payment, payment_date, backdate_reason, payment_method, status, age,
                        wo_id, wo_number, branch_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                ");
                $insertInvoice->execute([
                    $invoiceId, $invoiceNumber, $date,
                    $wo['customer_ref_id'], $wo['customer_id'], $wo['customer_name'],
                    trim($wo['vehicle_info'] . ' ' . $wo['plate_number']),
                    $description, $total, $payment, $paymentDate, $backdateReason ?: null, $paymentMethod, $status,
                    $woId, $wo['wo_number'], $wo['branch_id'],
                ]);

                $insertItem = $pdo->prepare("
                    INSERT INTO sales_invoice_items
                    (invoice_id, item_id, code, name, description, price, qty, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($invoiceItems as $service) {
                    $qty = max(1, (int)($service['qty'] ?? 1));
                    $price = max(0, (float)($service['price'] ?? 0));
                    $insertItem->execute([
                        $invoiceId, $service['itemId'] ?? null, $service['code'] ?? '', $service['name'] ?? '',
                        $service['description'] ?? '', $price, $qty, $price * $qty,
                    ]);
                    if (!empty($service['itemId'])) {
                        adjustBranchStockAllowNegative($pdo, $wo['branch_id'], $service['itemId'], -$qty);
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
            $invoiceDate = (string)($d['date'] ?? date('Y-m-d'));
            $paymentDate = (float)($d['payment'] ?? 0) > 0 ? ($d['paymentDate'] ?? $invoiceDate) : null;
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($invoiceDate > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
            if ($paymentDate && $paymentDate < $invoiceDate) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
            if (isBackdateReasonRequired($pdo) && ($invoiceDate < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') throw new Exception('Alasan tanggal mundur wajib diisi');
            $stmt = $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, payment_date, backdate_reason, payment_method, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $invoiceId,
                $invoiceNumber, $invoiceDate,
                $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
                $d['vehicleInfo'] ?? '', $d['description'] ?? '',
                $d['total'] ?? 0, $d['payment'] ?? 0, $paymentDate, $backdateReason ?: null, $paymentMethod,
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
        $pdo->beginTransaction();
        try {
            $currentStmt = $pdo->prepare("SELECT * FROM sales_invoices WHERE id=? FOR UPDATE");
            $currentStmt->execute([$id]);
            $current = $currentStmt->fetch();
            if (!$current) throw new Exception('Faktur tidak ditemukan');

            $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
            if (!in_array($paymentMethod, ['Tunai', 'QRIS/Transfer'], true)) throw new Exception('Metode pembayaran tidak valid');
            $invoiceDate = (string)($d['date'] ?? date('Y-m-d'));
            $paymentDate = (float)($d['payment'] ?? 0) > 0 ? ($d['paymentDate'] ?? $invoiceDate) : null;
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($invoiceDate > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
            if ($paymentDate && $paymentDate < $invoiceDate) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
            if (isBackdateReasonRequired($pdo) && ($invoiceDate < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') throw new Exception('Alasan tanggal mundur wajib diisi');

            $oldDetails = $pdo->prepare("SELECT item_id, qty FROM sales_invoice_items WHERE invoice_id=?");
            $oldDetails->execute([$id]);
            foreach ($oldDetails->fetchAll() as $detail) {
                if (!empty($detail['item_id'])) adjustBranchStockAllowNegative($pdo, $current['branch_id'], $detail['item_id'], (int)$detail['qty']);
            }

            $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
            if (count($items) === 0) throw new Exception('Tambahkan minimal satu barang atau jasa');
            $total = array_reduce($items, function($sum, $item) {
                return $sum + max(0, (float)($item['price'] ?? 0)) * max(1, (int)($item['qty'] ?? 1));
            }, 0);
            $payment = min(max(0, (float)($d['payment'] ?? 0)), $total);
            $status = $payment >= $total ? 'Lunas' : 'Belum Lunas';

            // Invoice dari WO mengunci pelanggan, kendaraan, cabang, dan referensi WO.
            $customerRefId = !empty($current['wo_id']) ? $current['customer_ref_id'] : ($d['customerRefId'] ?? '');
            $customerId = !empty($current['wo_id']) ? $current['customer_id'] : ($d['customerId'] ?? '');
            $customerName = !empty($current['wo_id']) ? $current['customer_name'] : ($d['customerName'] ?? '');
            $vehicleInfo = !empty($current['wo_id']) ? $current['vehicle_info'] : ($d['vehicleInfo'] ?? '');
            $branchId = !empty($current['wo_id']) ? $current['branch_id'] : ($d['branchId'] ?? 'BR-001');

            $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, payment_date=?, backdate_reason=?, payment_method=?, status=?, age=?, branch_id=? WHERE id=?");
            $stmt->execute([
                $current['invoice_number'], $invoiceDate, $customerRefId, $customerId, $customerName, $vehicleInfo,
                $d['description'] ?? '', $total, $payment, $paymentDate, $backdateReason ?: null, $paymentMethod,
                $status, $d['age'] ?? 0, $branchId, $id
            ]);

            $pdo->prepare("DELETE FROM sales_invoice_items WHERE invoice_id=?")->execute([$id]);
            $insertItem = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id,item_id,code,name,description,price,qty,subtotal) VALUES (?,?,?,?,?,?,?,?)");
            foreach ($items as $item) {
                $qty = max(1, (int)($item['qty'] ?? 1));
                $price = max(0, (float)($item['price'] ?? 0));
                $insertItem->execute([$id, $item['itemId'] ?? null, $item['code'] ?? '', $item['name'] ?? '', $item['description'] ?? '', $price, $qty, $price * $qty]);
                if (!empty($item['itemId'])) adjustBranchStockAllowNegative($pdo, $branchId, $item['itemId'], -$qty);
            }
            $pdo->commit();
            respondSuccess(null, 'Faktur dan stok berhasil diperbarui');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->beginTransaction();
        try {
            $invoiceStmt = $pdo->prepare("SELECT wo_id, payment FROM sales_invoices WHERE id=? FOR UPDATE");
            $invoiceStmt->execute([$id]);
            $invoiceRow = $invoiceStmt->fetch();
            if (!$invoiceRow) throw new Exception('Faktur tidak ditemukan');
            if ((float)$invoiceRow['payment'] > 0) throw new Exception('Hapus pembayaran terlebih dahulu sebelum menghapus faktur');
            $linkedWoId = $invoiceRow['wo_id'];
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
            // Bersihkan juga relasi yang tersimpan hanya melalui invoice_id (data lama).
            $pdo->prepare("UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL WHERE invoice_id=?")->execute([$id]);
            if ($linkedWoId) {
                $pdo->prepare("UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL WHERE id=?")->execute([$linkedWoId]);
            }
            $pdo->commit();
            respondSuccess(null, 'Faktur dihapus dan stok dikembalikan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    default: respondError('Method not allowed', 405);
}
