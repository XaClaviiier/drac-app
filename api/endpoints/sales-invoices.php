<?php
$pdo->exec("ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(20) NULL AFTER item_id");
$salesJournalMigration='backfill_sales_stock_journal_20260820_v1';
$migrationCheck=$pdo->prepare("SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?");$migrationCheck->execute([$salesJournalMigration]);
if(!(int)$migrationCheck->fetchColumn()){$pdo->beginTransaction();try{
    $pdo->exec("UPDATE sales_invoice_items d JOIN sales_invoices i ON i.id=d.invoice_id JOIN warehouses w ON w.branch_id=i.branch_id AND w.is_default=1 AND w.is_active=1 SET d.warehouse_id=w.id WHERE d.warehouse_id IS NULL OR d.warehouse_id=''");
    $pdo->exec("INSERT IGNORE INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,reference_type,reference_id,reference_number,notes,created_by,created_at)
        SELECT CONCAT('MOV-BFS-',d.id),d.item_id,d.warehouse_id,NULL,d.qty,'sale','sales_invoice',i.id,i.invoice_number,CONCAT('Migrasi penjualan ',i.invoice_number),NULL,CONCAT(i.date,' 12:00:00')
        FROM sales_invoice_items d JOIN sales_invoices i ON i.id=d.invoice_id JOIN items m ON m.id=d.item_id
        WHERE m.type='Persediaan' AND d.item_id IS NOT NULL AND d.warehouse_id IS NOT NULL");
    $pdo->prepare("INSERT INTO app_schema_migrations(migration_key) VALUES(?)")->execute([$salesJournalMigration]);$pdo->commit();
}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}}
$normalizeSalesInvoiceItems = static function (PDO $pdo, array $items): array {
    if (!$items) throw new InvalidArgumentException('Tambahkan minimal satu barang atau jasa ke faktur');
    $result=[];$total=0.0;$itemStmt=$pdo->prepare("SELECT id,code,name,receipt_description,type,is_active FROM items WHERE id=?");
    foreach($items as $line){
        $qty=max(1,(int)($line['qty']??1));$price=max(0,(float)($line['price']??0));$itemId=!empty($line['itemId'])?(string)$line['itemId']:null;
        if($itemId){$itemStmt->execute([$itemId]);$item=$itemStmt->fetch();if(!$item||!(bool)$item['is_active'])throw new InvalidArgumentException('Barang atau jasa faktur tidak ditemukan atau nonaktif');$code=(string)$item['code'];$name=(string)$item['name'];$description=trim((string)($line['description']??''))?:(string)($item['receipt_description']??'');$isStockItem=(string)$item['type']==='Persediaan';}
        else{$code=trim((string)($line['code']??''));$name=trim((string)($line['name']??''));$description=trim((string)($line['description']??''));$isStockItem=false;if($name==='')throw new InvalidArgumentException('Nama baris faktur manual wajib diisi');}
        $warehouseId=trim((string)($line['warehouseId']??''))?:null;
        $subtotal=$qty*$price;$total+=$subtotal;$result[]=compact('itemId','warehouseId','code','name','description','price','qty','subtotal','isStockItem');
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
    $branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$branchId]);
    $paymentNumber=nextCustomerPaymentNumber($pdo,$branchId,(string)$branch->fetchColumn(),$date);
    $pdo->prepare("INSERT INTO customer_payments(id,payment_number,invoice_id,date,amount,payment_method,account_id,account_name,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([generateId(),$paymentNumber,$invoiceId,$date,$amount,$method,$account['id'],$account['name'],'Pembayaran saat pembuatan faktur',$branchId,$actor['id']??null,$actor['name']??$actor['username']??null]);
};

