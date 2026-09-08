<?php

declare(strict_types=1);

$host = getenv('DB_HOST') ?: '127.0.0.1';
$database = getenv('DB_NAME') ?: 'drac_ledger_fixture';
$user = getenv('DB_USER') ?: 'root';
$password = (string)(getenv('DB_PASSWORD') ?: '');

$pdo = new PDO(
    "mysql:host={$host};dbname={$database};charset=utf8mb4",
    $user,
    $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
);

require dirname(__DIR__, 2) . '/api/helpers.php';

$schema = [
    "CREATE TABLE app_schema_migrations (migration_key VARCHAR(100) NOT NULL PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
    "CREATE TABLE inventory_operation_locks (lock_key VARCHAR(30) NOT NULL PRIMARY KEY) ENGINE=InnoDB",
    "CREATE TABLE warehouses (id VARCHAR(20) NOT NULL PRIMARY KEY, branch_id VARCHAR(20) NOT NULL, is_default TINYINT(1) NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1) ENGINE=InnoDB",
    "CREATE TABLE items (id VARCHAR(20) NOT NULL PRIMARY KEY, type VARCHAR(30) NOT NULL, warehouse_id VARCHAR(20) NULL) ENGINE=InnoDB",
    "CREATE TABLE sales_invoices (id VARCHAR(20) NOT NULL PRIMARY KEY, invoice_number VARCHAR(30) NOT NULL, date DATE NOT NULL, branch_id VARCHAR(20) NOT NULL, backdate_reason VARCHAR(255) NULL) ENGINE=InnoDB",
    "CREATE TABLE sales_invoice_items (id INT NOT NULL PRIMARY KEY, invoice_id VARCHAR(20) NOT NULL, item_id VARCHAR(20) NULL, warehouse_id VARCHAR(20) NULL, qty INT NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE goods_receipts (id VARCHAR(20) NOT NULL PRIMARY KEY, receipt_number VARCHAR(30) NOT NULL, date DATE NOT NULL, branch_id VARCHAR(20) NOT NULL, warehouse_id VARCHAR(20) NULL, source_type VARCHAR(30) NOT NULL DEFAULT 'Supplier', source_warehouse_id VARCHAR(20) NULL, status VARCHAR(30) NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE goods_receipt_items (id INT NOT NULL PRIMARY KEY, receipt_id VARCHAR(20) NOT NULL, item_id VARCHAR(20) NOT NULL, qty INT NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE warehouse_transfers (id VARCHAR(30) NOT NULL PRIMARY KEY, transfer_number VARCHAR(30) NOT NULL, source_warehouse_id VARCHAR(20) NOT NULL, destination_warehouse_id VARCHAR(20) NOT NULL, status VARCHAR(30) NOT NULL, created_by VARCHAR(20) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, sent_at DATETIME NULL, received_at DATETIME NULL) ENGINE=InnoDB",
    "CREATE TABLE warehouse_transfer_items (id INT NOT NULL PRIMARY KEY, transfer_id VARCHAR(30) NOT NULL, item_id VARCHAR(20) NOT NULL, qty_sent INT NOT NULL, qty_received INT NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE stock_movements (id VARCHAR(64) NOT NULL PRIMARY KEY, item_id VARCHAR(20) NOT NULL, source_warehouse_id VARCHAR(20) NULL, destination_warehouse_id VARCHAR(20) NULL, quantity INT NOT NULL, movement_type VARCHAR(30) NOT NULL, reference_type VARCHAR(50) NULL, reference_id VARCHAR(64) NULL, reference_number VARCHAR(50) NULL, notes TEXT NULL, created_by VARCHAR(20) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, occurred_at DATETIME NULL, idempotency_key VARCHAR(100) NULL, is_voided TINYINT(1) NOT NULL DEFAULT 0, UNIQUE KEY uq_stock_movement_idempotency (idempotency_key)) ENGINE=InnoDB",
    "CREATE TABLE warehouse_stocks (warehouse_id VARCHAR(20) NOT NULL, item_id VARCHAR(20) NOT NULL, quantity INT NOT NULL DEFAULT 0, reserved_quantity INT NOT NULL DEFAULT 0, stock_version BIGINT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (warehouse_id,item_id)) ENGINE=InnoDB",
];
foreach ($schema as $statement) {
    $pdo->exec($statement);
}

