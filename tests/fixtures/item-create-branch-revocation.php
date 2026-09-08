<?php

declare(strict_types=1);

/**
 * Real HTTP + MySQL 5.7 regression, including successful-create controls.
 * CI invocation (on the existing disposable MySQL service, no external API):
 *   DRAC_TEST_ISOLATED_MYSQL=1 DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=root \
 *     php tests/fixtures/item-create-branch-revocation.php
 * Requires PHP 8.2+, pdo_mysql, allow_url_fopen, proc_open, and MySQL on port
 * 3306. The test account needs CREATE/DROP DATABASE, DDL/DML, and PROCESS
 * (for information_schema.INNODB_LOCK_WAITS / INNODB_TRX on MySQL 5.7).
 * Creates its own random drac_item_revoke_test_* database, imports the base
 * schema, warms the actual API, starts a private loopback PHP server, and
 * drops ONLY the database it created. DB_NAME / BASE_URL are never used.
 * No production code is patched, intercepted, or mocked. Run serially with
 * other schema-migration fixtures: the application migration advisory lock
 * is server-wide. MySQL 8 requires a different lock-observation query.
 */

function icbrAssert(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
}

function icbrHttp(string $url, string $token, ?array $payload = null): array
{
    $headers = ['Authorization: Bearer ' . $token, 'Content-Type: application/json'];
    $options = ['method' => $payload === null ? 'GET' : 'POST', 'header' => $headers,
        'ignore_errors' => true, 'timeout' => 25];
    if ($payload !== null) $options['content'] = json_encode($payload, JSON_THROW_ON_ERROR);
    $body = @file_get_contents($url, false, stream_context_create(['http' => $options]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $match);
    return ['status' => (int)($match[1] ?? 0), 'body' => (string)$body];
}

// The same file supplies the asynchronous HTTP client; it never opens a DB.
if (($argv[1] ?? '') === '--request') {
    icbrAssert(getenv('DRAC_TEST_ISOLATED_MYSQL') === '1', 'Test opt-in missing');
    $input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
    icbrAssert((bool)preg_match('~^http://127\.0\.0\.1:[0-9]+/api/index\.php\?route=items$~D', $input['url']), 'Non-test URL refused');
    print json_encode(icbrHttp($input['url'], $input['token'], $input['payload']), JSON_THROW_ON_ERROR);
    exit;
}

$admin = $pdo = null;
$server = $client = null;
$created = false;
$log = null;
$database = 'drac_item_revoke_test_' . bin2hex(random_bytes(6));
$exit = 0;
try {
    icbrAssert(getenv('DRAC_TEST_ISOLATED_MYSQL') === '1', 'Refusing DB access: set DRAC_TEST_ISOLATED_MYSQL=1 only for a disposable local MySQL test service');
    $host = (string)(getenv('DB_HOST') ?: '127.0.0.1');
    icbrAssert(in_array($host, ['127.0.0.1', 'localhost'], true), 'Only loopback disposable MySQL is allowed');
    icbrAssert(extension_loaded('pdo_mysql'), 'pdo_mysql is required; this is not a SQLite/source-only test');
    icbrAssert(function_exists('proc_open') && (bool)ini_get('allow_url_fopen'), 'proc_open and allow_url_fopen are required');
    $user = (string)(getenv('DB_USER') ?: 'root');
    $password = (string)(getenv('DB_PASSWORD') ?: '');
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    $admin = new PDO("mysql:host={$host};port=3306;charset=utf8mb4", $user, $password, $options);
    icbrAssert(str_starts_with((string)$admin->query('SELECT VERSION()')->fetchColumn(), '5.7.'), 'This fixture requires the CI MySQL 5.7 lock-observation tables');
    // No IF NOT EXISTS: a collision must fail, never adopt an existing database.
    $admin->exec("CREATE DATABASE `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $created = true;
    $pdo = new PDO("mysql:host={$host};port=3306;dbname={$database};charset=utf8mb4", $user, $password, $options);
    $root = dirname(__DIR__, 2);
    $pdo->exec(file_get_contents($root . '/database/dokterac_schema.sql'));
    $pdo->exec("SET time_zone = '+08:00'");

    // Explicit child environment prevents inherited application DB settings
    // (or an existing BASE_URL) from redirecting any request to a real system.
    $environment = getenv();
    $environment['DRAC_DB_HOST'] = $host;
    $environment['DRAC_DB_NAME'] = $database;
    $environment['DRAC_DB_USER'] = $user;
    $environment['DRAC_DB_PASS'] = $password;
    unset($environment['PHP_CLI_SERVER_WORKERS']);
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    icbrAssert($socket !== false, 'Cannot reserve loopback port: ' . $error);
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $baseUrl = 'http://' . $address;
    $url = $baseUrl . '/api/index.php?route=items';
    $log = tempnam(sys_get_temp_dir(), 'drac-item-revoke-');
    icbrAssert($log !== false, 'Cannot create server log');
    $server = proc_open([PHP_BINARY, '-S', $address, '-t', $root],
        [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $serverPipes, $root, $environment);
    icbrAssert(is_resource($server), 'Cannot start private API server');
    fclose($serverPipes[0]);
    // Bootstrap all real router migration markers before taking the mutex.
    $deadline = microtime(true) + 40;
    do {
        $ready = icbrHttp($url, 'not-a-session');
        if ($ready['status'] === 401) break;
        icbrAssert(proc_get_status($server)['running'], 'Private API server exited');
        usleep(100000);
    } while (microtime(true) < $deadline);
    icbrAssert($ready['status'] === 401, 'API bootstrap did not reach authentication: ' . json_encode($ready));

    $pdo->exec("INSERT INTO roles(id,code,name,permissions,is_active) VALUES
        ('ICBR-ITEM','ICBRI','Fixture item creator','[\"item:create\"]',1),
        ('ICBR-RECEIPT','ICBRR','Fixture receipt creator','[\"receipt:create\"]',1)");
    $pdo->exec("INSERT INTO users(id,username,name,password,role_id,branch_id,is_active,is_owner) VALUES
        ('ICBR-ITEM','icbr-item','Fixture Item','not-a-login','ICBR-ITEM','BR-001',1,0),
        ('ICBR-RECEIPT','icbr-receipt','Fixture Receipt','not-a-login','ICBR-RECEIPT','BR-001',1,0)");
    $session = $pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at,last_activity,ip_address,user_agent) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR),NOW(),?,?)');
    $grant = $pdo->prepare('INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)');
    $revoke = $pdo->prepare('DELETE FROM user_branch_access WHERE user_id=? AND branch_id=?');
    $blockerId = (int)$pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    $waiting = $admin->prepare("SELECT r.trx_mysql_thread_id, r.trx_query
        FROM information_schema.INNODB_LOCK_WAITS w
        JOIN information_schema.INNODB_TRX r ON r.trx_id=w.requesting_trx_id
        JOIN information_schema.INNODB_TRX b ON b.trx_id=w.blocking_trx_id
        JOIN information_schema.PROCESSLIST p ON p.ID=r.trx_mysql_thread_id
        WHERE b.trx_mysql_thread_id=? AND p.DB=?");

    foreach (['ICBR-ITEM' => false, 'ICBR-RECEIPT' => true] as $actorId => $provisional) {
        $token = bin2hex(random_bytes(24));
        $session->execute([hash('sha256', $token), $actorId, '127.0.0.1', 'CI item branch revocation']);
        $grant->execute([$actorId, 'BR-002']); // Target is NOT the user's home branch.
        $payload = ['id' => $actorId . '-OK', 'code' => $actorId . '-OK',
            'name' => $actorId . ' positive control', 'branchId' => 'BR-002',
            'type' => 'Persediaan', 'categoryId' => '1', 'unit' => 'PCS', 'provisional' => $provisional];
        $response = icbrHttp($url, $token, $payload);
        $body = json_decode($response['body'], true, 512, JSON_THROW_ON_ERROR);
        icbrAssert($response['status'] === 200 && ($body['success'] ?? null) === true
            && ($body['data']['id'] ?? null) === $payload['id'],
            $actorId . ' positive control failed: ' . json_encode($response));
        $control = $pdo->prepare('SELECT verification_status FROM items WHERE id=?');
        $control->execute([$payload['id']]);
        icbrAssert($control->fetchColumn() === ($provisional ? 'Pending' : 'Verified'), 'Positive control item/status not persisted');
        foreach (['branch_item_stocks', 'warehouse_stocks'] as $table) {
            $check = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE item_id=?");
            $check->execute([$payload['id']]);
            icbrAssert((int)$check->fetchColumn() === 1, 'Positive control stock missing in ' . $table);
        }
        $payload['id'] = $payload['code'] = $actorId . '-DENY';
        $payload['name'] = $actorId . ' revoked branch';
        $pdo->beginTransaction();
        icbrAssert($pdo->query("SELECT lock_key FROM inventory_operation_locks WHERE lock_key='global' FOR UPDATE")->fetchColumn() === 'global', 'Inventory mutex missing');
        $client = proc_open([PHP_BINARY, __FILE__, '--request'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', $log, 'a']], $clientPipes, $root, $environment);
        icbrAssert(is_resource($client), 'Cannot start HTTP worker');
        fwrite($clientPipes[0], json_encode(['url' => $url, 'token' => $token, 'payload' => $payload], JSON_THROW_ON_ERROR));
        fclose($clientPipes[0]);
        stream_set_blocking($clientPipes[1], false);
        $deadline = microtime(true) + 12;
        $observed = false;
        do {
            $waiting->execute([$blockerId, $database]);
            foreach ($waiting->fetchAll() as $wait) {
                if (preg_match("/^SELECT lock_key FROM inventory_operation_locks WHERE lock_key='global' FOR UPDATE$/i", trim((string)$wait['trx_query']))) {
                    $observed = true;
                    break;
                }
            }
            if ($observed) break;
            icbrAssert(proc_get_status($client)['running'], 'Request finished before reaching inventory mutex');
            usleep(50000);
        } while (microtime(true) < $deadline);
        icbrAssert($observed, 'No proven post-preflight inventory mutex wait (not a passing race)');
        // Preflight passed with BR-002 granted. Revoke ONLY that grant while
        // retaining permission, active user, role, session and home branch.
        $revoke->execute([$actorId, 'BR-002']);
        icbrAssert($revoke->rowCount() === 1, 'Expected exactly one branch grant revoked');
        $pdo->commit(); // Atomically publish revocation and release mutex.
        $output = '';
        $deadline = microtime(true) + 30;
        do {
            $output .= stream_get_contents($clientPipes[1]);
            if (feof($clientPipes[1])) break;
            usleep(50000);
        } while (microtime(true) < $deadline);
        icbrAssert(feof($clientPipes[1]), 'HTTP worker timed out after mutex release');
        fclose($clientPipes[1]);
        proc_close($client);
        $client = null;
        $response = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        $body = json_decode($response['body'], true, 512, JSON_THROW_ON_ERROR);
        icbrAssert($response['status'] === 403 && ($body['success'] ?? null) === false
            && ($body['message'] ?? '') === 'Akun tidak memiliki akses ke cabang tersebut',
            $actorId . ' expected branch-denial HTTP 403: ' . $output);
        // Read back the exact retained authorization, so a permission/session
        // revocation cannot accidentally stand in for branch-only denial.
        $retained = $pdo->prepare('SELECT u.is_active,u.is_owner,u.branch_id,u.role_id,
            r.is_active AS role_active,r.permissions,s.revoked_at,s.expires_at>NOW() AS session_live
            FROM users u JOIN roles r ON r.id=u.role_id
            JOIN api_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_hash=?');
        $retained->execute([$actorId, hash('sha256', $token)]);
        $authorization = $retained->fetch();
        icbrAssert($authorization !== false && (int)$authorization['is_active'] === 1
            && (int)$authorization['is_owner'] === 0 && $authorization['branch_id'] === 'BR-001'
            && $authorization['role_id'] === $actorId && (int)$authorization['role_active'] === 1
            && $authorization['revoked_at'] === null && (int)$authorization['session_live'] === 1
            && json_decode($authorization['permissions'], true, 512, JSON_THROW_ON_ERROR)
                === [$provisional ? 'receipt:create' : 'item:create'],
            $actorId . ' authorization changed beyond the target branch grant');
        $access = $pdo->prepare('SELECT COUNT(*) FROM user_branch_access WHERE user_id=? AND branch_id=?');
        $access->execute([$actorId, 'BR-002']);
        icbrAssert((int)$access->fetchColumn() === 0, 'Target branch revocation did not persist');
        foreach (['items' => 'id', 'branch_item_stocks' => 'item_id', 'warehouse_stocks' => 'item_id',
            'stock_movements' => 'item_id', 'item_vehicle_brands' => 'item_id',
            'item_vehicle_compatibilities' => 'item_id', 'item_group_members' => 'group_item_id',
            'item_verification_audit' => 'item_id'] as $table => $column) {
            $check = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$column}=?");
            $check->execute([$payload['id']]);
            icbrAssert((int)$check->fetchColumn() === 0, $actorId . ' persisted unauthorized data in ' . $table);
        }
        fwrite(STDOUT, ($provisional ? 'receipt:create provisional' : 'item:create') . ": mutex wait observed; branch revoked; HTTP 403; no item/stock/movement persisted\n");
    }
    fwrite(STDOUT, "item-create-branch-revocation-ok\n");
} catch (Throwable $error) {
    fwrite(STDERR, 'item-create-branch-revocation FAILED: ' . $error->getMessage() . PHP_EOL);
    $exit = 1;
} finally {
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    foreach ([$client, $server] as $process) {
        if (is_resource($process)) {
            proc_terminate($process);
            proc_close($process);
        }
    }
    $pdo = null;
    if ($created && $admin instanceof PDO) {
        try { $admin->exec("DROP DATABASE `{$database}`"); }
        catch (Throwable $error) { fwrite(STDERR, "Cleanup failed for {$database}: " . $error->getMessage() . PHP_EOL); $exit = 1; }
    }
    if (is_string($log) && is_file($log)) {
        if ($exit !== 0) fwrite(STDERR, "Private API log: " . $log . PHP_EOL . file_get_contents($log));
        unlink($log);
    }
}
exit($exit);
