<?php
// Actual invoice normalization/posting closures and account helpers against an
// in-memory SQLite database. No application config, network, or production data.
require __DIR__.'/../../api/helpers.php';
require __DIR__.'/../../api/billing-treatment.php';
function generateId() { return bin2hex(random_bytes(10)); }
$input = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$pdo->sqliteCreateFunction('NOW', fn() => '2026-11-17 12:00:00');
$pdo->exec("CREATE TABLE items(id TEXT,code TEXT,name TEXT,receipt_description TEXT,type TEXT,is_active INTEGER);
    INSERT INTO items VALUES('SERVICE','S1','Isi freon','','Jasa',1),('GOODS','G1','Bahan','','Persediaan',1);
    CREATE TABLE app_settings(id INTEGER,settings_json TEXT);
    CREATE TABLE branch_account_settings(branch_id TEXT,cash_account_id TEXT,bank_account_id TEXT,receivable_coa_id TEXT,service_revenue_coa_id TEXT,goods_revenue_coa_id TEXT,inventory_coa_id TEXT,inventory_usage_coa_id TEXT);
    INSERT INTO branch_account_settings VALUES('B1',NULL,NULL,'AR','SERVICE_REV','GOODS_REV','INVENTORY',NULL);
    CREATE TABLE chart_of_accounts(id TEXT,code TEXT,is_active INTEGER);
    INSERT INTO chart_of_accounts VALUES('INVENTORY','110401',1),('COGS','5101',1);
    CREATE TABLE sales_invoices(id TEXT,customer_id TEXT);
    INSERT INTO sales_invoices VALUES('INV1','CUSTOMER1');
    CREATE TABLE journal_entries(id TEXT,entry_date TEXT,entry_number TEXT,description TEXT,branch_id TEXT,source_type TEXT,source_id TEXT,party_type TEXT,party_id TEXT,posted INTEGER,status TEXT,created_by TEXT,posted_by TEXT,posted_at TEXT);
    CREATE TABLE journal_lines(id TEXT,journal_id TEXT,account_id TEXT,debit REAL,credit REAL,memo TEXT);
    CREATE TABLE journal_postings(id TEXT,journal_id TEXT,source_type TEXT,source_id TEXT,posting_key TEXT,status TEXT);");
$source = file_get_contents(__DIR__.'/../../api/endpoints/sales-invoices.php');
// Read named closures verbatim; do not copy their implementations into the test.
foreach ([['$normalizeSalesInvoiceItems =', '$recordInitialCustomerPayment ='], ['$recordInitialCustomerPayment =', '$resolveSalesWarehouse='], ['$postSalesRevenueJournal =', '$lockedInvoiceBranchIds=']] as [$startMarker, $endMarker]) {
    $start = strpos($source, $startMarker); $end = strpos($source, $endMarker, $start);
    if ($start === false || $end === false) throw new RuntimeException('Invoice test seam missing');
    eval(substr($source, $start, $end - $start));
}
try {
    $treatment = normalizeBillingTreatment($input['treatment'] ?? null);
    $normalized = $normalizeSalesInvoiceItems($pdo, $input['items'] ?? [], $treatment);
    $serviceTotal = array_sum(array_map(fn($item) => $item['isStockItem'] ? 0 : $item['subtotal'], $normalized['items']));
    $post = function() use ($postSalesRevenueJournal, $pdo, $normalized, $serviceTotal, $input) {
        $postSalesRevenueJournal($pdo, 'INV1', 'TEST1', '2026-11-17', 'B1', $normalized['total'], $serviceTotal, $normalized['total'] - $serviceTotal, (float)($input['goodsCost'] ?? 0), ['id'=>'ACTOR']);
    };
    $post();
    if ($input['retry'] ?? false) $post();
    // Zero payment must return without reading or writing any cash account.
    $recordInitialCustomerPayment($pdo, 'INV1', 'B1', '2026-11-17', 0, 'Tunai', ['id'=>'ACTOR']);
    echo json_encode(['success'=>true, 'treatment'=>$treatment, 'total'=>$normalized['total'], 'journals'=>$pdo->query('SELECT * FROM journal_entries')->fetchAll(), 'lines'=>$pdo->query('SELECT account_id,debit,credit FROM journal_lines ORDER BY account_id')->fetchAll()], JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException $error) {
    echo json_encode(['success'=>false, 'message'=>$error->getMessage()], JSON_THROW_ON_ERROR);
}
