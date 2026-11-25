<?php
require_once __DIR__.'/../../api/auto-close-diagnosis.php';
$port = filter_var(getenv('WORK_ORDER_TEST_PORT'), FILTER_VALIDATE_INT);
if (!$port || $port === 3306) throw new RuntimeException('A disposable MySQL test port is required.');
$db = new PDO("mysql:host=127.0.0.1;port=$port;dbname=drac_wo_return_test", 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec("SET time_zone='+08:00'");
$db->exec("CREATE TEMPORARY TABLE work_orders (
    id INT PRIMARY KEY, status VARCHAR(20), date DATE, transaction_time TIME,
    status_log JSON, cancel_reason VARCHAR(255), created_at DATETIME, updated_at DATETIME(6),
    invoice_id VARCHAR(20), invoice_number VARCHAR(30), continued_to_wo_id VARCHAR(20)
)");
$insert = $db->prepare("INSERT INTO work_orders (id,status,date,transaction_time,created_at) VALUES (?,'Register',?,?,?)");
$insert->execute([1, '2026-11-25', '17:29', '2026-11-25 17:29:59']);
$insert->execute([2, '2026-11-25', '17:30', '2026-11-25 17:30:35']);
$insert->execute([3, '2026-11-25', '18:00', '2026-11-25 18:00:01']);
$insert->execute([4, '2026-08-01', '10:00', '2026-11-25 10:00:00']);
$snapshots = [];
foreach (['2026-11-25T18:30:00+08:00', '2026-11-26T08:00:00+08:00', '2026-11-26T17:30:00+08:00'] as $at) {
    autoCloseExpiredDiagnoses($db, new DateTimeImmutable($at));
    $snapshots[] = $db->query('SELECT status FROM work_orders ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
}
echo json_encode($snapshots);
