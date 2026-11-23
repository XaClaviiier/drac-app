<?php
declare(strict_types=1);

// Actual HTTP API against a fresh disposable loopback database. Never uses DB_NAME/BASE_URL.
$port = (int)getenv('DRAC_ITEM_MINIMUM_TEST_MYSQL_PORT');
if ($port < 1024 || $port > 65535 || $port === 3306) throw new RuntimeException('Use an isolated local MySQL port');
$database = 'drac_item_min_test_' . bin2hex(random_bytes(6));
$root = dirname(__DIR__, 2);
$checks = 0;
function minimumAssert(bool $ok, string $message): void {
    global $checks;
    if (!$ok) throw new RuntimeException($message);
    $checks++;
}
function minimumRequest(string $base, string $route, string $token, string $method = 'GET', ?array $payload = null): array {
    $options = ['method' => $method, 'header' => ['Authorization: Bearer '.$token, 'Content-Type: application/json'], 'ignore_errors' => true, 'timeout' => 30];
    if ($payload !== null) $options['content'] = json_encode($payload, JSON_THROW_ON_ERROR);
    $body = @file_get_contents($base.'/api/index.php?route='.$route, false, stream_context_create(['http' => $options]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $match);
    $decoded = json_decode((string)$body, true);
    return ['status' => (int)($match[1] ?? 0), 'body' => $decoded, 'raw' => (string)$body];
}
$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
$dsn = 'mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4';
$admin = new PDO($dsn, 'root', '', $options);
$created = false;
$server = null;
$log = tempnam(sys_get_temp_dir(), 'drac-item-min-');
try {
    $admin->exec("CREATE DATABASE `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $created = true;
    $pdo = new PDO($dsn.';dbname='.$database, 'root', '', $options);
    $pdo->exec(file_get_contents($root.'/database/dokterac_schema.sql'));
    $pdo->exec("SET time_zone = '+08:00'");
    // Runtime accounting tables precede the existing accounting migrations on an empty DB.
    preg_match_all('/\$pdo->exec\("(CREATE TABLE IF NOT EXISTS journal_(?:entries|lines|postings) [^\r\n]+)"\);/', file_get_contents($root.'/api/index.php'), $journalTables);
    minimumAssert(count($journalTables[1]) === 3, 'Accounting bootstrap prerequisites missing');
    foreach ($journalTables[1] as $sql) $pdo->exec($sql);
    // Historical manual migration from database/migrate_updates.sql.
    $pdo->exec('ALTER TABLE work_orders ADD COLUMN status_log JSON NULL AFTER approved_at');
    // Start with the old schema, so the first all-data read must migrate existing rows.
    $pdo->exec('ALTER TABLE items DROP COLUMN minimum_stock');
    $pdo->exec("INSERT INTO items(id,code,name,type,unit,stock,sellable_stock,branch_id) VALUES ('MIN-LEGACY','MIN-LEGACY','LEGACY MINIMUM TEST','Persediaan','PCS',0,0,'BR-001')");
    $environment = getenv();
    $environment['DRAC_DB_HOST'] = '127.0.0.1;port='.$port;
    $environment['DRAC_DB_NAME'] = $database;
    $environment['DRAC_DB_USER'] = 'root';
    $environment['DRAC_DB_PASS'] = '';
    unset($environment['PHP_CLI_SERVER_WORKERS']);
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    minimumAssert($socket !== false, 'Cannot reserve local port');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $base = 'http://'.$address;
    $server = proc_open([PHP_BINARY, '-d', 'log_errors=1', '-d', 'error_log='.$log.'.errors', '-S', $address, '-t', $root], [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, $root, $environment);
    minimumAssert(is_resource($server), 'Cannot start test API');
    fclose($pipes[0]);
    $deadline = microtime(true) + 40;
    do {
        $response = minimumRequest($base, 'all-data', 'invalid');
        if ($response['status'] === 401) break;
        if ($response['status'] >= 500) break;
        usleep(100000);
    } while (microtime(true) < $deadline);
    minimumAssert($response['status'] === 401, 'API bootstrap failed: '.$response['raw']);
    $pdo->exec("INSERT INTO roles(id,code,name,permissions,is_active) VALUES ('MIN-ROLE','MIN','Minimum fixture','[\"item:view\",\"item:create\",\"item:edit\"]',1)");
    $pdo->exec("INSERT INTO users(id,username,name,password,role_id,branch_id,is_active,is_owner) VALUES ('MIN-USER','minimum-fixture','Minimum fixture','not-a-login','MIN-ROLE','BR-001',1,1)");
    $token = bin2hex(random_bytes(24));
    $session = $pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at,last_activity,ip_address,user_agent) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR),NOW(),?,?)');
    $session->execute([hash('sha256', $token), 'MIN-USER', '127.0.0.1', 'minimum stock test']);
    $response = minimumRequest($base, 'all-data', $token);
    minimumAssert($response['status'] === 200 && ($response['body']['success'] ?? false), 'all-data failed: '.$response['raw']);
    $items = array_column($response['body']['data']['items'], null, 'id');
    minimumAssert(($items['MIN-LEGACY']['minimumStock'] ?? null) === 0, 'Old item must migrate to zero');
    $column = $pdo->query("SHOW COLUMNS FROM items LIKE 'minimum_stock'")->fetch();
    minimumAssert($column['Null'] === 'NO' && (int)$column['Default'] === 0, 'New storage must default to zero');
    $payload = ['id' => 'MIN-ITEM', 'code' => 'MIN-ITEM', 'name' => 'MINIMUM STOCK FIXTURE', 'branchId' => 'BR-001', 'type' => 'Persediaan', 'categoryId' => '1', 'unit' => 'PCS', 'barcode' => '0012345678901'];
    $response = minimumRequest($base, 'items', $token, 'POST', $payload);
    minimumAssert($response['status'] === 200 && ($response['body']['success'] ?? false), 'Create failed: '.$response['raw']);
    $row = fn() => $pdo->query("SELECT minimum_stock,stock,sellable_stock,barcode FROM items WHERE id='MIN-ITEM'")->fetch();
    minimumAssert((int)$row()['minimum_stock'] === 0, 'New item without minimum must default to zero');
    $pdo->exec("INSERT INTO branch_item_stocks(branch_id,item_id,stock,sellable_stock) VALUES('BR-002','MIN-ITEM',2,2)");
    $pdo->exec("UPDATE branch_item_stocks SET stock=5,sellable_stock=5 WHERE branch_id='BR-001' AND item_id='MIN-ITEM'");
    $warehouse = $pdo->prepare('SELECT id FROM warehouses WHERE branch_id=? AND is_active=1 AND is_system=0 ORDER BY is_default DESC,id LIMIT 1');
    $warehouseStock = $pdo->prepare("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity,reserved_quantity) VALUES(?,'MIN-ITEM',?,0) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)");
    foreach (['BR-001' => 5, 'BR-002' => 2] as $branchId => $quantity) {
        $warehouse->execute([$branchId]);
        $warehouseId = $warehouse->fetchColumn();
        minimumAssert(is_string($warehouseId), 'Test branch warehouse missing');
        $warehouseStock->execute([$warehouseId, $quantity]);
    }
    $pdo->exec("UPDATE items SET stock=7,sellable_stock=7 WHERE id='MIN-ITEM'");
    $beforeStock = $pdo->query("SELECT * FROM branch_item_stocks WHERE item_id='MIN-ITEM' ORDER BY branch_id")->fetchAll();
    $beforeWarehouseStock = $pdo->query("SELECT * FROM warehouse_stocks WHERE item_id='MIN-ITEM' ORDER BY warehouse_id")->fetchAll();
    foreach ([3, 0, 2147483647, 3] as $minimum) {
        $response = minimumRequest($base, 'items/MIN-ITEM', $token, 'PUT', $payload + ['minimumStock' => $minimum]);
        minimumAssert($response['status'] === 200 && ($response['body']['success'] ?? false), 'Update failed: '.$response['raw']);
        minimumAssert((int)$row()['minimum_stock'] === $minimum, 'Minimum not persisted');
    }
    $response = minimumRequest($base, 'items/MIN-ITEM', $token, 'PUT', $payload);
    minimumAssert($response['status'] === 200 && (int)$row()['minimum_stock'] === 3, 'Old client update must preserve minimum');
    foreach ([-1, 1.5, '1e2', 'abc', true, [], 2147483648, null] as $invalid) {
        $response = minimumRequest($base, 'items/MIN-ITEM', $token, 'PUT', $payload + ['minimumStock' => $invalid]);
        minimumAssert($response['status'] === 422, 'Invalid minimum was accepted: '.json_encode($invalid));
        minimumAssert((int)$row()['minimum_stock'] === 3, 'Invalid edit changed the minimum');
    }
    $newPayload = array_replace($payload, ['id' => 'MIN-NEW', 'code' => 'MIN-NEW', 'name' => 'MINIMUM NEW FIXTURE', 'barcode' => '', 'minimumStock' => 7]);
    $response = minimumRequest($base, 'items', $token, 'POST', $newPayload);
    minimumAssert($response['status'] === 200 && (int)$pdo->query("SELECT minimum_stock FROM items WHERE id='MIN-NEW'")->fetchColumn() === 7, 'Create with a minimum failed: '.$response['raw']);
    $invalidPayload = array_replace($newPayload, ['id' => 'MIN-BAD', 'code' => 'MIN-BAD', 'name' => 'MINIMUM BAD FIXTURE', 'minimumStock' => -1]);
    $response = minimumRequest($base, 'items', $token, 'POST', $invalidPayload);
    minimumAssert($response['status'] === 422 && (int)$pdo->query("SELECT COUNT(*) FROM items WHERE id='MIN-BAD'")->fetchColumn() === 0, 'Invalid create must roll back');
    foreach (['items', 'all-data'] as $route) {
        $response = minimumRequest($base, $route, $token);
        minimumAssert($response['status'] === 200 && ($response['body']['success'] ?? false), 'Reload failed: '.$response['raw']);
        $rows = $route === 'items' ? $response['body']['data'] : $response['body']['data']['items'];
        $item = array_column($rows, null, 'id')['MIN-ITEM'];
        minimumAssert($item['minimumStock'] === 3, 'Reload omitted the global minimum');
        minimumAssert($item['barcode'] === '0012345678901', 'Barcode leading zeros were lost');
        minimumAssert($item['branchStocks']['BR-001']['stock'] === 5 && $item['branchStocks']['BR-002']['stock'] === 2, 'Minimum edit changed branch quantities');
    }
    minimumAssert($beforeStock === $pdo->query("SELECT * FROM branch_item_stocks WHERE item_id='MIN-ITEM' ORDER BY branch_id")->fetchAll(), 'Stock rows were altered');
    minimumAssert($beforeWarehouseStock === $pdo->query("SELECT * FROM warehouse_stocks WHERE item_id='MIN-ITEM' ORDER BY warehouse_id")->fetchAll(), 'Warehouse stock rows were altered');
    minimumAssert((int)$row()['stock'] === 7 && (int)$row()['sellable_stock'] === 7, 'Minimum edit changed master balances');
    $servicePayload = array_replace($newPayload, ['id' => 'MIN-SERVICE', 'code' => 'MIN-SERVICE', 'name' => 'MINIMUM SERVICE FIXTURE', 'type' => 'Jasa']);
    $response = minimumRequest($base, 'items', $token, 'POST', $servicePayload);
    minimumAssert($response['status'] === 200 && (int)$pdo->query("SELECT minimum_stock FROM items WHERE id='MIN-SERVICE'")->fetchColumn() === 0, 'Service minimum should stay zero');
    echo json_encode(['success' => true, 'checks' => $checks], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    if (is_string($log) && file_exists($log)) fwrite(STDERR, substr(file_get_contents($log), -6000));
    if (is_string($log) && file_exists($log.'.errors')) fwrite(STDERR, substr(file_get_contents($log.'.errors'), -6000));
    throw $error;
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    if ($created) $admin->exec("DROP DATABASE `{$database}`");
    if (is_string($log) && file_exists($log)) unlink($log);
    if (is_string($log) && file_exists($log.'.errors')) unlink($log.'.errors');
}
