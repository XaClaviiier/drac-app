<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/api/helpers.php';

// Real, ephemeral SQL storage; no application config or external DB connection.
// Only MySQL's table-discovery syntax is adapted. The production historical
// SELECT, effective-date predicate, integer parser and reversal all run unchanged.
// Sales/receipt tables are absent, so ledger backfill is intentionally not tested.
final class LegacySignedOpeningDatabase extends PDO
{
    public function __construct()
    {
        parent::__construct('sqlite::memory:', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->sqliteCreateFunction('CONCAT', static fn (...$parts): string => implode('', $parts));
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        if ($query === "SHOW TABLES LIKE 'sales_invoices'") {
            $query = "SELECT name FROM sqlite_master WHERE type='table' AND name='sales_invoices'";
        }
        return $fetchMode === null
            ? parent::query($query)
            : parent::query($query, $fetchMode, ...$fetchModeArgs);
    }
}

$pdo = new LegacySignedOpeningDatabase();
$pdo->exec('CREATE TABLE warehouse_stocks (warehouse_id TEXT, item_id TEXT, quantity INTEGER)');
$pdo->exec('CREATE TABLE stock_movements (item_id TEXT, source_warehouse_id TEXT, destination_warehouse_id TEXT, quantity INTEGER, movement_type TEXT, occurred_at TEXT, created_at TEXT, is_voided INTEGER)');
// This is the destination-only signed row written by the original opening
// importer (7cfec89), whose effective date was stored in created_at.
$quantity = $argv[1] ?? '-7';
$mode = $argv[2] ?? 'legacy';
$currentQuantity = $mode === 'canonical' ? -(int)$quantity : (int)$quantity;
$pdo->prepare("INSERT INTO warehouse_stocks VALUES ('W1','LEGACY',?)")->execute([$currentQuantity]);
$insert = $pdo->prepare('INSERT INTO stock_movements VALUES (?,?,?,?,?,?,?,?)');
$insert->execute([
    'LEGACY', $mode === 'canonical' ? 'W1' : null, $mode === 'canonical' ? null : 'W1',
    $quantity, 'adjustment', $mode === 'effective' ? '2026-08-10 23:59:59' : null,
    $mode === 'effective' ? '2026-08-20 10:00:00' : '2026-08-10 00:00:00', 0,
]);
// Neither voided entries nor another warehouse may affect the reconstruction.
$insert->execute(['LEGACY', null, 'W1', -99, 'adjustment', null, '2026-08-20 00:00:00', 1]);
$insert->execute(['LEGACY', null, 'W2', -88, 'adjustment', null, '2026-08-20 00:00:00', 0]);

$result = [];
foreach (['2026-08-09', '2026-08-10', '2026-08-11'] as $date) {
    $result[$date] = historicalWarehouseQuantitiesFromLedger($pdo, 'W1', $date);
}
print json_encode($result, JSON_THROW_ON_ERROR) . PHP_EOL;
