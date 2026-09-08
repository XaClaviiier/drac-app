<?php

declare(strict_types=1);

if ($argc !== 4) {
    fwrite(STDERR, "usage: inventory-schema-lock-worker.php <database> <ready-marker> <release-marker>\n");
    exit(2);
}

[, $database, $readyMarker, $releaseMarker] = $argv;
$host = getenv('DB_HOST') ?: '127.0.0.1';
$user = getenv('DB_USER') ?: 'root';
$password = (string)(getenv('DB_PASSWORD') ?: '');
$pdo = new PDO(
    "mysql:host={$host};dbname={$database};charset=utf8mb4",
    $user,
    $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
);

require dirname(__DIR__, 2) . '/api/helpers.php';

withInventorySchemaMigrationLock($pdo, static function (PDO $pdo) use ($readyMarker, $releaseMarker): void {
    $connectionId = (string)$pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    if (file_put_contents($readyMarker, $connectionId, LOCK_EX) === false) {
        throw new RuntimeException('Tidak dapat menulis ready marker schema lock');
    }
    $deadline = microtime(true) + 30;
    while (!is_file($releaseMarker)) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Timeout menunggu release marker schema lock');
        }
        usleep(50_000);
    }
});

fwrite(STDOUT, "inventory-schema-lock-worker-ok\n");
