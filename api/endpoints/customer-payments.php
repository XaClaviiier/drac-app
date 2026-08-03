<?php
$pdo->exec("CREATE TABLE IF NOT EXISTS customer_payments (
    id VARCHAR(64) PRIMARY KEY,
    payment_number VARCHAR(40) NOT NULL UNIQUE,
    invoice_id VARCHAR(64) NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'Tunai',
    notes VARCHAR(255) NULL,
    branch_id VARCHAR(64) NOT NULL,
    created_by VARCHAR(64) NULL,
    created_by_name VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_payment_invoice (invoice_id),
    INDEX idx_customer_payment_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Pertahankan pembayaran awal dari faktur lama sebagai riwayat pembayaran.
$pdo->exec("INSERT IGNORE INTO customer_payments
    (id, payment_number, invoice_id, date, amount, payment_method, notes, branch_id, created_by_name)
    SELECT CONCAT('legacy-', id), CONCAT('PAY-', invoice_number), id,
           COALESCE(payment_date, date), payment, COALESCE(payment_method, 'Tunai'),
           'Pembayaran awal faktur', branch_id, 'Migrasi Sistem'
    FROM sales_invoices WHERE payment > 0");

function recalculateCustomerInvoice(PDO $pdo, string $invoiceId): void {
    $sum = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE invoice_id=?");
    $sum->execute([$invoiceId]);
    $paid = (float)$sum->fetchColumn();
    $invoice = $pdo->prepare("SELECT total, date FROM sales_invoices WHERE id=? FOR UPDATE");
    $invoice->execute([$invoiceId]);
    $row = $invoice->fetch();
    if (!$row) throw new Exception('Invoice tidak ditemukan');
    $paid = min($paid, (float)$row['total']);
    $status = $paid >= (float)$row['total'] ? 'Lunas' : 'Belum Lunas';
    $paymentDate = $paid > 0 ? $pdo->query("SELECT MAX(date) FROM customer_payments WHERE invoice_id=" . $pdo->quote($invoiceId))->fetchColumn() : null;
    $methodStmt = $pdo->prepare("SELECT payment_method FROM customer_payments WHERE invoice_id=? ORDER BY date DESC, created_at DESC LIMIT 1");
    $methodStmt->execute([$invoiceId]);
    $method = $methodStmt->fetchColumn() ?: 'Tunai';
    if ($method !== 'Tunai') $method = 'QRIS/Transfer';
    $update = $pdo->prepare("UPDATE sales_invoices SET payment=?, payment_date=?, payment_method=?, status=? WHERE id=?");
    $update->execute([$paid, $paymentDate, $method, $status, $invoiceId]);
}

switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT p.*, i.invoice_number, i.customer_name, i.customer_id, i.vehicle_info,
                    i.total invoice_total, i.payment invoice_paid, i.status invoice_status
            FROM customer_payments p JOIN sales_invoices i ON i.id=p.invoice_id
            ORDER BY p.date DESC, p.created_at DESC")->fetchAll();
        foreach ($rows as &$row) {
            $row['paymentNumber'] = $row['payment_number'];
            $row['invoiceId'] = $row['invoice_id'];
            $row['invoiceNumber'] = $row['invoice_number'];
            $row['customerName'] = $row['customer_name'];
            $row['customerId'] = $row['customer_id'];
            $row['vehicleInfo'] = $row['vehicle_info'];
            $row['invoiceTotal'] = (float)$row['invoice_total'];
            $row['invoicePaid'] = (float)$row['invoice_paid'];
            $row['amount'] = (float)$row['amount'];
            $row['paymentMethod'] = $row['payment_method'];
            $row['branchId'] = $row['branch_id'];
            $row['createdByName'] = $row['created_by_name'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $invoiceId = (string)($d['invoiceId'] ?? '');
            $invoiceStmt = $pdo->prepare("SELECT * FROM sales_invoices WHERE id=? FOR UPDATE");
            $invoiceStmt->execute([$invoiceId]);
            $invoice = $invoiceStmt->fetch();
            if (!$invoice) throw new Exception('Invoice tidak ditemukan');
            $amount = (float)($d['amount'] ?? 0);
            $outstanding = max(0, (float)$invoice['total'] - (float)$invoice['payment']);
            if ($amount <= 0) throw new Exception('Nominal pembayaran harus lebih dari Rp0');
            if ($amount > $outstanding) throw new Exception('Nominal pembayaran melebihi sisa tagihan');
            $date = (string)($d['date'] ?? date('Y-m-d'));
            if ($date < $invoice['date']) throw new Exception('Tanggal pembayaran tidak boleh sebelum tanggal invoice');
            if ($date > date('Y-m-d')) throw new Exception('Tanggal pembayaran tidak boleh melewati hari ini');
            $branchCodeStmt = $pdo->prepare("SELECT code FROM branches WHERE id=?");
            $branchCodeStmt->execute([$invoice['branch_id']]);
            $prefix = strtoupper(substr((string)($branchCodeStmt->fetchColumn() ?: 'P'), 0, 1));
            $period = date('ym', strtotime($date));
            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM customer_payments WHERE branch_id=? AND DATE_FORMAT(date,'%y%m')=?");
            $countStmt->execute([$invoice['branch_id'], $period]);
            $paymentNumber = 'PAY-' . $prefix . $period . str_pad((string)((int)$countStmt->fetchColumn() + 1), 3, '0', STR_PAD_LEFT);
            $paymentId = generateId();
            $insert = $pdo->prepare("INSERT INTO customer_payments (id,payment_number,invoice_id,date,amount,payment_method,notes,branch_id,created_by,created_by_name) VALUES (?,?,?,?,?,?,?,?,?,?)");
            $insert->execute([$paymentId, $paymentNumber, $invoiceId, $date, $amount, $d['paymentMethod'] ?? 'Tunai', trim((string)($d['notes'] ?? '')) ?: null, $invoice['branch_id'], $d['createdBy'] ?? null, $d['createdByName'] ?? null]);
            recalculateCustomerInvoice($pdo, $invoiceId);
            $pdo->commit();
            respondSuccess(['id'=>$paymentId, 'paymentNumber'=>$paymentNumber], 'Pembayaran pelanggan disimpan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID pembayaran wajib diisi', 422);
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("SELECT invoice_id FROM customer_payments WHERE id=? FOR UPDATE");
            $stmt->execute([$id]);
            $invoiceId = $stmt->fetchColumn();
            if (!$invoiceId) throw new Exception('Pembayaran tidak ditemukan');
            $pdo->prepare("DELETE FROM customer_payments WHERE id=?")->execute([$id]);
            recalculateCustomerInvoice($pdo, (string)$invoiceId);
            $pdo->commit();
            respondSuccess(null, 'Pembayaran dihapus dan saldo invoice dihitung ulang');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        }
        break;
    default: respondError('Method not allowed', 405);
}
