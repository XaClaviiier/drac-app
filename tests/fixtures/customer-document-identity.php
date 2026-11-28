<?php
require_once __DIR__ . '/../../api/customer-document-identity.php';
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, customer_code TEXT UNIQUE);
    CREATE TABLE vehicles (id TEXT, customer_id TEXT, customer_code TEXT, customer_name TEXT);
    CREATE TABLE work_orders (id TEXT PRIMARY KEY, branch_id TEXT, customer_ref_id TEXT, customer_id TEXT, customer_name TEXT);
    CREATE TABLE sales_invoices (id TEXT PRIMARY KEY, branch_id TEXT, wo_id TEXT, customer_ref_id TEXT, customer_id TEXT, customer_name TEXT, total INTEGER);
    CREATE TABLE customer_payments (invoice_id TEXT, amount INTEGER);
    INSERT INTO customers VALUES ('C1','REZA','P1'),('C2','REZA B','P2');
    INSERT INTO vehicles VALUES ('V','C1','P1','REZA');
    INSERT INTO work_orders VALUES ('WO','A','C1','P1','REZA');
    INSERT INTO sales_invoices VALUES
        ('direct','A',NULL,'C1','P1','REZA',900),
        ('legacy','A','WO',NULL,'P1','REZA',900),
        ('other','A','WO','C2','P2','REZA B',900),
        ('unlinked','A',NULL,NULL,'P1','REZA',900),
        ('cross-branch','B','WO',NULL,'P1','REZA',900);
    INSERT INTO customer_payments VALUES ('legacy',250);
    UPDATE customers SET name='REZA BI', customer_code='P3' WHERE id='C1';");

function expectIdentity($row, $expected) {
    $actual = [$row['customerRefId'], $row['customerId'], $row['customerName']];
    if ($actual !== $expected) throw new RuntimeException(json_encode([$actual,$expected]));
}
$latest = ['C1','P3','REZA BI'];
expectIdentity($pdo->query(CUSTOMER_VEHICLE_SELECT)->fetch(), $latest);
expectIdentity($pdo->query(CUSTOMER_WORK_ORDER_SELECT)->fetch(), $latest);
$expected = ['direct'=>$latest,'legacy'=>$latest,'other'=>['C2','P2','REZA B'],
    'unlinked'=>[null,'P1','REZA'],'cross-branch'=>[null,'P1','REZA']];
foreach ($pdo->query(CUSTOMER_INVOICE_SELECT) as $row) expectIdentity($row,$expected[$row['id']]);
$payment = $pdo->query('SELECT p.amount,i.total,' . INVOICE_CUSTOMER_FIELDS .
    ' FROM customer_payments p JOIN sales_invoices i ON p.invoice_id=i.id' . INVOICE_CUSTOMER_JOIN)->fetch();
expectIdentity($payment,$latest);
if ((int)$payment['total'] !== 900 || (int)$payment['amount'] !== 250) throw new RuntimeException('Financial values changed');