$pdo->exec("INSERT INTO inventory_operation_locks(lock_key) VALUES('global')");
$pdo->exec("INSERT INTO warehouses(id,branch_id,is_default,is_active) VALUES('W1','B1',1,1),('W2','B1',0,1)");
$pdo->exec("INSERT INTO items(id,type,warehouse_id) VALUES('I1','Persediaan','W1')");
$pdo->exec("INSERT INTO sales_invoices(id,invoice_number,date,branch_id,backdate_reason) VALUES
    ('S-REV','INV-REV','2026-08-01','B1',NULL),
    ('S-HIST','INV-HIST','2026-08-02','B1','Input Cepat Historis (stok tidak dipotong)')");
$pdo->exec("INSERT INTO sales_invoice_items(id,invoice_id,item_id,warehouse_id,qty) VALUES
    (1,'S-REV','I1','W1',-3),
    (2,'S-HIST','I1','W1',5)");
$pdo->exec("INSERT INTO goods_receipts(id,receipt_number,date,branch_id,warehouse_id,source_type,source_warehouse_id,status) VALUES
    ('R-REV','REC-REV','2026-08-03','B1','W1','Supplier',NULL,'Diterima')");
$pdo->exec("INSERT INTO goods_receipt_items(id,receipt_id,item_id,qty) VALUES(1,'R-REV','I1',-4)");
$pdo->exec("INSERT INTO warehouse_transfers(id,transfer_number,source_warehouse_id,destination_warehouse_id,status,created_at,updated_at,sent_at,received_at) VALUES
    ('T1','TR-1','W1','W2','Diterima','2026-08-04 08:00:00','2026-08-04 10:00:00','2026-08-04 09:00:00','2026-08-04 10:00:00')");
$pdo->exec("INSERT INTO warehouse_transfer_items(id,transfer_id,item_id,qty_sent,qty_received) VALUES(1,'T1','I1',5,5)");
$pdo->exec("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_at,is_voided) VALUES
    ('LEG-SEND','I1','W1','W2',5,'transfer','Kirim TR-1','2026-08-04 09:00:00',0),
    ('LEG-RECEIVE','I1','W1','W2',5,'transfer','Terima TR-1','2026-08-04 10:00:00',0),
    ('MOV-BFS-2','I1','W1',NULL,5,'sale','Migrasi penjualan INV-HIST','2026-08-02 12:00:00',0)");

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};
$getMovement = static function (PDO $pdo, string $id): array {
    $statement = $pdo->prepare('SELECT * FROM stock_movements WHERE id=?');
    $statement->execute([$id]);
    $row = $statement->fetch();
    if (!$row) {
        throw new RuntimeException("Movement {$id} tidak ditemukan");
    }
    return $row;
};

ensureInventoryLedgerReady($pdo);

$send = $getMovement($pdo, 'LEG-SEND');
$receive = $getMovement($pdo, 'LEG-RECEIVE');
$assert($send['movement_type'] === 'transfer_send' && $send['reference_id'] === 'T1', 'Leg Kirim legacy tidak dinormalisasi');
$assert($receive['movement_type'] === 'transfer_receive' && $receive['reference_id'] === 'T1', 'Leg Terima legacy tidak dinormalisasi');

$saleReversal = $getMovement($pdo, 'MOV-BFS-1');
$assert((int)$saleReversal['quantity'] === 3, 'Reversal penjualan tidak menyimpan magnitude positif');
$assert($saleReversal['source_warehouse_id'] === null && $saleReversal['destination_warehouse_id'] === 'W1', 'Arah reversal penjualan salah');

$receiptReversal = $getMovement($pdo, 'MOV-BFR-1');
$assert((int)$receiptReversal['quantity'] === 4, 'Reversal penerimaan tidak menyimpan magnitude positif');
$assert($receiptReversal['source_warehouse_id'] === 'W1' && $receiptReversal['destination_warehouse_id'] === null, 'Arah reversal penerimaan salah');

$historical = $getMovement($pdo, 'MOV-BFS-2');
$assert((int)$historical['is_voided'] === 1, 'Faktur historis non-stock masih aktif di ledger');

$beforeSecondRun = (int)$pdo->query('SELECT COUNT(*) FROM stock_movements')->fetchColumn();
ensureInventoryLedgerReady($pdo);
$afterSecondRun = (int)$pdo->query('SELECT COUNT(*) FROM stock_movements')->fetchColumn();
$assert($beforeSecondRun === $afterSecondRun, 'Bootstrap ledger kedua tidak idempotent');

$pdo->exec("INSERT INTO sales_invoices(id,invoice_number,date,branch_id,backdate_reason) VALUES('S-MIN','INV-MIN','2026-08-05','B1',NULL)");
$pdo->exec("INSERT INTO sales_invoice_items(id,invoice_id,item_id,warehouse_id,qty) VALUES(3,'S-MIN','I1','W1',-2147483648)");
$intMinRejected = false;
try {
    ensureInventoryLedgerReady($pdo);
} catch (DomainException $error) {
    $intMinRejected = $error->getMessage() === 'Legacy quantity minimum INT tidak dapat dinormalisasi';
}
$assert($intMinRejected, 'Legacy quantity minimum INT tidak ditolak sebelum backfill');

$pdo->exec("DELETE FROM sales_invoice_items WHERE invoice_id='S-MIN'; DELETE FROM sales_invoices WHERE id='S-MIN'; DELETE FROM stock_movements");
$pdo->exec("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity,reserved_quantity,stock_version) VALUES
    ('W1','I1',100,0,0),('W2','I1',0,0,0)
    ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),reserved_quantity=0,stock_version=0");
$pdo->exec("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,reference_type,reference_id,reference_number,created_at,occurred_at,is_voided) VALUES
    ('H-SEND','I1','W1','W2',10,'transfer_send','warehouse_transfer','T-HIST','TR-HIST','2026-08-10 12:00:00','2026-08-10 12:00:00',0),
    ('H-RECEIVE','I1','W1','W2',6,'transfer_receive','warehouse_transfer','T-HIST','TR-HIST','2026-08-11 12:00:00','2026-08-11 12:00:00',0),
    ('H-CANCEL-RECEIVED','I1','W2','W1',6,'reversal','warehouse_transfer_cancel','T-HIST','TR-HIST','2026-08-12 12:00:00','2026-08-12 12:00:00',0),
    ('H-CANCEL-REMAINING','I1',NULL,'W1',4,'reversal','warehouse_transfer_cancel','T-HIST','TR-HIST','2026-08-12 12:00:00','2026-08-12 12:00:00',0)");
$historicalExpectations = [
    '2026-08-09' => ['W1' => 100, 'W2' => 0],
    '2026-08-10' => ['W1' => 90, 'W2' => 0],
    '2026-08-11' => ['W1' => 90, 'W2' => 6],
    '2026-08-12' => ['W1' => 100, 'W2' => 0],
];
foreach ($historicalExpectations as $cutoff => $warehouseExpectations) {
    foreach ($warehouseExpectations as $warehouseId => $expectedQuantity) {
        $quantities = historicalWarehouseQuantitiesFromLedger($pdo, $warehouseId, $cutoff);
        $assert(($quantities['I1'] ?? null) === $expectedQuantity, "Saldo {$warehouseId} pada {$cutoff} tidak merekonstruksi lifecycle cancel transfer");
    }
}

fwrite(STDOUT, "inventory-ledger-remediation-ok\n");
