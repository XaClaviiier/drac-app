<?php
require_once __DIR__.'/../../api/inventory-revaluation.php';
function ensureRevaluationTestTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_adjustments (
        id VARCHAR(30) PRIMARY KEY,adjustment_number VARCHAR(40) UNIQUE,adjustment_type VARCHAR(30) NOT NULL DEFAULT 'opening_balance',adjustment_date DATE,status VARCHAR(20) DEFAULT 'Draft',batch_key VARCHAR(64) UNIQUE,notes VARCHAR(255) DEFAULT '',created_by VARCHAR(20),posted_by VARCHAR(20),cancelled_by VARCHAR(20),cancellation_reason VARCHAR(255),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,posted_at DATETIME,cancelled_at DATETIME
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_adjustment_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,adjustment_id VARCHAR(30),item_id VARCHAR(20),warehouse_id VARCHAR(20),item_code VARCHAR(80),item_name VARCHAR(255),unit VARCHAR(30),quantity INT,unit_cost DECIMAL(16,4) NOT NULL DEFAULT 0,target_quantity INT,stock_before INT,line_notes VARCHAR(1000) DEFAULT ''
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_count_results (id VARCHAR(64),order_id VARCHAR(64),status VARCHAR(20),adjustment_id VARCHAR(30)) ENGINE=InnoDB");
    ensureInventoryRevaluationSchema($pdo);
}
