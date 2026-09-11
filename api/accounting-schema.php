<?php
// Additive, resumable runtime migration. No historic recognition or balance backfill.
function ensureAccountingSchema(PDO $pdo): void {
    $key = 'accounting_journal_v1';
    $migration = $pdo->prepare('SELECT 1 FROM app_schema_migrations WHERE migration_key=?');
    $migration->execute([$key]);
    if ($migration->fetchColumn()) {
        return;
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        source_type VARCHAR(32) NOT NULL,
        source_id VARCHAR(64) NULL,
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_lines (
        journal_id VARCHAR(64) NOT NULL,
        line_number INT NOT NULL,
        account_id VARCHAR(64) NOT NULL,
        account_code VARCHAR(64) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        debit DECIMAL(15,2) NOT NULL DEFAULT 0,
        credit DECIMAL(15,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (journal_id, line_number),
        FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    )");

    $driver = strtolower($pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    if ($driver === 'mysql') {
        $pdo->prepare('INSERT IGNORE INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$key]);
    } else {
        $pdo->prepare('INSERT OR IGNORE INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$key]);
    }
}
