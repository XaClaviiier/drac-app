<?php
/** Daftar dan detail jurnal terposting, dengan pola nomor transaksi seperti Accurate. */
if ($method !== 'GET') respondError('Method not allowed', 405);

$id = trim((string)($id ?? ''));
if ($id !== '') {
    $stmt = $pdo->prepare("SELECT j.id,j.entry_date date,j.entry_number number,j.description,j.branch_id branchId,j.source_type sourceType,j.source_id sourceId,j.party_type partyType,j.party_id partyId,b.name branchName,
        CASE WHEN j.source_type='sales_invoice' THEN si.invoice_number WHEN j.source_type='customer_payment' THEN cp.payment_number WHEN j.source_type='purchase_invoice' THEN pi.invoice_number WHEN j.source_type='supplier_payment' THEN pp.payment_number ELSE NULL END transactionNumber,
        CASE WHEN j.party_type='customer' THEN c.name WHEN j.party_type='supplier' THEN s.name ELSE NULL END partyName
        FROM journal_entries j LEFT JOIN branches b ON b.id=j.branch_id LEFT JOIN sales_invoices si ON j.source_type='sales_invoice' AND si.id=j.source_id LEFT JOIN customer_payments cp ON j.source_type='customer_payment' AND cp.id=j.source_id LEFT JOIN purchase_invoices pi ON j.source_type='purchase_invoice' AND pi.id=j.source_id LEFT JOIN purchase_payments pp ON j.source_type='supplier_payment' AND pp.id=j.source_id LEFT JOIN customers c ON j.party_type='customer' AND c.id=j.party_id LEFT JOIN suppliers s ON j.party_type='supplier' AND s.id=j.party_id WHERE j.id=? AND j.posted=1 LIMIT 1");
    $stmt->execute([$id]);
    $journal = $stmt->fetch();
    if (!$journal) respondError('Jurnal tidak ditemukan', 404);
    if (!empty($journal['branchId'])) requireAccessibleBranch($pdo, $requestUser, (string)$journal['branchId']);
    $lines = $pdo->prepare('SELECT l.id,l.account_id,a.code account_code,a.name account_name,l.debit,l.credit,l.memo FROM journal_lines l LEFT JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.journal_id=? ORDER BY l.id');
    $lines->execute([$id]);
    $journal['lines'] = $lines->fetchAll();
    $journal['total'] = array_sum(array_map(static fn(array $line): float => (float)$line['debit'], $journal['lines']));
    respondSuccess($journal);
}

$from = trim((string)($_GET['from'] ?? date('Y-m-01')));
$to = trim((string)($_GET['to'] ?? date('Y-m-d')));
$search = trim((string)($_GET['search'] ?? ''));
$limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));
$where = ['j.posted=1','j.entry_date BETWEEN ? AND ?'];
$params = [$from, $to];
if ($search !== '') {
    $where[] = '(j.entry_number LIKE ? OR j.description LIKE ? OR j.source_id LIKE ? OR j.party_id LIKE ? OR c.name LIKE ? OR s.name LIKE ?)';
    array_push($params, ...array_fill(0, 6, '%'.$search.'%'));
}
$sql = "SELECT j.id,j.entry_date date,j.entry_number number,j.description,j.branch_id branchId,j.source_type sourceType,j.source_id sourceId,j.party_type partyType,j.party_id partyId,
    CASE WHEN j.source_type='sales_invoice' THEN si.invoice_number WHEN j.source_type='customer_payment' THEN cp.payment_number WHEN j.source_type='purchase_invoice' THEN pi.invoice_number WHEN j.source_type='supplier_payment' THEN pp.payment_number ELSE NULL END transactionNumber,
    CASE WHEN j.party_type='customer' THEN c.name WHEN j.party_type='supplier' THEN s.name ELSE NULL END partyName,
    COALESCE(SUM(l.debit),0) total FROM journal_entries j LEFT JOIN journal_lines l ON l.journal_id=j.id LEFT JOIN sales_invoices si ON j.source_type='sales_invoice' AND si.id=j.source_id LEFT JOIN customer_payments cp ON j.source_type='customer_payment' AND cp.id=j.source_id LEFT JOIN purchase_invoices pi ON j.source_type='purchase_invoice' AND pi.id=j.source_id LEFT JOIN purchase_payments pp ON j.source_type='supplier_payment' AND pp.id=j.source_id LEFT JOIN customers c ON j.party_type='customer' AND c.id=j.party_id LEFT JOIN suppliers s ON j.party_type='supplier' AND s.id=j.party_id WHERE ".implode(' AND ',$where)." GROUP BY j.id ORDER BY j.entry_date DESC,j.entry_number DESC LIMIT ".$limit;
$stmt = $pdo->prepare($sql); $stmt->execute($params);
$rows = $stmt->fetchAll();
foreach ($rows as &$row) {
    if (!empty($row['branchId'])) requireAccessibleBranch($pdo, $requestUser, (string)$row['branchId']);
}
unset($row);
respondSuccess($rows);
