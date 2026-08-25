<?php
// Pembayaran pelanggan adalah transaksi kas tersendiri dan memiliki hak akses
// terpisah dari perubahan faktur.

$pdo->exec("CREATE TABLE IF NOT EXISTS customer_payment_sequences (
    branch_id VARCHAR(64) NOT NULL, period CHAR(4) NOT NULL, last_number INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS customer_payment_audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, payment_id VARCHAR(64) NULL,
    payment_number VARCHAR(40) NOT NULL, invoice_id VARCHAR(64) NOT NULL, action VARCHAR(30) NOT NULL,
    reason VARCHAR(255) NULL, snapshot_json LONGTEXT NULL, user_id VARCHAR(64) NULL,
    user_name VARCHAR(150) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_audit_invoice (invoice_id), INDEX idx_payment_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Pertahankan pembayaran faktur lama dan pastikan ringkasan faktur selalu sama
// dengan ledger sebelum data pembayaran ditampilkan.
reconcileCustomerPaymentLedger($pdo);

function paymentUserCanAccessBranch(PDO $pdo, array $user, string $branchId): bool {
    if (!empty($user['is_owner'])) return true;
    static $branchCache = [];
    $userId = (string)$user['id'];
    if (!isset($branchCache[$userId])) $branchCache[$userId] = getUserBranchIds($pdo, $userId);
    return in_array($branchId, $branchCache[$userId], true);
}

function recalculateCustomerInvoice(PDO $pdo, string $invoiceId): void {
    $sum = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE invoice_id=?");
    $sum->execute([$invoiceId]);
    $paid = (float)$sum->fetchColumn();
    $invoice = $pdo->prepare("SELECT total,date,wo_id FROM sales_invoices WHERE id=? FOR UPDATE");
    $invoice->execute([$invoiceId]);
    $row = $invoice->fetch();
    if (!$row) throw new Exception('Faktur tidak ditemukan');
    $paid = min($paid, (float)$row['total']);
    $status = $paid >= (float)$row['total'] ? 'Lunas' : 'Belum Lunas';
    $last = $pdo->prepare("SELECT date,payment_method FROM customer_payments WHERE invoice_id=? ORDER BY date DESC,created_at DESC LIMIT 1");
    $last->execute([$invoiceId]);
    $latest = $last->fetch();
    $methods = $pdo->prepare("SELECT COUNT(DISTINCT payment_method) FROM customer_payments WHERE invoice_id=? AND amount>0");
    $methods->execute([$invoiceId]);
    $methodCount = (int)$methods->fetchColumn();
    $method = $methodCount > 1 ? 'Campuran' : (string)($latest['payment_method'] ?? 'Tunai');
    if (!in_array($method, ['Tunai','Transfer','Campuran'], true)) $method = 'Transfer';
    $pdo->prepare("UPDATE sales_invoices SET payment=?,payment_date=?,payment_method=?,status=? WHERE id=?")
        ->execute([$paid,$latest['date'] ?? null,$method,$status,$invoiceId]);
    $pdo->prepare("UPDATE work_orders SET status='Selesai' WHERE invoice_id=?")->execute([$invoiceId]);
    if (!empty($row['wo_id'])) $pdo->prepare("UPDATE work_orders SET status='Selesai' WHERE id=?")->execute([$row['wo_id']]);
}

function writePaymentAudit(PDO $pdo, array $payment, string $action, string $reason, array $user): void {
    $pdo->prepare("INSERT INTO customer_payment_audit_logs(payment_id,payment_number,invoice_id,action,reason,snapshot_json,user_id,user_name) VALUES(?,?,?,?,?,?,?,?)")
        ->execute([$payment['id'] ?? null,$payment['payment_number'] ?? '',$payment['invoice_id'] ?? '',$action,substr($reason,0,255),json_encode($payment),$user['id'] ?? null,$user['name'] ?? $user['username'] ?? null]);
}

// Setoran cabang saat ini bersifat agregat, belum menunjuk pembayaran satu per satu.
// Karena itu pembayaran dikunci secara konservatif bila akun tunai yang sama sudah
// memiliki setoran aktif pada tanggal pembayaran atau setelahnya.
function paymentIsIncludedInDeposit(PDO $pdo, array $payment): bool {
    if (empty($payment['account_id'])) return false;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM branch_deposits
        WHERE branch_id=? AND source_account_id=?
          AND status IN ('Dikirim','Terverifikasi') AND date>=?");
    $stmt->execute([$payment['branch_id'],$payment['account_id'],$payment['date']]);
    return (int)$stmt->fetchColumn() > 0;
}

switch ($method) {
case 'GET':
    $user = requireUserPermission($pdo, 'payment:view');
    $rows = $pdo->query("SELECT p.*,i.invoice_number,i.customer_name,i.customer_id,i.vehicle_info,
                i.total invoice_total,i.payment invoice_paid,i.status invoice_status,
                EXISTS(SELECT 1 FROM branch_deposits d
                    WHERE d.branch_id=p.branch_id AND d.source_account_id=p.account_id
                      AND d.status IN ('Dikirim','Terverifikasi') AND d.date>=p.date) is_deposited
        FROM customer_payments p JOIN sales_invoices i ON i.id=p.invoice_id
        ORDER BY p.invoice_id,p.date ASC,p.created_at ASC,p.id ASC")->fetchAll();
    $running = [];$result = [];
    foreach ($rows as $row) {
        if (!paymentUserCanAccessBranch($pdo,$user,(string)$row['branch_id'])) continue;
        $invoiceKey = (string)$row['invoice_id'];
        $running[$invoiceKey] = ($running[$invoiceKey] ?? 0) + (float)$row['amount'];
        $row['paymentNumber']=$row['payment_number'];$row['invoiceId']=$row['invoice_id'];$row['invoiceNumber']=$row['invoice_number'];
        $row['customerName']=$row['customer_name'];$row['customerId']=$row['customer_id'];$row['vehicleInfo']=$row['vehicle_info'];
        $row['invoiceTotal']=(float)$row['invoice_total'];$row['invoicePaid']=(float)$row['invoice_paid'];$row['amount']=(float)$row['amount'];
        $row['balanceAfter']=max(0,(float)$row['invoice_total']-$running[$invoiceKey]);
        $row['paymentStatus']=$row['balanceAfter']<=0?'Lunas':'Cicilan';
        $row['paymentMethod']=$row['payment_method'];$row['accountId']=$row['account_id'];$row['accountName']=$row['account_name'];
        $row['branchId']=$row['branch_id'];$row['createdByName']=$row['created_by_name'];$row['createdAt']=$row['created_at'];
        $row['notes']=$row['notes']??'';$row['isDeposited']=(bool)($row['is_deposited']??false);
        $result[]=$row;
    }
    usort($result,fn($a,$b)=>strcmp(($b['date']??'').' '.($b['created_at']??''),($a['date']??'').' '.($a['created_at']??'')));
    respondSuccess($result);break;

case 'POST':
    $user = requireUserPermission($pdo, 'payment:create');
    $d=getInput();$pdo->beginTransaction();
    try {
        $invoiceId=(string)($d['invoiceId']??'');
        $invoiceStmt=$pdo->prepare("SELECT * FROM sales_invoices WHERE id=? FOR UPDATE");$invoiceStmt->execute([$invoiceId]);$invoice=$invoiceStmt->fetch();
        if(!$invoice)throw new Exception('Faktur tidak ditemukan');
        if(!paymentUserCanAccessBranch($pdo,$user,(string)$invoice['branch_id']))throw new Exception('Tidak memiliki akses ke cabang faktur');
        $amount=(float)($d['amount']??0);$outstanding=max(0,(float)$invoice['total']-(float)$invoice['payment']);
        if($amount<=0)throw new Exception('Nominal pembayaran harus lebih dari Rp0');
        if($amount>$outstanding)throw new Exception('Nominal pembayaran melebihi sisa tagihan');
        $date=(string)($d['date']??date('Y-m-d'));
        if($date<$invoice['date'])throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
        if($date>date('Y-m-d'))throw new Exception('Tanggal pembayaran tidak boleh melewati hari ini');
        if($date<date('Y-m-d')) requireUserPermission($pdo,'payment:backdate');
        $methodName=(string)($d['paymentMethod']??'Tunai');
        if(!in_array($methodName,['Tunai','Transfer'],true))throw new Exception('Metode pembayaran wajib Tunai atau Transfer');
        $accountId=(string)($d['accountId']??'');
        if($accountId===''){
            $column=$methodName==='Tunai'?'cash_account_id':'bank_account_id';
            $default=$pdo->prepare("SELECT {$column} FROM branch_account_settings WHERE branch_id=?");$default->execute([$invoice['branch_id']]);
            $accountId=(string)($default->fetchColumn()?:'');
        }
        $accountStmt=$pdo->prepare("SELECT id,name,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1");$accountStmt->execute([$accountId]);$account=$accountStmt->fetch();
        if(!$account)throw new Exception('Akun penerimaan belum diatur untuk cabang faktur');
        $expected=$methodName==='Tunai'?'cash':'bank';
        if($account['account_type']!==$expected)throw new Exception('Jenis akun penerimaan tidak sesuai metode pembayaran');
        if($account['branch_id']&&$account['branch_id']!==$invoice['branch_id'])throw new Exception('Akun tujuan harus sesuai cabang faktur');
        $branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$invoice['branch_id']]);
        $number=nextCustomerPaymentNumber($pdo,(string)$invoice['branch_id'],(string)$branch->fetchColumn(),$date);$paymentId=generateId();
        $insert=$pdo->prepare("INSERT INTO customer_payments(id,payment_number,invoice_id,date,amount,payment_method,account_id,account_name,notes,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
        $insert->execute([$paymentId,$number,$invoiceId,$date,$amount,$methodName,$account['id'],$account['name'],trim((string)($d['notes']??''))?:null,$invoice['branch_id'],$user['id']??null,$user['name']??$user['username']??null]);
        recalculateCustomerInvoice($pdo,$invoiceId);$pdo->commit();respondSuccess(['id'=>$paymentId,'paymentNumber'=>$number],'Pembayaran pelanggan disimpan');
    }catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}break;

case 'PUT':
    $user=requireUserPermission($pdo,'payment:edit');$d=getInput();$pdo->beginTransaction();
    try {
        if(!$id)throw new Exception('ID pembayaran wajib diisi');
        $stmt=$pdo->prepare("SELECT * FROM customer_payments WHERE id=? FOR UPDATE");$stmt->execute([$id]);$payment=$stmt->fetch();
        if(!$payment)throw new Exception('Pembayaran tidak ditemukan');
        if(!paymentUserCanAccessBranch($pdo,$user,(string)$payment['branch_id']))throw new Exception('Tidak memiliki akses ke cabang pembayaran');
        if(paymentIsIncludedInDeposit($pdo,$payment))throw new Exception('Pembayaran sudah masuk setoran cabang. Batalkan setoran terlebih dahulu sebelum mengedit.');
        $reason=trim((string)($d['reason']??''));if($reason==='')throw new Exception('Alasan perubahan pembayaran wajib diisi');
        $invoiceId=(string)$payment['invoice_id'];
        $invoiceStmt=$pdo->prepare("SELECT * FROM sales_invoices WHERE id=? FOR UPDATE");$invoiceStmt->execute([$invoiceId]);$invoice=$invoiceStmt->fetch();
        if(!$invoice)throw new Exception('Faktur tidak ditemukan');
        $otherStmt=$pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE invoice_id=? AND id<>?");
        $otherStmt->execute([$invoiceId,$id]);$otherPaid=(float)$otherStmt->fetchColumn();
        $amount=(float)($d['amount']??0);$maximum=max(0,(float)$invoice['total']-$otherPaid);
        if($amount<=0)throw new Exception('Nominal pembayaran harus lebih dari Rp0');
        if($amount>$maximum)throw new Exception('Nominal pembayaran melebihi sisa tagihan setelah pembayaran lain');
        $date=(string)($d['date']??$payment['date']);
        if($date<$invoice['date'])throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal faktur');
        if($date>date('Y-m-d'))throw new Exception('Tanggal pembayaran tidak boleh melewati hari ini');
        if($date!==$payment['date']&&$date<date('Y-m-d'))requireUserPermission($pdo,'payment:backdate');
        $methodName=(string)($d['paymentMethod']??$payment['payment_method']);
        if(!in_array($methodName,['Tunai','Transfer'],true))throw new Exception('Metode pembayaran wajib Tunai atau Transfer');
        $accountId=(string)($d['accountId']??'');
        if($accountId===''){
            $column=$methodName==='Tunai'?'cash_account_id':'bank_account_id';
            $default=$pdo->prepare("SELECT {$column} FROM branch_account_settings WHERE branch_id=?");$default->execute([$invoice['branch_id']]);
            $accountId=(string)($default->fetchColumn()?:'');
        }
        $accountStmt=$pdo->prepare("SELECT id,name,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1");$accountStmt->execute([$accountId]);$account=$accountStmt->fetch();
        if(!$account)throw new Exception('Akun penerimaan belum diatur untuk cabang faktur');
        $expected=$methodName==='Tunai'?'cash':'bank';
        if($account['account_type']!==$expected)throw new Exception('Jenis akun penerimaan tidak sesuai metode pembayaran');
        if($account['branch_id']&&$account['branch_id']!==$invoice['branch_id'])throw new Exception('Akun tujuan harus sesuai cabang faktur');
        writePaymentAudit($pdo,$payment,'edit_before',$reason,$user);
        $pdo->prepare("UPDATE customer_payments SET date=?,amount=?,payment_method=?,account_id=?,account_name=?,notes=? WHERE id=?")
            ->execute([$date,$amount,$methodName,$account['id'],$account['name'],trim((string)($d['notes']??''))?:null,$id]);
        $afterStmt=$pdo->prepare("SELECT * FROM customer_payments WHERE id=?");$afterStmt->execute([$id]);$after=$afterStmt->fetch();
        writePaymentAudit($pdo,$after?:$payment,'edit_after',$reason,$user);
        recalculateCustomerInvoice($pdo,$invoiceId);$pdo->commit();respondSuccess(null,'Pembayaran diperbarui dan saldo faktur dihitung ulang');
    }catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}break;

