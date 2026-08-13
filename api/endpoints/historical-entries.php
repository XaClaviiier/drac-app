<?php
if ($method !== 'POST') respondError('Method not allowed', 405);

$d = getInput();
$pdo->beginTransaction();
try {
    $actor = requireUserPermission($pdo, 'wo:create');
    requireUserPermission($pdo, 'invoice:create');
    requireUserPermission($pdo, 'payment:create');

    $branchId = trim((string)($d['branchId'] ?? ''));
    $date = trim((string)($d['date'] ?? ''));
    if ($branchId === '' || $branchId === 'ALL') throw new InvalidArgumentException('Pilih cabang transaksi.');
    requireAccessibleBranch($pdo, $actor, $branchId);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new InvalidArgumentException('Tanggal transaksi tidak valid.');
    if ($date > date('Y-m-d')) throw new InvalidArgumentException('Tanggal tidak boleh melewati hari ini.');
    if ($date < date('Y-m-d')) {
        requireUserPermission($pdo, 'wo:backdate');
        requireUserPermission($pdo, 'invoice:backdate');
        requireUserPermission($pdo, 'payment:backdate');
    }

    $customerId = trim((string)($d['customerId'] ?? ''));
    $vehicleId = trim((string)($d['vehicleId'] ?? ''));
    $customerStmt = $pdo->prepare('SELECT * FROM customers WHERE id=?');
    $customerStmt->execute([$customerId]); $customer = $customerStmt->fetch();
    if (!$customer) throw new InvalidArgumentException('Pelanggan belum dipilih.');
    $vehicleStmt = $pdo->prepare('SELECT * FROM vehicles WHERE id=?');
    $vehicleStmt->execute([$vehicleId]); $vehicle = $vehicleStmt->fetch();
    if (!$vehicle) throw new InvalidArgumentException('Kendaraan belum dipilih.');
    if ((string)$vehicle['customer_id'] !== (string)$customer['id']) throw new InvalidArgumentException('Kendaraan bukan milik pelanggan yang dipilih.');

    $requested = is_array($d['items'] ?? null) ? $d['items'] : [];
    if (!$requested) throw new InvalidArgumentException('Minimal satu barang atau jasa harus dipilih.');
    $lookup = $pdo->prepare('SELECT * FROM items WHERE id=? AND is_active=1');
    $items = [];
    foreach ($requested as $line) {
        $lookup->execute([(string)($line['itemId'] ?? '')]); $item = $lookup->fetch();
        if (!$item) throw new InvalidArgumentException('Ada barang atau jasa yang tidak ditemukan/nonaktif.');
        $qty = max(1, (float)($line['qty'] ?? 1));
        $price = max(0, (float)($line['price'] ?? $item['selling_price']));
        $items[] = ['item'=>$item,'qty'=>$qty,'price'=>$price,'subtotal'=>$qty*$price];
    }
    $total = array_sum(array_column($items, 'subtotal'));
    if ($total <= 0) throw new InvalidArgumentException('Total transaksi historis harus lebih dari Rp0.');
    $paymentTotal = max(0, (float)($d['paymentTotal'] ?? $total));
    if (abs($paymentTotal - $total) > 0.01) throw new InvalidArgumentException('Total nota/pembayaran harus sama dengan total rincian barang dan jasa.');

    $accountStmt = $pdo->prepare('SELECT s.bank_account_id,a.name,a.account_type,a.branch_id FROM branch_account_settings s LEFT JOIN cash_accounts a ON a.id=s.bank_account_id WHERE s.branch_id=? AND a.is_active=1');
    $accountStmt->execute([$branchId]); $account = $accountStmt->fetch();
    if (!$account || $account['account_type'] !== 'bank' || ($account['branch_id'] && $account['branch_id'] !== $branchId)) throw new InvalidArgumentException('Rekening transfer cabang belum dikonfigurasi.');

    $vehicleInfo = trim($vehicle['brand'].' '.$vehicle['model'].($vehicle['year'] ? ' '.$vehicle['year'] : '').' - '.$vehicle['color']);
    $description = trim((string)($d['description'] ?? 'Transaksi historis')) ?: 'Transaksi historis';
    $reason = 'Input Cepat Historis (stok tidak dipotong)';
    $woId = generateId(); $woNumber = nextDocumentNumber($pdo, 'work_order', $branchId, $date);
    $stmt = $pdo->prepare("INSERT INTO work_orders(id,wo_number,date,backdate_reason,customer_ref_id,customer_id,customer_name,vehicle_ref_id,plate_number,vehicle_info,description,total,estimate_total,status,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Selesai',?,?,?,?)");
    $stmt->execute([$woId,$woNumber,$date,$reason,$customer['id'],$customer['customer_code'],$customer['name'],$vehicle['id'],$vehicle['plate_number'],$vehicleInfo,$description,$total,$total,$reason,$branchId,$actor['id']??null,$actor['name']??null]);
    $woItem = $pdo->prepare('INSERT INTO work_order_services(wo_id,item_id,code,name,description,price,qty,subtotal) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($items as $line) { $i=$line['item']; $woItem->execute([$woId,$i['id'],$i['code'],$i['name'],$i['receipt_description']??$i['description']??'',$line['price'],$line['qty'],$line['subtotal']]); }

    $invoiceId=generateId(); $invoiceNumber=nextDocumentNumber($pdo,'sales_invoice',$branchId,$date);
    $stmt=$pdo->prepare("INSERT INTO sales_invoices(id,invoice_number,date,customer_ref_id,customer_id,customer_name,vehicle_info,description,total,payment,payment_date,backdate_reason,payment_method,status,age,wo_id,wo_number,branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Lunas',0,?,?,?)");
    $stmt->execute([$invoiceId,$invoiceNumber,$date,$customer['id'],$customer['customer_code'],$customer['name'],trim($vehicleInfo.' '.$vehicle['plate_number']),$description,$total,$total,$date,$reason,'Transfer',$woId,$woNumber,$branchId]);
    $invoiceItem=$pdo->prepare('INSERT INTO sales_invoice_items(invoice_id,item_id,code,name,description,price,qty,subtotal) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($items as $line) { $i=$line['item']; $invoiceItem->execute([$invoiceId,$i['id'],$i['code'],$i['name'],$i['receipt_description']??$i['description']??'',$line['price'],$line['qty'],$line['subtotal']]); }
    // Sengaja tidak memanggil adjustBranchStock*: transaksi historis hanya mencatat penjualan.

    $branchCode=$pdo->prepare('SELECT code FROM branches WHERE id=?'); $branchCode->execute([$branchId]);
    $paymentId=generateId(); $paymentNumber=nextCustomerPaymentNumber($pdo,$branchId,(string)$branchCode->fetchColumn(),$date);
    $stmt=$pdo->prepare('INSERT INTO customer_payments(id,payment_number,invoice_id,date,amount,payment_method,account_id,account_name,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$paymentId,$paymentNumber,$invoiceId,$date,$total,'Transfer',$account['bank_account_id'],$account['name'],$reason,$branchId,$actor['id']??null,$actor['name']??null]);
    $pdo->prepare('UPDATE work_orders SET invoice_id=?,invoice_number=? WHERE id=?')->execute([$invoiceId,$invoiceNumber,$woId]);
    $pdo->commit();
    respondSuccess(['woNumber'=>$woNumber,'invoiceNumber'=>$invoiceNumber,'paymentNumber'=>$paymentNumber,'total'=>$total,'accountName'=>$account['name']], 'Transaksi historis berhasil disimpan tanpa memotong stok');
} catch (InvalidArgumentException | DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack(); respondError($e->getMessage(),422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack(); respondError('Gagal menyimpan transaksi historis',500,$e->getMessage());
}
