<?php
if ($method !== 'POST') respondError('Method not allowed', 405);

$sanitizeQuickCustomerName = static function ($value): string {
    $name = trim((string)$value);
    $name = preg_replace('/^(?:(?:reginv|reg)(?:\s+wo)?|wo)\b\s*[,;:\-]?\s*/iu', '', $name);
    $name = preg_replace('/^[,;:\-\s]+|[,;:\-\s]+$/u', '', (string)$name);
    $name = trim((string)preg_replace('/\s+/u', ' ', (string)$name));
    return function_exists('mb_strtoupper') ? mb_strtoupper($name, 'UTF-8') : strtoupper($name);
};

$d = getInput();
$pdo->beginTransaction();
try {
    $actor = requireUserPermission($pdo, 'wo:create');
    requireUserPermission($pdo, 'invoice:create');

    $branchId = trim((string)($d['branchId'] ?? ''));
    $date = (string)($d['date'] ?? date('Y-m-d'));
    if ($branchId === '' || $branchId === 'ALL') throw new InvalidArgumentException('Pilih cabang transaksi terlebih dahulu.');
    requireAccessibleBranch($pdo, $actor, $branchId);
    if ($date > date('Y-m-d')) throw new InvalidArgumentException('Tanggal transaksi tidak boleh melewati hari ini.');
    if ($date < date('Y-m-d')) {
        requireUserPermission($pdo, 'wo:backdate');
        requireUserPermission($pdo, 'invoice:backdate');
        requireUserPermission($pdo, 'payment:backdate');
    }

    $rawMethod = strtoupper(trim((string)($d['paymentMethod'] ?? '')));
    $methodMap = ['TUNAI' => 'Tunai', 'TF' => 'Transfer', 'TRANSFER' => 'Transfer'];
    $paymentMethod = $methodMap[$rawMethod] ?? null;
    if (!$paymentMethod) throw new InvalidArgumentException('Metode pembayaran wajib Tunai atau Transfer.');

    $customer = null;
    $customerRefId = trim((string)($d['customerRefId'] ?? ''));
    if ($customerRefId !== '') {
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id=? FOR UPDATE');
        $stmt->execute([$customerRefId]);
        $customer = $stmt->fetch();
    }
    $phone = preg_replace('/\D/', '', (string)($d['phone'] ?? ''));
    if (!$customer && $phone !== '') {
        foreach ($pdo->query('SELECT * FROM customers FOR UPDATE')->fetchAll() as $row) {
            if (preg_replace('/\D/', '', (string)$row['phone']) === $phone) { $customer = $row; break; }
        }
    }
    if (!$customer) {
        $name = $sanitizeQuickCustomerName($d['customerName'] ?? '');
        if ($name === '' || strlen($phone) < 8) throw new InvalidArgumentException('Nama dan nomor HP pelanggan wajib diisi.');
        $lastCode = $pdo->query("SELECT customer_code FROM customers WHERE customer_code REGEXP '^PLG-[0-9]+$' ORDER BY CAST(SUBSTRING(customer_code,5) AS UNSIGNED) DESC LIMIT 1 FOR UPDATE")->fetchColumn();
        $max = $lastCode ? (int)substr((string)$lastCode, 4) : 0;
        $customer = [
            'id' => generateId(), 'customer_code' => 'PLG-' . str_pad((string)($max + 1), 3, '0', STR_PAD_LEFT),
            'name' => $name, 'phone' => $phone, 'address' => '',
        ];
        $stmt = $pdo->prepare('INSERT INTO customers(id,customer_code,name,phone,email,address,branch_id,first_seen_branch_id) VALUES(?,?,?,?,?,?,?,?)');
        $stmt->execute([$customer['id'], $customer['customer_code'], $name, $phone, '', '', $branchId, $branchId]);
    }

    $plate = normalizeVehiclePlate((string)($d['plateNumber'] ?? ''));
    if ($plate === '') throw new InvalidArgumentException('Nomor plat wajib diisi.');
    $vehicle = null;
    foreach ($pdo->query('SELECT * FROM vehicles FOR UPDATE')->fetchAll() as $row) {
        if (normalizeVehiclePlate((string)$row['plate_number']) === $plate) { $vehicle = $row; break; }
    }
    if (!$vehicle) {
        $info = preg_split('/\s+/', trim((string)($d['vehicleInfo'] ?? '')), -1, PREG_SPLIT_NO_EMPTY);
        $year = 0; $yearIndex = -1;
        foreach ($info as $index => $part) if (preg_match('/^(19|20)\d{2}$/', $part)) { $year = (int)$part; $yearIndex = $index; break; }
        if (count($info) < 4 || $yearIndex < 2) throw new InvalidArgumentException('Data kendaraan wajib berformat Merek Model Tahun Warna.');
        $brandInput = $info[0];
        $modelInput = implode(' ', array_slice($info, 1, $yearIndex - 1));
        $colorInput = trim(implode(' ', array_slice($info, $yearIndex + 1)), " -\t\n\r\0\x0B");
        if ($colorInput === '') throw new InvalidArgumentException('Warna kendaraan wajib diisi.');
        $brandStmt = $pdo->prepare("SELECT id,name FROM vehicle_brands WHERE is_active=1 AND LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1");
        $brandStmt->execute([$brandInput]); $catalogBrand = $brandStmt->fetch();
        if (!$catalogBrand) throw new InvalidArgumentException('Merek kendaraan tidak tersedia pada Master Kendaraan.');
        $modelStmt = $pdo->prepare("SELECT id,name FROM vehicle_models WHERE brand_id=? AND is_active=1 AND LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1");
        $modelStmt->execute([$catalogBrand['id'],$modelInput]); $catalogModel = $modelStmt->fetch();
        if (!$catalogModel) throw new InvalidArgumentException('Tipe kendaraan tidak tersedia untuk merek yang dipilih.');
        if (strtolower($colorInput) === 'lainnya') throw new InvalidArgumentException('Warna "Lainnya" tidak diperbolehkan. Pilih warna kendaraan yang sebenarnya.');
        $colorStmt = $pdo->prepare("SELECT name FROM vehicle_colors WHERE is_active=1 AND LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1");
        $colorStmt->execute([$colorInput]); $catalogColor = $colorStmt->fetch();
        if (!$catalogColor) throw new InvalidArgumentException('Warna kendaraan tidak tersedia pada Master Kendaraan.');
        $vehicle = [
            'id' => generateId(), 'plate_number' => $plate, 'brand' => $catalogBrand['name'], 'model' => $catalogModel['name'],
            'brand_id' => $catalogBrand['id'], 'model_id' => $catalogModel['id'],
            'year' => $year, 'color' => $catalogColor['name'],
        ];
        $stmt = $pdo->prepare('INSERT INTO vehicles(id,plate_number,brand,model,brand_id,model_id,year,color,customer_id,customer_name,customer_code,phone,address,registration_date,notes,branch_id,first_seen_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$vehicle['id'], $plate, $vehicle['brand'], $vehicle['model'], $vehicle['brand_id'], $vehicle['model_id'], $year, $vehicle['color'], $customer['id'], $customer['name'], $customer['customer_code'], $customer['phone'], $customer['address'] ?? '', $date, '', $branchId, $branchId]);
    } elseif ((string)$vehicle['customer_id'] !== (string)$customer['id']) {
        $pdo->prepare('UPDATE vehicles SET customer_id=?,customer_name=?,customer_code=?,phone=?,address=? WHERE id=?')->execute([$customer['id'], $customer['name'], $customer['customer_code'], $customer['phone'], $customer['address'] ?? '', $vehicle['id']]);
    }
    if (trim((string)($vehicle['color'] ?? '')) === '' || strtolower(trim((string)$vehicle['color'])) === 'lainnya') {
        throw new InvalidArgumentException('Warna kendaraan belum jelas. Lengkapi warna sebenarnya pada Register Kendaraan sebelum membuat REGINV.');
    }
    assertNoActiveWorkOrder($pdo, (string)$vehicle['id']);

    $requested = is_array($d['services'] ?? null) ? $d['services'] : [];
    if (!$requested) throw new InvalidArgumentException('Tuliskan minimal satu kode layanan/barang.');
    $items = [];
    $lookup = $pdo->prepare('SELECT * FROM items WHERE is_active=1 AND (id=? OR UPPER(code)=UPPER(?)) LIMIT 1');
    foreach ($requested as $service) {
        $key = trim((string)($service['itemId'] ?? $service['code'] ?? $service['name'] ?? ''));
        $lookup->execute([$key, $key]);
        $item = $lookup->fetch();
        if (!$item) throw new InvalidArgumentException("Kode layanan/barang {$key} tidak ditemukan atau nonaktif.");
        $qty = max(1, (int)($service['qty'] ?? 1));
        $price = max(0, (float)$item['selling_price']);
        $items[] = ['itemId'=>$item['id'], 'code'=>$item['code'], 'name'=>$item['name'], 'description'=>$item['receipt_description'] ?? '', 'price'=>$price, 'qty'=>$qty, 'isStockItem'=>(string)$item['type']==='Persediaan'];
    }
    $total = array_reduce($items, fn($sum, $item) => $sum + $item['price'] * $item['qty'], 0);
    if ($total <= 0) throw new InvalidArgumentException('REGINV tidak dapat diproses karena total invoice Rp0. Gunakan layanan/barang yang memiliki harga.');

    $defaultColumn = $paymentMethod === 'Tunai' ? 'cash_account_id' : 'bank_account_id';
    $accountStmt = $pdo->prepare("SELECT {$defaultColumn} FROM branch_account_settings WHERE branch_id=?");
    $accountStmt->execute([$branchId]);
    $accountId = (string)($accountStmt->fetchColumn() ?: '');
    $account = $pdo->prepare('SELECT id,name,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1');
    $account->execute([$accountId]);
    $account = $account->fetch();
    $expected = $paymentMethod === 'Tunai' ? 'cash' : 'bank';
    if (!$account || $account['account_type'] !== $expected || ($account['branch_id'] && $account['branch_id'] !== $branchId)) {
        throw new InvalidArgumentException("Akun {$paymentMethod} belum dipetakan dengan benar untuk cabang ini.");
    }

    $vehicleInfo = trim($vehicle['brand'].' '.$vehicle['model'].($vehicle['year'] ? ' '.$vehicle['year'] : '').' - '.$vehicle['color']);
    $woId = generateId();
    $woNumber = nextDocumentNumber($pdo, 'work_order', $branchId, $date);
    $description = trim((string)($d['description'] ?? 'Transaksi cepat'));
    $backdateReason = $date < date('Y-m-d') ? 'Input transaksi tertinggal via Asisten AI REGINV' : null;
    $wo = $pdo->prepare("INSERT INTO work_orders(id,wo_number,date,backdate_reason,customer_ref_id,customer_id,customer_name,vehicle_ref_id,plate_number,vehicle_info,description,total,estimate_total,status,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Selesai',?,?,?,?)");
    $wo->execute([$woId,$woNumber,$date,$backdateReason,$customer['id'],$customer['customer_code'],$customer['name'],$vehicle['id'],$plate,$vehicleInfo,$description,$total,$total,'Dibuat via Asisten AI REGINV oleh '.($actor['name'] ?? '-'),$branchId,$actor['id'] ?? null,$actor['name'] ?? null]);
    $woItem = $pdo->prepare('INSERT INTO work_order_services(wo_id,item_id,code,name,description,price,qty,subtotal) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($items as $item) $woItem->execute([$woId,$item['itemId'],$item['code'],$item['name'],$item['description'],$item['price'],$item['qty'],$item['price']*$item['qty']]);

    $invoiceId = generateId();
    $invoiceNumber = nextDocumentNumber($pdo, 'sales_invoice', $branchId, $date);
    $invoice = $pdo->prepare("INSERT INTO sales_invoices(id,invoice_number,date,customer_ref_id,customer_id,customer_name,vehicle_info,description,total,payment,payment_date,backdate_reason,payment_method,status,age,wo_id,wo_number,branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Lunas',0,?,?,?)");
    $invoice->execute([$invoiceId,$invoiceNumber,$date,$customer['id'],$customer['customer_code'],$customer['name'],trim($vehicleInfo.' '.$plate),$description,$total,$total,$date,$backdateReason,$paymentMethod,$woId,$woNumber,$branchId]);
    $invoiceItem = $pdo->prepare('INSERT INTO sales_invoice_items(invoice_id,item_id,code,name,description,price,qty,subtotal) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($items as $item) {
        $invoiceItem->execute([$invoiceId,$item['itemId'],$item['code'],$item['name'],$item['description'],$item['price'],$item['qty'],$item['price']*$item['qty']]);
        if ($item['isStockItem']) adjustBranchStockAllowNegative($pdo, $branchId, $item['itemId'], -$item['qty']);
    }

    // Gunakan generator pembayaran yang sama dengan faktur biasa agar nomor tidak
    // bertabrakan dengan transaksi manual, migrasi, atau transaksi kasir lain.
    $paymentId = 'legacy-' . $invoiceId;
    $branchCodeStmt = $pdo->prepare('SELECT code FROM branches WHERE id=?');
    $branchCodeStmt->execute([$branchId]);
    $paymentNumber = nextCustomerPaymentNumber($pdo,$branchId,(string)$branchCodeStmt->fetchColumn(),$date);
    $payment = $pdo->prepare('INSERT INTO customer_payments(id,payment_number,invoice_id,date,amount,payment_method,account_id,account_name,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $payment->execute([$paymentId,$paymentNumber,$invoiceId,$date,$total,$paymentMethod,$account['id'],$account['name'],'Pembayaran penuh via REGINV',$branchId,$actor['id'] ?? null,$actor['name'] ?? null]);
    $pdo->prepare('UPDATE work_orders SET invoice_id=?,invoice_number=? WHERE id=?')->execute([$invoiceId,$invoiceNumber,$woId]);

    $pdo->commit();
    respondSuccess(['woId'=>$woId,'woNumber'=>$woNumber,'invoiceId'=>$invoiceId,'invoiceNumber'=>$invoiceNumber,'paymentId'=>$paymentId,'paymentNumber'=>$paymentNumber,'total'=>$total,'accountName'=>$account['name'],'customerName'=>$customer['name'],'plateNumber'=>$plate,'vehicleInfo'=>$vehicleInfo,'date'=>$date], 'REGINV berhasil dibuat');
} catch (InvalidArgumentException | DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($e->getMessage(), 422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError('Gagal membuat REGINV', 500, $e->getMessage());
}
