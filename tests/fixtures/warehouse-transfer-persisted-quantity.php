<?php

declare(strict_types=1);

$host = getenv('DB_HOST') ?: '127.0.0.1';
$database = getenv('DB_NAME') ?: 'drac_rollout';
$user = getenv('DB_USER') ?: 'root';
$password = (string)(getenv('DB_PASSWORD') ?: '');
$baseUrl = rtrim((string)(getenv('BASE_URL') ?: 'http://127.0.0.1:8099'), '/');
$token = 'ci-transfer-persisted-quantity-token';

$pdo = new PDO(
    "mysql:host={$host};dbname={$database};charset=utf8mb4",
    $user,
    $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};
$put = static function (string $transferId, array $payload) use ($baseUrl, $token): array {
    $body = json_encode($payload, JSON_THROW_ON_ERROR);
    $context = stream_context_create([
        'http' => [
            'method' => 'PUT',
            'header' => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
                'Content-Length: ' . strlen($body),
            ],
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 20,
        ],
    ]);
    $response = file_get_contents($baseUrl . '/api/index.php?route=warehouse-transfers/' . rawurlencode($transferId), false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    return ['status' => (int)($matches[1] ?? 0), 'body' => (string)$response];
};

$pdo->exec("UPDATE users SET is_owner=1,is_active=1 WHERE id='1'");
$session = $pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at,last_activity,ip_address,user_agent) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR),NOW(),?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),expires_at=VALUES(expires_at),last_activity=VALUES(last_activity)');
$session->execute([hash('sha256', $token), '1', '127.0.0.1', 'CI persisted transfer fixture']);
$pdo->exec("INSERT INTO warehouses(id,code,name,branch_id,is_default,is_sellable,is_system,is_active) VALUES
    ('W-CI-SRC','CI-SRC','CI Source','BR-001',0,1,0,1),
    ('W-CI-DST','CI-DST','CI Destination','BR-001',0,1,0,1)
    ON DUPLICATE KEY UPDATE is_active=1,is_system=0");
$pdo->exec("INSERT INTO items(id,code,name,type,unit,is_active,branch_id) VALUES('I-CI-BAD','CI-BAD','CI Persisted Quantity','Persediaan','PCS',1,'BR-001')
    ON DUPLICATE KEY UPDATE type='Persediaan',is_active=1");
$pdo->exec("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity,reserved_quantity,stock_version) VALUES
    ('W-CI-SRC','I-CI-BAD',100,0,0),('W-CI-DST','I-CI-BAD',100,0,0)
    ON DUPLICATE KEY UPDATE quantity=100,reserved_quantity=0,stock_version=0");
$pdo->exec("DELETE FROM stock_movements WHERE reference_id IN ('T-BAD-SEND','T-BAD-RECEIVE','T-BAD-CANCEL');
    DELETE FROM warehouse_transfer_items WHERE transfer_id IN ('T-BAD-SEND','T-BAD-RECEIVE','T-BAD-CANCEL');
    DELETE FROM warehouse_transfers WHERE id IN ('T-BAD-SEND','T-BAD-RECEIVE','T-BAD-CANCEL');");
$pdo->exec("INSERT INTO warehouse_transfers(id,transfer_number,transfer_date,source_warehouse_id,destination_warehouse_id,status,created_by) VALUES
    ('T-BAD-SEND','TR-CI-BAD-SEND','2026-08-20','W-CI-SRC','W-CI-DST','Draft','1'),
    ('T-BAD-RECEIVE','TR-CI-BAD-RECEIVE','2026-08-20','W-CI-SRC','W-CI-DST','Dalam Perjalanan','1'),
    ('T-BAD-CANCEL','TR-CI-BAD-CANCEL','2026-08-20','W-CI-SRC','W-CI-DST','Diterima Sebagian','1')");
$pdo->exec("INSERT INTO warehouse_transfer_items(transfer_id,item_id,item_code,item_name,unit,qty_sent,qty_received) VALUES
    ('T-BAD-SEND','I-CI-BAD','CI-BAD','CI Persisted Quantity','PCS',0,0),
    ('T-BAD-RECEIVE','I-CI-BAD','CI-BAD','CI Persisted Quantity','PCS',5,-1),
    ('T-BAD-CANCEL','I-CI-BAD','CI-BAD','CI Persisted Quantity','PCS',5,6)");

$cases = [
    'T-BAD-SEND' => ['payload' => ['action' => 'send'], 'status' => 'Draft'],
    'T-BAD-RECEIVE' => ['payload' => ['action' => 'receive', 'items' => [['itemId' => 'I-CI-BAD', 'qtyReceived' => 1]]], 'status' => 'Dalam Perjalanan'],
    'T-BAD-CANCEL' => ['payload' => ['action' => 'cancel', 'reason' => 'CI invalid persisted row'], 'status' => 'Diterima Sebagian'],
];
foreach ($cases as $transferId => $case) {
    $response = $put($transferId, $case['payload']);
    $assert($response['status'] === 422, "{$transferId} tidak ditolak 422: {$response['status']} {$response['body']}");
    $statusStatement = $pdo->prepare('SELECT status FROM warehouse_transfers WHERE id=?');
    $statusStatement->execute([$transferId]);
    $assert($statusStatement->fetchColumn() === $case['status'], "{$transferId} berubah walau persisted quantity korup");
}

$stocks = $pdo->query("SELECT warehouse_id,quantity,stock_version FROM warehouse_stocks WHERE item_id='I-CI-BAD' ORDER BY warehouse_id")->fetchAll();
$assert($stocks === [
    ['warehouse_id' => 'W-CI-DST', 'quantity' => 100, 'stock_version' => 0],
    ['warehouse_id' => 'W-CI-SRC', 'quantity' => 100, 'stock_version' => 0],
], 'Saldo atau version berubah walau persisted quantity korup');
$movementCount = (int)$pdo->query("SELECT COUNT(*) FROM stock_movements WHERE reference_id IN ('T-BAD-SEND','T-BAD-RECEIVE','T-BAD-CANCEL')")->fetchColumn();
$assert($movementCount === 0, 'Movement tercipta walau persisted quantity korup');

fwrite(STDOUT, "warehouse-transfer-persisted-quantity-ok\n");
