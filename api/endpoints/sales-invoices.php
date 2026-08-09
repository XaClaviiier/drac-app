<?php
$normalizeSalesInvoiceItems = static function (PDO $pdo, array $items): array {
    if (!$items) throw new InvalidArgumentException('Tambahkan minimal satu barang atau jasa ke faktur');
    $result=[];$total=0.0;$itemStmt=$pdo->prepare("SELECT id,code,name,receipt_description,type,is_active FROM items WHERE id=?");
    foreach($items as $line){
        $qty=max(1,(int)($line['qty']??1));$price=max(0,(float)($line['price']??0));$itemId=!empty($line['itemId'])?(string)$line['itemId']:null;
        if($itemId){$itemStmt->execute([$itemId]);$item=$itemStmt->fetch();if(!$item||!(bool)$item['is_active'])throw new InvalidArgumentException('Barang atau jasa faktur tidak ditemukan atau nonaktif');$code=(string)$item['code'];$name=(string)$item['name'];$description=trim((string)($line['description']??''))?:(string)($item['receipt_description']??'');$isStockItem=(string)$item['type']==='Persediaan';}
        else{$code=trim((string)($line['code']??''));$name=trim((string)($line['name']??''));$description=trim((string)($line['description']??''));$isStockItem=false;if($name==='')throw new InvalidArgumentException('Nama baris faktur manual wajib diisi');}
        $subtotal=$qty*$price;$total+=$subtotal;$result[]=compact('itemId','code','name','description','price','qty','subtotal','isStockItem');
    }
    if($total<=0)throw new InvalidArgumentException('Invoice dengan nilai Rp0 tidak dapat dibuat. Isi harga minimal satu layanan atau barang terlebih dahulu.');
    return ['items'=>$result,'total'=>$total];
};

$recordInitialCustomerPayment = static function (PDO $pdo, string $invoiceId, string $branchId, string $date, float $amount, string $method, array $actor): void {
    if($amount<=0)return;
    $column=$method==='Tunai'?'cash_account_id':'bank_account_id';
    $setting=$pdo->prepare("SELECT {$column} FROM branch_account_settings WHERE branch_id=?");$setting->execute([$branchId]);$accountId=(string)($setting->fetchColumn()?:'');
    $accountStmt=$pdo->prepare("SELECT id,name,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1");$accountStmt->execute([$accountId]);$account=$accountStmt->fetch();
    $expected=$method==='Tunai'?'cash':'bank';
    if(!$account||$account['account_type']!==$expected||($account['branch_id']&&$account['branch_id']!==$branchId))throw new InvalidArgumentException('Akun penerimaan pembayaran belum diatur dengan benar untuk cabang ini');
    $period=date('ym',strtotime($date));$pdo->prepare("INSERT IGNORE INTO customer_payment_sequences(branch_id,period,last_number) VALUES(?,?,0)")->execute([$branchId,$period]);
    $seq=$pdo->prepare("SELECT last_number FROM customer_payment_sequences WHERE branch_id=? AND period=? FOR UPDATE");$seq->execute([$branchId,$period]);$next=(int)$seq->fetchColumn()+1;$pdo->prepare("UPDATE customer_payment_sequences SET last_number=? WHERE branch_id=? AND period=?")->execute([$next,$branchId,$period]);
    $branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$branchId]);$paymentNumber='PAY-'.strtoupper(substr((string)$branch->fetchColumn(),0,1)).$period.str_pad((string)$next,3,'0',STR_PAD_LEFT);
    $pdo->prepare("INSERT INTO customer_payments(id,payment_number,invoice_id,date,amount,payment_method,account_id,account_name,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([generateId(),$paymentNumber,$invoiceId,$date,$amount,$method,$account['id'],$account['name'],'Pembayaran saat pembuatan faktur',$branchId,$actor['id']??null,$actor['name']??$actor['username']??null]);
};

switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = array_values(array_filter(
            $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll(),
            fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])
        ));
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
                $actor=$requestUser??requireAuthenticatedUser($pdo);requireAccessibleBranch($pdo,$actor,(string)$wo['branch_id']);
                if (!empty($wo['invoice_id'])) {
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
                if (!in_array($paymentMethod, ['Tunai', 'Transfer'], true)) {
                    throw new Exception('Metode pembayaran tidak valid');
                }
                $servicesStmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
                $servicesStmt->execute([$woId]);
                $services = $servicesStmt->fetchAll();
                $rawInvoiceItems = isset($d['items']) && is_array($d['items']) ? $d['items'] : array_map(function($service) {
                    return [
                        'itemId' => $service['item_id'], 'code' => $service['code'], 'name' => $service['name'],
                        'description' => $service['description'], 'price' => (float)$service['price'], 'qty' => (int)$service['qty'],
                    ];
                }, $services);
                $normalizedInvoice = $normalizeSalesInvoiceItems($pdo,$rawInvoiceItems);
                $invoiceItems=$normalizedInvoice['items'];$total=$normalizedInvoice['total'];
                if($payment>$total)throw new InvalidArgumentException('Pembayaran awal tidak boleh melebihi total faktur');
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
                    $insertItem->execute([
                        $invoiceId, $service['itemId'], $service['code'], $service['name'],
                        $service['description'], $service['price'], $service['qty'], $service['subtotal'],
                    ]);
                    if (!empty($service['itemId']) && $service['isStockItem']) {
                        adjustBranchStockAllowNegative($pdo, $wo['branch_id'], $service['itemId'], -$service['qty']);
                    }
                }

                $updateWo = $pdo->prepare("
                    UPDATE work_orders
                    SET status = 'Selesai', invoice_id = ?, invoice_number = ?
                    WHERE id = ?
                ");
                $updateWo->execute([$invoiceId, $invoiceNumber, $woId]);
                $recordInitialCustomerPayment($pdo,$invoiceId,(string)$wo['branch_id'],(string)($paymentDate??$date),$payment,$paymentMethod,$actor);

                $pdo->commit();
                respondSuccess([
                    'id' => $invoiceId,
                    'invoiceNumber' => $invoiceNumber,
                    'status' => $status,
                    'paymentMethod' => $paymentMethod,
                ], 'Faktur berhasil dibuat dari WO');
            }

            $invoiceId = $d['id'] ?? generateId();
            $branchId = (string)($d['branchId'] ?? '');
            $actor=$requestUser??requireAuthenticatedUser($pdo);requireAccessibleBranch($pdo,$actor,$branchId);
            if(!empty($d['woId']))throw new InvalidArgumentException('Gunakan proses Faktur dari WO agar pelanggan dan kendaraan terkunci dengan benar');
            $customerStmt=$pdo->prepare("SELECT id,customer_code,name FROM customers WHERE id=?");$customerStmt->execute([(string)($d['customerRefId']??'')]);$customer=$customerStmt->fetch();
            if(!$customer)throw new InvalidArgumentException('Pelanggan wajib dipilih dari data master');
            $invoiceNumber = nextDocumentNumber($pdo, 'sales_invoice', $branchId, $d['date'] ?? null);
            $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
            if (!in_array($paymentMethod, ['Tunai', 'Transfer'], true)) {
                throw new Exception('Metode pembayaran tidak valid');
            }
            $invoiceDate = (string)($d['date'] ?? date('Y-m-d'));
            $normalizedInvoice=$normalizeSalesInvoiceItems($pdo,is_array($d['items']??null)?$d['items']:[]);
            $invoiceTotal=$normalizedInvoice['total'];$initialPayment=max(0,(float)($d['payment']??0));
            if($initialPayment>$invoiceTotal)throw new InvalidArgumentException('Pembayaran awal tidak boleh melebihi total faktur');
            $paymentDate = (float)($d['payment'] ?? 0) > 0 ? ($d['paymentDate'] ?? $invoiceDate) : null;
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($invoiceDate > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
            if ($paymentDate && $paymentDate < $invoiceDate) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
            if (isBackdateReasonRequired($pdo) && ($invoiceDate < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') throw new Exception('Alasan tanggal mundur wajib diisi');
            $stmt = $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, payment_date, backdate_reason, payment_method, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $invoiceId,
                $invoiceNumber, $invoiceDate,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $d['vehicleInfo'] ?? '', $d['description'] ?? '',
                $invoiceTotal, $initialPayment, $paymentDate, $backdateReason ?: null, $paymentMethod,
                $initialPayment >= $invoiceTotal ? 'Lunas' : 'Belum Lunas', $d['age'] ?? 0,
                $d['woId'] ?? null, $d['woNumber'] ?? null,
                $branchId
            ]);

            // Stok dipotong di AKHIR, saat faktur dibuat dari WO.
            // Hanya item Persediaan; jasa dan header Group tidak mengurangi stok.
            if (!empty($normalizedInvoice['items'])) {
                $itemStmt = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedInvoice['items'] as $item) {
                    $itemStmt->execute([
                        $invoiceId, $item['itemId'], $item['code'],
                        $item['name'], $item['description'],
                        $item['price'], $item['qty'], $item['subtotal']
                    ]);
                    if (!empty($item['itemId']) && $item['isStockItem']) {
                        adjustBranchStockAllowNegative($pdo, $branchId, $item['itemId'], -$item['qty']);
                    }
                }
            }
            $recordInitialCustomerPayment($pdo,$invoiceId,$branchId,(string)($paymentDate??$invoiceDate),$initialPayment,$paymentMethod,$actor);

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
            $actor = $requestUser ?? requireAuthenticatedUser($pdo);
            requireAccessibleBranch($pdo, $actor, (string)$current['branch_id']);

            $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
            if (!in_array($paymentMethod, ['Tunai', 'Transfer'], true)) throw new Exception('Metode pembayaran tidak valid');
            $invoiceDate = (string)($d['date'] ?? date('Y-m-d'));
            $paymentDate = (float)($d['payment'] ?? 0) > 0 ? ($d['paymentDate'] ?? $invoiceDate) : null;
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($invoiceDate > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
            if ($paymentDate && $paymentDate < $invoiceDate) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
            if (isBackdateReasonRequired($pdo) && ($invoiceDate < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') throw new Exception('Alasan tanggal mundur wajib diisi');

            $oldDetails = $pdo->prepare("SELECT d.item_id,d.qty,i.type FROM sales_invoice_items d LEFT JOIN items i ON i.id=d.item_id WHERE d.invoice_id=?");
            $oldDetails->execute([$id]);
            foreach ($oldDetails->fetchAll() as $detail) {
                if (!empty($detail['item_id']) && (string)$detail['type']==='Persediaan') adjustBranchStockAllowNegative($pdo, $current['branch_id'], $detail['item_id'], (int)$detail['qty']);
            }

            $normalizedInvoice=$normalizeSalesInvoiceItems($pdo,isset($d['items'])&&is_array($d['items'])?$d['items']:[]);
            $items=$normalizedInvoice['items'];$total=$normalizedInvoice['total'];
            $recordedPaymentStmt=$pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE invoice_id=?");$recordedPaymentStmt->execute([$id]);$recordedPayment=(float)$recordedPaymentStmt->fetchColumn();
            $payment=max($recordedPayment,(float)$current['payment']);
            if($payment>$total)throw new InvalidArgumentException('Total faktur baru lebih kecil dari pembayaran yang sudah tercatat');
            $status = $payment >= $total ? 'Lunas' : 'Belum Lunas';

            // Invoice dari WO mengunci pelanggan, kendaraan, cabang, dan referensi WO.
            $customerRefId = !empty($current['wo_id']) ? $current['customer_ref_id'] : ($d['customerRefId'] ?? '');
            $customerId = !empty($current['wo_id']) ? $current['customer_id'] : ($d['customerId'] ?? '');
            $customerName = !empty($current['wo_id']) ? $current['customer_name'] : ($d['customerName'] ?? '');
            $vehicleInfo = !empty($current['wo_id']) ? $current['vehicle_info'] : ($d['vehicleInfo'] ?? '');
            $branchId = !empty($current['wo_id']) ? $current['branch_id'] : ($d['branchId'] ?? 'BR-001');
            requireAccessibleBranch($pdo, $actor, (string)$branchId);
            if (empty($current['wo_id'])) {
                if ($customerRefId === '') throw new InvalidArgumentException('Pelanggan wajib dipilih');
                $customerStmt = $pdo->prepare("SELECT id,customer_code,name FROM customers WHERE id=? AND is_active=1");
                $customerStmt->execute([$customerRefId]);
                $customer = $customerStmt->fetch();
                if (!$customer) throw new InvalidArgumentException('Pelanggan tidak ditemukan atau nonaktif');
                $customerId = $customer['customer_code'];
                $customerName = $customer['name'];
            }

            $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, payment_date=?, backdate_reason=?, payment_method=?, status=?, age=?, branch_id=? WHERE id=?");
            $stmt->execute([
                $current['invoice_number'], $invoiceDate, $customerRefId, $customerId, $customerName, $vehicleInfo,
                $d['description'] ?? '', $total, $payment, $paymentDate, $backdateReason ?: null, $paymentMethod,
                $status, $d['age'] ?? 0, $branchId, $id
            ]);

            $pdo->prepare("DELETE FROM sales_invoice_items WHERE invoice_id=?")->execute([$id]);
            $insertItem = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id,item_id,code,name,description,price,qty,subtotal) VALUES (?,?,?,?,?,?,?,?)");
            foreach ($items as $item) {
                $insertItem->execute([$id,$item['itemId'],$item['code'],$item['name'],$item['description'],$item['price'],$item['qty'],$item['subtotal']]);
                if (!empty($item['itemId']) && $item['isStockItem']) adjustBranchStockAllowNegative($pdo,$branchId,$item['itemId'],-$item['qty']);
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
            $invoiceStmt = $pdo->prepare("SELECT wo_id,payment,branch_id FROM sales_invoices WHERE id=? FOR UPDATE");
            $invoiceStmt->execute([$id]);
            $invoiceRow = $invoiceStmt->fetch();
            if (!$invoiceRow) throw new Exception('Faktur tidak ditemukan');
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), (string)$invoiceRow['branch_id']);
            $paymentCount=$pdo->prepare("SELECT COUNT(*) FROM customer_payments WHERE invoice_id=?");$paymentCount->execute([$id]);
            if ((float)$invoiceRow['payment'] > 0 || (int)$paymentCount->fetchColumn()>0) throw new Exception('Hapus pembayaran terlebih dahulu sebelum menghapus faktur');
            $linkedWoId = $invoiceRow['wo_id'];
            // Kembalikan stok sebelum detail ikut terhapus oleh ON DELETE CASCADE.
            $details = $pdo->prepare("
                SELECT d.item_id, d.qty, i.branch_id, m.type
                FROM sales_invoice_items d
                JOIN sales_invoices i ON i.id = d.invoice_id
                LEFT JOIN items m ON m.id = d.item_id
                WHERE d.invoice_id = ?
            ");
            $details->execute([$id]);
            foreach ($details->fetchAll() as $detail) {
                if (!empty($detail['item_id']) && (string)$detail['type']==='Persediaan') {
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