$resolveSalesWarehouse=static function(PDO $pdo,string $branchId,?string $requested):string{
    $warehouseId=$requested?:defaultWarehouseId($pdo,$branchId);$stmt=$pdo->prepare("SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=1 AND is_sellable=1");$stmt->execute([$warehouseId,$branchId]);if(!$stmt->fetchColumn())throw new InvalidArgumentException('Gudang penjualan tidak valid, nonaktif, atau tidak diizinkan untuk penjualan');return $warehouseId;
};
$prepareSalesStockItems=static function(PDO $pdo,string $branchId,array $items)use($resolveSalesWarehouse):array{
    foreach($items as &$item){
        if(empty($item['itemId'])||empty($item['isStockItem']))continue;
        $item['warehouseId']=$resolveSalesWarehouse($pdo,$branchId,$item['warehouseId']??null);
    }
    unset($item);
    return $items;
};
$journalSale = static function(PDO $pdo,string $invoiceId,string $invoiceNumber,string $date,string $warehouseId,string $itemId,int $qty,bool $reverse,array $actor,?string $correctionGroupId=null,?string $reversalOfId=null,?string $idempotencyKey=null):string{
    return recordStockMovement($pdo,$itemId,$reverse?null:$warehouseId,$reverse?$warehouseId:null,abs($qty),$reverse?'reversal':'sale','sales_invoice',$invoiceId,$invoiceNumber,($reverse?'Pembalik penjualan ':'Penjualan ').$invoiceNumber,(string)($actor['id']??''),$date.' 12:00:00',$reversalOfId,$correctionGroupId,$idempotencyKey);
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
                'id' => (string)$detail['id'], 'itemId' => $detail['item_id'], 'warehouseId' => $detail['warehouse_id']??null, 'code' => $detail['code'],
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
                // Pembayaran awal dapat dibagi ke kas dan bank. Klien lama tetap
                // didukung melalui field payment/paymentMethod.
                if (array_key_exists('cashPayment', $d) || array_key_exists('transferPayment', $d)) {
                    $cashPayment = max(0, (float)($d['cashPayment'] ?? 0));
                    $transferPayment = max(0, (float)($d['transferPayment'] ?? 0));
                } else {
                    $legacyPayment = max(0, (float)($d['payment'] ?? 0));
                    $cashPayment = ($d['paymentMethod'] ?? 'Tunai') === 'Tunai' ? $legacyPayment : 0;
                    $transferPayment = ($d['paymentMethod'] ?? 'Tunai') === 'Tunai' ? 0 : $legacyPayment;
                }
                $payment = $cashPayment + $transferPayment;
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
                $paymentMethod = $cashPayment > 0 && $transferPayment > 0 ? 'Campuran' : ($transferPayment > 0 ? 'Transfer' : 'Tunai');
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
                $invoiceItems=$prepareSalesStockItems($pdo,(string)$wo['branch_id'],$normalizedInvoice['items']);$total=$normalizedInvoice['total'];
                if($payment!==0.0 && abs($payment-$total)>0.001)throw new InvalidArgumentException('Jumlah Tunai + Transfer harus sama dengan total faktur, atau keduanya Rp0 untuk Belum Bayar');
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
                    (invoice_id, item_id, warehouse_id, code, name, description, price, qty, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($invoiceItems as $service) {
                    $insertItem->execute([
                        $invoiceId, $service['itemId'], $service['warehouseId'], $service['code'], $service['name'],
                        $service['description'], $service['price'], $service['qty'], $service['subtotal'],
                    ]);
                    if (!empty($service['itemId']) && $service['isStockItem']) {
                        $salesWarehouseId=$resolveSalesWarehouse($pdo,(string)$wo['branch_id'],$service['warehouseId']);
                        adjustWarehouseStockAllowNegative($pdo,$salesWarehouseId,(string)$wo['branch_id'],(string)$service['itemId'],-(int)$service['qty']);
                        $journalSale($pdo,$invoiceId,$invoiceNumber,$date,$salesWarehouseId,(string)$service['itemId'],(int)$service['qty'],false,$actor);
                    }
                }

                $updateWo = $pdo->prepare("
                    UPDATE work_orders
                    SET status = 'Selesai', invoice_id = ?, invoice_number = ?
                    WHERE id = ?
                ");
                $updateWo->execute([$invoiceId, $invoiceNumber, $woId]);
                $recordInitialCustomerPayment($pdo,$invoiceId,(string)$wo['branch_id'],(string)($paymentDate??$date),$cashPayment,'Tunai',$actor);
                $recordInitialCustomerPayment($pdo,$invoiceId,(string)$wo['branch_id'],(string)($paymentDate??$date),$transferPayment,'Transfer',$actor);

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
            $normalizedInvoice['items']=$prepareSalesStockItems($pdo,$branchId,$normalizedInvoice['items']);
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
                $itemStmt = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id, item_id, warehouse_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedInvoice['items'] as $item) {
                    $itemStmt->execute([
                        $invoiceId, $item['itemId'], $item['warehouseId'], $item['code'],
                        $item['name'], $item['description'],
                        $item['price'], $item['qty'], $item['subtotal']
                    ]);
                    if (!empty($item['itemId']) && $item['isStockItem']) {
                        $salesWarehouseId=$resolveSalesWarehouse($pdo,$branchId,$item['warehouseId']);
                        adjustWarehouseStockAllowNegative($pdo,$salesWarehouseId,$branchId,(string)$item['itemId'],-(int)$item['qty']);
                        $journalSale($pdo,$invoiceId,$invoiceNumber,$invoiceDate,$salesWarehouseId,(string)$item['itemId'],(int)$item['qty'],false,$actor);
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

            if ($action === 'identity') {
                if (empty($current['wo_id'])) throw new InvalidArgumentException('Koreksi terpadu hanya berlaku untuk faktur dari WO.');
                requireUserPermission($pdo, 'wo:edit');
                $reason = trim((string)($d['reason'] ?? ''));
                if ($reason === '') throw new InvalidArgumentException('Alasan koreksi wajib diisi.');
                [$customer, $vehicle] = resolveCustomerVehicle($pdo, (string)($d['customerRefId'] ?? ''), (string)($d['vehicleRefId'] ?? ''), true);
                $driverId = trim((string)($d['driverContactId'] ?? ''));
                $driver = null;
                if ($driverId !== '') {
                    $driverStmt = $pdo->prepare("SELECT id,name,phone FROM customer_people WHERE id=? AND customer_id=? AND is_active=1 FOR UPDATE");
                    $driverStmt->execute([$driverId, $customer['id']]);
                    $driver = $driverStmt->fetch();
                    if (!$driver) throw new InvalidArgumentException('Kontak supir tidak ditemukan pada customer tujuan.');
                }
                $woStmt = $pdo->prepare("SELECT * FROM work_orders WHERE id=? FOR UPDATE");
                $woStmt->execute([$current['wo_id']]);
                $wo = $woStmt->fetch();
                if (!$wo) throw new InvalidArgumentException('WO terkait tidak ditemukan.');
                $statusLog = json_decode((string)($wo['status_log'] ?? '[]'), true);
                if (!is_array($statusLog)) $statusLog = [];
                $statusLog[] = [
                    'from' => $wo['status'], 'to' => $wo['status'], 'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-', 'byUserName' => $actor['name'] ?? 'System',
                    'reason' => sprintf('Koreksi terpadu WO/faktur: %s. %s menjadi %s / %s.', $reason, $wo['customer_name'], $customer['name'], normalizeVehiclePlate($vehicle['plate_number'])),
                ];
                $vehicleInfo = trim(implode(' ', array_filter([$vehicle['brand'], $vehicle['model'], $vehicle['year'], '-', $vehicle['color']]))) . ' ' . normalizeVehiclePlate($vehicle['plate_number']);
                $pdo->prepare("UPDATE work_orders SET customer_ref_id=?,customer_id=?,customer_name=?,vehicle_ref_id=?,plate_number=?,vehicle_info=?,driver_contact_id=?,driver_name=?,driver_phone=?,status_log=? WHERE id=?")
                    ->execute([$customer['id'],$customer['customer_code'],$customer['name'],$vehicle['id'],normalizeVehiclePlate($vehicle['plate_number']),trim(implode(' ',array_filter([$vehicle['brand'],$vehicle['model'],$vehicle['year'],'-',$vehicle['color']]))),$driver['id']??null,$driver['name']??null,$driver['phone']??null,json_encode($statusLog),$wo['id']]);
                $pdo->prepare("UPDATE sales_invoices SET customer_ref_id=?,customer_id=?,customer_name=?,vehicle_info=? WHERE id=?")
                    ->execute([$customer['id'],$customer['customer_code'],$customer['name'],$vehicleInfo,$id]);
                $pdo->exec("CREATE TABLE IF NOT EXISTS sales_invoice_identity_audit_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY,invoice_id VARCHAR(64) NOT NULL,wo_id VARCHAR(64) NOT NULL,reason VARCHAR(255) NOT NULL,before_json LONGTEXT NULL,after_json LONGTEXT NULL,user_id VARCHAR(64) NULL,user_name VARCHAR(150) NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_invoice_identity_audit(invoice_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
                $pdo->prepare("INSERT INTO sales_invoice_identity_audit_logs(invoice_id,wo_id,reason,before_json,after_json,user_id,user_name) VALUES(?,?,?,?,?,?,?)")
                    ->execute([$id,$wo['id'],substr($reason,0,255),json_encode(['invoice'=>$current,'workOrder'=>$wo]),json_encode(['customerRefId'=>$customer['id'],'customerName'=>$customer['name'],'vehicleRefId'=>$vehicle['id'],'plateNumber'=>normalizeVehiclePlate($vehicle['plate_number']),'driverContactId'=>$driver['id']??null]),$actor['id']??null,$actor['name']??null]);
                $pdo->commit();
                respondSuccess(null, 'Identitas WO dan faktur berhasil dikoreksi tanpa mengubah pembayaran atau stok.');
                return;
            }

            $paymentMethod = (string)($d['paymentMethod'] ?? 'Tunai');
            if (!in_array($paymentMethod, ['Tunai', 'Transfer'], true)) throw new Exception('Metode pembayaran tidak valid');
            $invoiceDate = (string)($d['date'] ?? date('Y-m-d'));
            $paymentDate = (float)($d['payment'] ?? 0) > 0 ? ($d['paymentDate'] ?? $invoiceDate) : null;
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($invoiceDate > date('Y-m-d') || ($paymentDate && $paymentDate > date('Y-m-d'))) throw new Exception('Tanggal transaksi tidak boleh melewati hari ini');
            if ($paymentDate && $paymentDate < $invoiceDate) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
            if (isBackdateReasonRequired($pdo) && ($invoiceDate < date('Y-m-d') || ($paymentDate && $paymentDate < date('Y-m-d'))) && $backdateReason === '') throw new Exception('Alasan tanggal mundur wajib diisi');

            $oldDetails = $pdo->prepare("SELECT d.*,i.type FROM sales_invoice_items d LEFT JOIN items i ON i.id=d.item_id WHERE d.invoice_id=?");
            $oldDetails->execute([$id]);
            $oldDetailsList=$oldDetails->fetchAll();

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
            $items=$prepareSalesStockItems($pdo,(string)$branchId,$items);
            $oldStockLines=[];
            foreach($oldDetailsList as $detail){
                if(empty($detail['item_id'])||(string)$detail['type']!=='Persediaan')continue;
                $warehouse=(string)($detail['warehouse_id']?:defaultWarehouseId($pdo,(string)$current['branch_id']));
                $key=$warehouse.'|'.(string)$detail['item_id'];$oldStockLines[$key]=($oldStockLines[$key]??0)+(int)$detail['qty'];
            }
            $newStockLines=[];
            foreach($items as $item){
                if(empty($item['itemId'])||empty($item['isStockItem']))continue;
                $key=(string)$item['warehouseId'].'|'.(string)$item['itemId'];$newStockLines[$key]=($newStockLines[$key]??0)+(int)$item['qty'];
            }
            ksort($oldStockLines);ksort($newStockLines);
            $stockImpactChanged=$oldStockLines!==$newStockLines||(string)$current['branch_id']!==(string)$branchId||(string)$current['date']!==$invoiceDate;
            $correctionGroupId=$stockImpactChanged?'CORR-SI-'.date('YmdHis').'-'.substr(bin2hex(random_bytes(4)),0,8):null;
            if($stockImpactChanged){
                foreach($oldDetailsList as $detail){
                    if(empty($detail['item_id'])||(string)$detail['type']!=='Persediaan')continue;
                    $oldWarehouseId=(string)($detail['warehouse_id']?:defaultWarehouseId($pdo,(string)$current['branch_id']));
                    adjustWarehouseStockAllowNegative($pdo,$oldWarehouseId,(string)$current['branch_id'],(string)$detail['item_id'],(int)$detail['qty']);
                }
                $pdo->prepare("UPDATE stock_movements SET is_voided=1,voided_at=NOW(),voided_by=?,void_reason='Faktur diedit' WHERE reference_type='sales_invoice' AND reference_id=? AND is_voided=0")
                    ->execute([$actor['id']??null,$id]);
            }

            $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, payment_date=?, backdate_reason=?, payment_method=?, status=?, age=?, branch_id=? WHERE id=?");
            $stmt->execute([
                $current['invoice_number'], $invoiceDate, $customerRefId, $customerId, $customerName, $vehicleInfo,
                $d['description'] ?? '', $total, $payment, $paymentDate, $backdateReason ?: null, $paymentMethod,
                $status, $d['age'] ?? 0, $branchId, $id
            ]);

            $pdo->prepare("DELETE FROM sales_invoice_items WHERE invoice_id=?")->execute([$id]);
            $insertItem = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id,item_id,warehouse_id,code,name,description,price,qty,subtotal) VALUES (?,?,?,?,?,?,?,?,?)");
            foreach ($items as $lineIndex=>$item) {
                $insertItem->execute([$id,$item['itemId'],$item['warehouseId'],$item['code'],$item['name'],$item['description'],$item['price'],$item['qty'],$item['subtotal']]);
                if ($stockImpactChanged && !empty($item['itemId']) && $item['isStockItem']) {
                    $salesWarehouseId=(string)$item['warehouseId'];
                    adjustWarehouseStockAllowNegative($pdo,$salesWarehouseId,(string)$branchId,(string)$item['itemId'],-(int)$item['qty']);
                    $journalSale($pdo,$id,(string)$current['invoice_number'],$invoiceDate,$salesWarehouseId,(string)$item['itemId'],(int)$item['qty'],false,$actor,$correctionGroupId,null,$correctionGroupId.':'.$item['itemId'].':'.$salesWarehouseId.':'.$lineIndex.':apply');
                }
            }
            $afterSnapshot=['document'=>array_merge($current,['date'=>$invoiceDate,'description'=>$d['description']??'','total'=>$total,'payment'=>$payment,'status'=>$status,'branch_id'=>$branchId]),'items'=>$items];
            $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('sales_invoice',?,?,'update',?,?,?,?)")
                ->execute([$id,$current['invoice_number'],$stockImpactChanged?'Perubahan berdampak stok':'Perubahan non-stok',json_encode(['before'=>['document'=>$current,'items'=>$oldDetailsList],'after'=>$afterSnapshot],JSON_UNESCAPED_UNICODE),$actor['id']??null,$actor['name']??$actor['username']??null]);
            $pdo->commit();
            respondSuccess(null, 'Faktur dan stok berhasil diperbarui');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $deleteInput=getInput();
        $deleteReason=trim((string)($deleteInput['reason']??''))?:'Dihapus oleh pengguna';
        $pdo->beginTransaction();
        try {
            $invoiceStmt = $pdo->prepare("SELECT * FROM sales_invoices WHERE id=? FOR UPDATE");
            $invoiceStmt->execute([$id]);
            $invoiceRow = $invoiceStmt->fetch();
            if (!$invoiceRow) throw new Exception('Faktur tidak ditemukan');
            $deleteActor=$requestUser ?? requireAuthenticatedUser($pdo);
            requireAccessibleBranch($pdo, $deleteActor, (string)$invoiceRow['branch_id']);
            $paymentCount=$pdo->prepare("SELECT COUNT(*) FROM customer_payments WHERE invoice_id=?");$paymentCount->execute([$id]);
            if ((float)$invoiceRow['payment'] > 0 || (int)$paymentCount->fetchColumn()>0) throw new Exception('Hapus pembayaran terlebih dahulu sebelum menghapus faktur');
            $linkedWoId = $invoiceRow['wo_id'];
            // Kembalikan stok sebelum detail ikut terhapus oleh ON DELETE CASCADE.
            $details = $pdo->prepare("
                SELECT d.*, i.branch_id, m.type
                FROM sales_invoice_items d
                JOIN sales_invoices i ON i.id = d.invoice_id
                LEFT JOIN items m ON m.id = d.item_id
                WHERE d.invoice_id = ?
            ");
            $details->execute([$id]);
            $invoiceDetails=$details->fetchAll();
            foreach ($invoiceDetails as $detail) {
                if (!empty($detail['item_id']) && (string)$detail['type']==='Persediaan') {
                    $oldWarehouseId=(string)($detail['warehouse_id']?:defaultWarehouseId($pdo,(string)$detail['branch_id']));
                    adjustWarehouseStockAllowNegative($pdo,$oldWarehouseId,(string)$detail['branch_id'],(string)$detail['item_id'],(int)$detail['qty']);
                }
            }
            $snapshot=['document'=>$invoiceRow,'items'=>$invoiceDetails];
            $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('sales_invoice',?,?,'delete',?,?,?,?)")
                ->execute([$id,$invoiceRow['invoice_number'],substr($deleteReason,0,255),json_encode($snapshot,JSON_UNESCAPED_UNICODE),$deleteActor['id']??null,$deleteActor['name']??$deleteActor['username']??null]);
            $pdo->prepare("UPDATE stock_movements SET is_voided=1,voided_at=NOW(),voided_by=?,void_reason=? WHERE reference_type='sales_invoice' AND reference_id=? AND is_voided=0")
                ->execute([$deleteActor['id']??null,substr($deleteReason,0,255),$id]);
            $pdo->prepare("DELETE FROM sales_invoices WHERE id=?")->execute([$id]);
            // Bersihkan juga relasi yang tersimpan hanya melalui invoice_id (data lama).
            $pdo->prepare("UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL WHERE invoice_id=?")->execute([$id]);
            if ($linkedWoId) {
                $pdo->prepare("UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL WHERE id=?")->execute([$linkedWoId]);
            }
            $pdo->commit();
            respondSuccess(null, 'Faktur dihapus, stok dikembalikan, dan jejak tersimpan di Log Aktivitas');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    default: respondError('Method not allowed', 405);
}