case 'DELETE':
    $user=requireUserPermission($pdo,'payment:delete');$d=getInput();$pdo->beginTransaction();
    try {
        if(!$id)throw new Exception('ID pembayaran wajib diisi');
        if($id==='invoice'){
            $invoiceId=(string)($action??'');if($invoiceId==='')throw new Exception('ID faktur wajib diisi');
            $items=$pdo->prepare("SELECT * FROM customer_payments WHERE invoice_id=? FOR UPDATE");$items->execute([$invoiceId]);$payments=$items->fetchAll();
            foreach($payments as $payment){if(!paymentUserCanAccessBranch($pdo,$user,(string)$payment['branch_id']))throw new Exception('Tidak memiliki akses ke cabang pembayaran');if(paymentIsIncludedInDeposit($pdo,$payment))throw new Exception('Pembayaran sudah masuk setoran cabang. Batalkan setoran terlebih dahulu.');writePaymentAudit($pdo,$payment,'delete','Faktur terkait dihapus',$user);}
            $pdo->prepare("DELETE FROM customer_payments WHERE invoice_id=?")->execute([$invoiceId]);recalculateCustomerInvoice($pdo,$invoiceId);
            $pdo->commit();respondSuccess(null,'Seluruh pembayaran dihapus dan faktur kembali terutang');break;
        }
        $stmt=$pdo->prepare("SELECT * FROM customer_payments WHERE id=? FOR UPDATE");$stmt->execute([$id]);$payment=$stmt->fetch();
        if(!$payment)throw new Exception('Pembayaran tidak ditemukan');
        if(!paymentUserCanAccessBranch($pdo,$user,(string)$payment['branch_id']))throw new Exception('Tidak memiliki akses ke cabang pembayaran');
        if(paymentIsIncludedInDeposit($pdo,$payment))throw new Exception('Pembayaran sudah masuk setoran cabang. Batalkan setoran terlebih dahulu sebelum menghapus.');
        $reason=trim((string)($d['reason']??''));if($reason==='')throw new Exception('Alasan penghapusan pembayaran wajib diisi');
        writePaymentAudit($pdo,$payment,'delete',$reason,$user);$pdo->prepare("DELETE FROM customer_payments WHERE id=?")->execute([$id]);
        recalculateCustomerInvoice($pdo,(string)$payment['invoice_id']);$pdo->commit();respondSuccess(null,'Pembayaran dihapus dan saldo faktur dihitung ulang');
    }catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}break;
default:respondError('Method not allowed',405);
}
