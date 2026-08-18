<?php
// Helper API ditempatkan terpisah agar pembaruan fungsi tidak perlu
// menimpa config.php yang berisi kredensial database hosting.

function normalizeVehiclePlate(string $value): string {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value));
}

function seedChartOfAccounts(PDO $pdo): array {
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_schema_migrations (
        migration_key VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $migrationKey = 'coa_excel_structure_v1';
    $checkMigration = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
    $checkMigration->execute([$migrationKey]);
    if ((int)$checkMigration->fetchColumn() > 0) {
        $ids = [];
        foreach ($pdo->query('SELECT id,code FROM chart_of_accounts')->fetchAll() as $row) $ids[$row['code']] = $row['id'];
        return $ids;
    }
    $rows = require __DIR__ . '/coa-seed.php';
    $typeMap = [
        'BANK'=>'Asset','OCAS'=>'Asset','AREC'=>'Asset','INTR'=>'Asset','FASS'=>'Asset','DEPR'=>'Asset',
        'LTLY'=>'Liability','OCLY'=>'Liability','APAY'=>'Liability','EQTY'=>'Equity',
        'REVE'=>'Revenue','OINC'=>'Revenue','EXPS'=>'Expense','OEXP'=>'Expense','COGS'=>'Expense',
    ];
    $creditTypes = ['DEPR','LTLY','OCLY','APAY','EQTY','REVE','OINC'];
    $find = $pdo->prepare('SELECT id FROM chart_of_accounts WHERE code=?');
    $insert = $pdo->prepare('INSERT INTO chart_of_accounts(id,code,name,account_type,parent_id,normal_balance,is_active) VALUES(?,?,?,?,NULL,?,?)');
    $update = $pdo->prepare('UPDATE chart_of_accounts SET name=?,account_type=?,normal_balance=?,is_active=? WHERE id=?');
    $ids = [];
    foreach ($rows as [$code,$sourceType,$name,$parentCode,$active]) {
        $find->execute([$code]);
        $id = $find->fetchColumn();
        $accountType = $typeMap[$sourceType] ?? 'Asset';
        $normal = in_array($sourceType,$creditTypes,true) ? 'Credit' : 'Debit';
        if (!$id) {
            $id = 'COA-' . strtoupper(substr(hash('sha256',$code),0,20));
            $insert->execute([$id,$code,$name,$accountType,$normal,$active]);
        } else {
            $update->execute([$name,$accountType,$normal,$active,$id]);
        }
        $ids[$code] = $id;
    }
    $parentUpdate = $pdo->prepare('UPDATE chart_of_accounts SET parent_id=? WHERE id=?');
    foreach ($rows as [$code,$sourceType,$name,$parentCode]) {
        $parentUpdate->execute([$parentCode ? ($ids[$parentCode] ?? null) : null,$ids[$code]]);
    }
    $markMigration = $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)');
    $markMigration->execute([$migrationKey]);
    return $ids;
}

function findVehicleByNormalizedPlate(PDO $pdo, string $plate, ?string $excludeId = null): ?array {
    $rows = $pdo->query("SELECT id, plate_number, customer_name FROM vehicles")->fetchAll();
    foreach ($rows as $row) {
        if ($excludeId !== null && (string)$row['id'] === $excludeId) continue;
        if (normalizeVehiclePlate((string)$row['plate_number']) === $plate) return $row;
    }
    return null;
}

function resolveCustomerVehicle(PDO $pdo, string $customerRefId, string $vehicleRefId, bool $forUpdate = false): array {
    if ($customerRefId === '' || $vehicleRefId === '') {
        throw new InvalidArgumentException('Pelanggan dan kendaraan wajib dipilih dari data master.');
    }
    $lock = $forUpdate ? ' FOR UPDATE' : '';
    $customerStmt = $pdo->prepare("SELECT id, customer_code, name FROM customers WHERE id = ?" . $lock);
    $customerStmt->execute([$customerRefId]);
    $customer = $customerStmt->fetch();
    if (!$customer) throw new InvalidArgumentException('Data pelanggan tidak ditemukan.');

    $vehicleStmt = $pdo->prepare("SELECT id, plate_number, brand, model, year, color, customer_id FROM vehicles WHERE id = ?" . $lock);
    $vehicleStmt->execute([$vehicleRefId]);
    $vehicle = $vehicleStmt->fetch();
    if (!$vehicle) throw new InvalidArgumentException('Data kendaraan tidak ditemukan.');
    $vehicleColor = strtolower(trim((string)($vehicle['color'] ?? '')));
    if ($vehicleColor === '' || $vehicleColor === 'lainnya') {
        throw new InvalidArgumentException('Warna kendaraan belum jelas. Lengkapi warna sebenarnya pada Register Kendaraan sebelum membuat transaksi.');
    }
    if ((string)$vehicle['customer_id'] !== (string)$customer['id']) {
        throw new InvalidArgumentException('Kendaraan yang dipilih bukan milik pelanggan tersebut.');
    }
    return [$customer, $vehicle];
}

function assertNoActiveWorkOrder(PDO $pdo, string $vehicleRefId, ?string $excludeWoId = null): void {
    $sql = "SELECT wo_number FROM work_orders
            WHERE vehicle_ref_id = ?
              AND status IN ('Register', 'Proses')";
    $params = [$vehicleRefId];
    if ($excludeWoId !== null) {
        $sql .= " AND id <> ?";
        $params[] = $excludeWoId;
    }
    $sql .= " LIMIT 1 FOR UPDATE";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $activeNumber = $stmt->fetchColumn();
    if ($activeNumber) throw new DomainException("Kendaraan masih memiliki WO aktif: {$activeNumber}.");
}

function ensureApiSupportTables(PDO $pdo): void {
    $customerColumns = array_column($pdo->query("SHOW COLUMNS FROM customers")->fetchAll(), 'Field');
    if (!in_array('account_type', $customerColumns, true)) $pdo->exec("ALTER TABLE customers ADD account_type ENUM('Pribadi','Perusahaan') NOT NULL DEFAULT 'Pribadi' AFTER name");
    if (!in_array('primary_contact_id', $customerColumns, true)) $pdo->exec("ALTER TABLE customers ADD primary_contact_id VARCHAR(64) NULL AFTER address");
    if (!in_array('billing_contact_id', $customerColumns, true)) $pdo->exec("ALTER TABLE customers ADD billing_contact_id VARCHAR(64) NULL AFTER primary_contact_id");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_people (
        id VARCHAR(64) PRIMARY KEY, customer_id VARCHAR(20) NOT NULL, name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NOT NULL DEFAULT '', email VARCHAR(150) NOT NULL DEFAULT '',
        relationship_label VARCHAR(80) NOT NULL DEFAULT '', is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_customer_people_customer(customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_person_roles (
        person_id VARCHAR(64) NOT NULL,
        role_code ENUM('Owner','PIC','Supir','Keuangan','Pengelola Kendaraan') NOT NULL,
        PRIMARY KEY(person_id,role_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_people (
        vehicle_id VARCHAR(20) NOT NULL, person_id VARCHAR(64) NOT NULL,
        assignment_role ENUM('Owner','Supir') NOT NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(vehicle_id,person_id,assignment_role),
        KEY idx_vehicle_people_person(person_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_master_audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, entity_type VARCHAR(30) NOT NULL,
        entity_id VARCHAR(64) NOT NULL, action_type VARCHAR(30) NOT NULL,
        before_json LONGTEXT NULL, after_json LONGTEXT NULL,
        user_id VARCHAR(64) NULL, user_name VARCHAR(150) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_customer_master_audit(entity_type,entity_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $branchColumns = array_column($pdo->query("SHOW COLUMNS FROM branches")->fetchAll(), 'Field');
    if (!in_array('review_url', $branchColumns, true)) $pdo->exec("ALTER TABLE branches ADD review_url VARCHAR(500) NULL AFTER phone");
    $vehicleColumns = array_column($pdo->query("SHOW COLUMNS FROM vehicles")->fetchAll(), 'Field');
    if (!in_array('brand_id', $vehicleColumns, true)) $pdo->exec("ALTER TABLE vehicles ADD brand_id VARCHAR(64) NULL AFTER model");
    if (!in_array('model_id', $vehicleColumns, true)) $pdo->exec("ALTER TABLE vehicles ADD model_id VARCHAR(64) NULL AFTER brand_id");
    if (!in_array('generation_id', $vehicleColumns, true)) $pdo->exec("ALTER TABLE vehicles ADD generation_id VARCHAR(64) NULL AFTER model_id");
    if (!in_array('generation_name', $vehicleColumns, true)) $pdo->exec("ALTER TABLE vehicles ADD generation_name VARCHAR(100) NOT NULL DEFAULT '' AFTER generation_id");
    if (!in_array('engine_cc', $vehicleColumns, true)) $pdo->exec("ALTER TABLE vehicles ADD engine_cc SMALLINT UNSIGNED NULL AFTER generation_name");
    $pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_generations (
        id VARCHAR(64) PRIMARY KEY, model_id VARCHAR(64) NOT NULL, name VARCHAR(100) NOT NULL,
        aliases VARCHAR(500) NOT NULL DEFAULT '', year_from SMALLINT UNSIGNED NULL,
        year_to SMALLINT UNSIGNED NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_vehicle_generation(model_id,name), KEY idx_generation_model(model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_generation_engines (
        generation_id VARCHAR(64) NOT NULL, engine_cc SMALLINT UNSIGNED NOT NULL,
        PRIMARY KEY(generation_id,engine_cc)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $workOrderColumns = array_column($pdo->query("SHOW COLUMNS FROM work_orders")->fetchAll(), 'Field');
    $continuationAuditColumns = ['continued_at', 'continued_by', 'continued_by_name', 'continued_branch_id'];
    $needsContinuationBackfill = count(array_intersect($continuationAuditColumns, $workOrderColumns)) !== count($continuationAuditColumns);
    if (!in_array('transaction_time', $workOrderColumns, true)) {
        $pdo->exec("ALTER TABLE work_orders ADD transaction_time TIME NOT NULL DEFAULT '00:00:00' AFTER date");
        $pdo->exec("UPDATE work_orders SET transaction_time=TIME(created_at) WHERE transaction_time='00:00:00' AND created_at IS NOT NULL");
    }
    if (!in_array('created_by', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD created_by VARCHAR(64) NULL AFTER branch_id");
    if (!in_array('created_by_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD created_by_name VARCHAR(150) NULL AFTER created_by");
    if (!in_array('technician_id', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD technician_id VARCHAR(64) NULL AFTER created_by_name");
    if (!in_array('technician_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD technician_name VARCHAR(150) NULL AFTER technician_id");
    if (!in_array('continued_at', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD continued_at DATETIME NULL AFTER continued_to_branch_name");
    if (!in_array('continued_by', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD continued_by VARCHAR(64) NULL AFTER continued_at");
    if (!in_array('continued_by_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD continued_by_name VARCHAR(150) NULL AFTER continued_by");
    if (!in_array('continued_branch_id', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD continued_branch_id VARCHAR(20) NULL AFTER continued_by_name");
    if (!in_array('approved_services_json', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD approved_services_json LONGTEXT NULL AFTER approved_at");
    if (!in_array('driver_contact_id', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD driver_contact_id VARCHAR(64) NULL AFTER vehicle_info");
    if (!in_array('driver_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD driver_name VARCHAR(150) NULL AFTER driver_contact_id");
    if (!in_array('driver_phone', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD driver_phone VARCHAR(30) NULL AFTER driver_name");
    if (!in_array('approval_contact_id', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD approval_contact_id VARCHAR(64) NULL AFTER driver_phone");
    if (!in_array('approval_contact_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD approval_contact_name VARCHAR(150) NULL AFTER approval_contact_id");
    if (!in_array('approval_contact_phone', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD approval_contact_phone VARCHAR(30) NULL AFTER approval_contact_name");
    if (!in_array('billing_contact_id', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD billing_contact_id VARCHAR(64) NULL AFTER approval_contact_phone");
    if (!in_array('billing_contact_name', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD billing_contact_name VARCHAR(150) NULL AFTER billing_contact_id");
    if (!in_array('billing_contact_phone', $workOrderColumns, true)) $pdo->exec("ALTER TABLE work_orders ADD billing_contact_phone VARCHAR(30) NULL AFTER billing_contact_name");
    $statusColumn = $pdo->query("SHOW COLUMNS FROM work_orders LIKE 'status'")->fetch();
    if ($statusColumn && (
        stripos((string)$statusColumn['Type'], "'Register'") === false
        || stripos((string)$statusColumn['Type'], "'Proses'") === false
        || stripos((string)$statusColumn['Type'], "'Selesai'") === false
        || stripos((string)$statusColumn['Type'], "'Closed'") === false
        || stripos((string)$statusColumn['Type'], "'Pengecekan'") !== false
        || stripos((string)$statusColumn['Type'], "'Pending'") !== false
        || stripos((string)$statusColumn['Type'], "'Invoiced'") !== false
        || stripos((string)$statusColumn['Type'], "'Dibayar'") !== false
        || stripos((string)$statusColumn['Type'], "'Batal'") !== false
    )) {
        // Tahap pertama tetap menerima nilai status lama agar migrasi tidak
        // mengosongkan enum sebelum seluruh nilai lama dikonversi.
        $pdo->exec("ALTER TABLE work_orders MODIFY COLUMN status ENUM('Register','Pengecekan','Pending','Proses','Selesai','Dibayar','Invoiced','Batal','Closed') DEFAULT 'Register'");
        $pdo->exec("UPDATE work_orders SET status='Register' WHERE status IN ('Pengecekan','Pending')");
        $pdo->exec("UPDATE work_orders SET status='Selesai' WHERE status IN ('Dibayar','Invoiced')");
        $pdo->exec("UPDATE work_orders SET status='Closed' WHERE status='Batal'");
        $pdo->exec("ALTER TABLE work_orders MODIFY COLUMN status ENUM('Register','Proses','Selesai','Closed') DEFAULT 'Register'");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_schema_migrations (
        migration_key VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $customerAccountMigrationKey = 'customer_accounts_and_people_20260818_v1';
    $customerAccountMigrationCheck = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
    $customerAccountMigrationCheck->execute([$customerAccountMigrationKey]);
    if ((int)$customerAccountMigrationCheck->fetchColumn() === 0) {
        $pdo->beginTransaction();
        try {
            $insertPerson = $pdo->prepare("INSERT INTO customer_people(id,customer_id,name,phone,email,relationship_label,is_active) VALUES(?,?,?,?,?,'Pemilik akun',1)");
            $insertRole = $pdo->prepare("INSERT IGNORE INTO customer_person_roles(person_id,role_code) VALUES(?,?)");
            $setPrimary = $pdo->prepare("UPDATE customers SET primary_contact_id=?,billing_contact_id=? WHERE id=?");
            $assignOwnedVehicles = $pdo->prepare("INSERT IGNORE INTO vehicle_people(vehicle_id,person_id,assignment_role,is_primary) SELECT id,?,'Owner',1 FROM vehicles WHERE customer_id=?");
            foreach ($pdo->query("SELECT id,name,phone,email FROM customers WHERE primary_contact_id IS NULL OR primary_contact_id='' FOR UPDATE")->fetchAll() as $customerRow) {
                $personId = 'CP-' . strtoupper(substr(hash('sha256', (string)$customerRow['id']), 0, 24));
                $insertPerson->execute([$personId,$customerRow['id'],$customerRow['name'],$customerRow['phone'] ?? '',$customerRow['email'] ?? '']);
                foreach (['Owner','PIC','Keuangan'] as $roleCode) $insertRole->execute([$personId,$roleCode]);
                $setPrimary->execute([$personId,$personId,$customerRow['id']]);
                $assignOwnedVehicles->execute([$personId,$customerRow['id']]);
            }
            $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$customerAccountMigrationKey]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
    $lostSalesMigrationKey = 'legacy_floating_work_orders_to_lost_sales_20260810_v1';
    $lostSalesMigrationCheck = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
    $lostSalesMigrationCheck->execute([$lostSalesMigrationKey]);
    if ((int)$lostSalesMigrationCheck->fetchColumn() === 0) {
        $pdo->beginTransaction();
        try {
            // Data sebelum hari migrasi yang belum selesai dan belum memiliki
            // faktur adalah prospek/transaksi mengambang, termasuk Register.
            $pdo->exec("
                UPDATE work_orders
                SET status='Closed',
                    cancel_reason=COALESCE(NULLIF(cancel_reason,''), 'Migrasi data lama: transaksi tidak dilanjutkan'),
                    notes=CONCAT_WS(CHAR(10), NULLIF(notes,''), '[MIGRASI] Data lama mengambang diubah menjadi Lost Sales')
                WHERE date < CURRENT_DATE
                  AND status IN ('Register','Proses')
                  AND (invoice_id IS NULL OR invoice_id='')
                  AND (invoice_number IS NULL OR invoice_number='')
            ");
            $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$lostSalesMigrationKey]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
    if ($needsContinuationBackfill) {
        try {
            $pdo->exec("
                UPDATE work_orders source_wo
                JOIN work_orders target_wo
                  ON CONVERT(target_wo.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                   = CONVERT(source_wo.continued_to_wo_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                SET source_wo.continued_at = COALESCE(source_wo.continued_at, target_wo.created_at),
                    source_wo.continued_by = COALESCE(source_wo.continued_by, target_wo.created_by),
                    source_wo.continued_by_name = COALESCE(source_wo.continued_by_name, target_wo.created_by_name),
                    source_wo.continued_branch_id = COALESCE(source_wo.continued_branch_id, target_wo.branch_id)
                WHERE source_wo.continued_to_wo_id IS NOT NULL
            ");
        } catch (Throwable $e) {
            // Audit untuk WO baru tetap berjalan; kegagalan backfill data lama
            // tidak boleh membuat seluruh aplikasi gagal dibuka.
        }
    }
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS document_sequences (
            document_type ENUM('work_order','sales_invoice') NOT NULL,
            branch_id VARCHAR(20) NOT NULL,
            sequence_date DATE NOT NULL,
            last_sequence INT UNSIGNED NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (document_type, branch_id, sequence_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS branch_item_stocks (
            branch_id VARCHAR(20) NOT NULL,
            item_id VARCHAR(20) NOT NULL,
            stock INT NOT NULL DEFAULT 0,
            sellable_stock INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (branch_id, item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS api_sessions (
            token_hash CHAR(64) NOT NULL PRIMARY KEY,
            user_id VARCHAR(20) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_session_user (user_id),
            INDEX idx_session_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $sessionColumns = array_column($pdo->query("SHOW COLUMNS FROM api_sessions")->fetchAll(), 'Field');
    if (!in_array('last_activity', $sessionColumns, true)) $pdo->exec("ALTER TABLE api_sessions ADD last_activity DATETIME NULL AFTER created_at");
    if (!in_array('ip_address', $sessionColumns, true)) $pdo->exec("ALTER TABLE api_sessions ADD ip_address VARCHAR(45) NOT NULL DEFAULT '' AFTER last_activity");
    if (!in_array('user_agent', $sessionColumns, true)) $pdo->exec("ALTER TABLE api_sessions ADD user_agent VARCHAR(255) NOT NULL DEFAULT '' AFTER ip_address");
    if (!in_array('revoked_at', $sessionColumns, true)) $pdo->exec("ALTER TABLE api_sessions ADD revoked_at DATETIME NULL AFTER user_agent");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS user_login_rules (
            user_id VARCHAR(20) NOT NULL PRIMARY KEY,
            session_hours TINYINT UNSIGNED NOT NULL DEFAULT 8,
            schedule_mode ENUM('unrestricted','custom') NOT NULL DEFAULT 'unrestricted',
            schedule_json TEXT NULL,
            single_device TINYINT(1) NOT NULL DEFAULT 0,
            auto_logout TINYINT(1) NOT NULL DEFAULT 1,
            idle_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $ruleColumns = array_column($pdo->query("SHOW COLUMNS FROM user_login_rules")->fetchAll(), 'Field');
    if (!in_array('idle_timeout_minutes', $ruleColumns, true)) $pdo->exec("ALTER TABLE user_login_rules ADD idle_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER auto_logout");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS login_audit_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(20) NULL,
            username VARCHAR(100) NOT NULL,
            event_type ENUM('login_success','login_failed','logout','session_revoked','login_blocked') NOT NULL,
            ip_address VARCHAR(45) NOT NULL DEFAULT '',
            user_agent VARCHAR(255) NOT NULL DEFAULT '',
            notes VARCHAR(255) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_login_user (user_id),
            INDEX idx_login_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ai_config (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            encrypted_api_key TEXT NOT NULL,
            model VARCHAR(100) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            updated_by VARCHAR(20) NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS user_branch_access (
            user_id VARCHAR(20) NOT NULL,
            branch_id VARCHAR(20) NOT NULL,
            PRIMARY KEY (user_id, branch_id),
            INDEX idx_user_branch (branch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS warehouses (
            id VARCHAR(20) NOT NULL PRIMARY KEY,
            code VARCHAR(30) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            branch_id VARCHAR(20) NOT NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            is_sellable TINYINT(1) NOT NULL DEFAULT 1,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_warehouse_branch (branch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL AFTER name");
    $pdo->exec("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER is_sellable");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS warehouse_stocks (
            warehouse_id VARCHAR(20) NOT NULL,
            item_id VARCHAR(20) NOT NULL,
            quantity INT NOT NULL DEFAULT 0,
            reserved_quantity INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (warehouse_id, item_id),
            INDEX idx_stock_item (item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS stock_movements (
            id VARCHAR(30) NOT NULL PRIMARY KEY,
            item_id VARCHAR(20) NOT NULL,
            source_warehouse_id VARCHAR(20) NULL,
            destination_warehouse_id VARCHAR(20) NULL,
            quantity INT NOT NULL,
            movement_type ENUM('transfer','adjustment','receipt','sale') NOT NULL DEFAULT 'transfer',
            notes VARCHAR(255) NOT NULL DEFAULT '',
            created_by VARCHAR(20) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_movement_item (item_id),
            INDEX idx_movement_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS stock_adjustments (
            id VARCHAR(30) NOT NULL PRIMARY KEY,
            adjustment_number VARCHAR(40) NOT NULL UNIQUE,
            adjustment_type VARCHAR(30) NOT NULL DEFAULT 'opening_balance',
            adjustment_date DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Draft',
            batch_key VARCHAR(64) NULL UNIQUE,
            notes VARCHAR(255) NOT NULL DEFAULT '',
            created_by VARCHAR(20) NULL,
            posted_by VARCHAR(20) NULL,
            cancelled_by VARCHAR(20) NULL,
            cancellation_reason VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            posted_at DATETIME NULL,
            cancelled_at DATETIME NULL,
            INDEX idx_stock_adjustment_date (adjustment_date),
            INDEX idx_stock_adjustment_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS stock_adjustment_items (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            adjustment_id VARCHAR(30) NOT NULL,
            item_id VARCHAR(20) NOT NULL,
            warehouse_id VARCHAR(20) NOT NULL,
            item_code VARCHAR(80) NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            unit VARCHAR(30) NOT NULL DEFAULT '',
            quantity INT NOT NULL,
            INDEX idx_stock_adjustment_item_parent (adjustment_id),
            INDEX idx_stock_adjustment_item_item (item_id),
            INDEX idx_stock_adjustment_item_warehouse (warehouse_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_accounts (
        id VARCHAR(64) PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL,
        account_type ENUM('cash','bank','qris') NOT NULL, branch_id VARCHAR(20) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cash_account_branch (branch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id VARCHAR(64) PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL,
        account_type ENUM('Asset','Liability','Equity','Revenue','Expense') NOT NULL,
        parent_id VARCHAR(64) NULL, normal_balance ENUM('Debit','Credit') NOT NULL DEFAULT 'Debit',
        is_active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_coa_parent (parent_id), INDEX idx_coa_type (account_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS branch_account_settings (
        branch_id VARCHAR(20) PRIMARY KEY, cash_account_id VARCHAR(64) NULL,
        bank_account_id VARCHAR(64) NULL, qris_account_id VARCHAR(64) NULL,
        deposit_destination_account_id VARCHAR(64) NULL, receivable_coa_id VARCHAR(64) NULL,
        service_revenue_coa_id VARCHAR(64) NULL, goods_revenue_coa_id VARCHAR(64) NULL,
        inventory_coa_id VARCHAR(64) NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $cashColumns = array_column($pdo->query("SHOW COLUMNS FROM cash_accounts")->fetchAll(), 'Field');
    if (!in_array('ledger_account_id', $cashColumns, true)) $pdo->exec("ALTER TABLE cash_accounts ADD ledger_account_id VARCHAR(64) NULL AFTER branch_id");
    if (!in_array('bank_name', $cashColumns, true)) $pdo->exec("ALTER TABLE cash_accounts ADD bank_name VARCHAR(100) NULL AFTER ledger_account_id");
    if (!in_array('account_number', $cashColumns, true)) $pdo->exec("ALTER TABLE cash_accounts ADD account_number VARCHAR(60) NULL AFTER bank_name");
    if (!in_array('account_holder', $cashColumns, true)) $pdo->exec("ALTER TABLE cash_accounts ADD account_holder VARCHAR(120) NULL AFTER account_number");
    $purchasePaymentTable = $pdo->query("SHOW TABLES LIKE 'purchase_payments'")->fetchColumn();
    if ($purchasePaymentTable) {
        $purchasePaymentColumns = array_column($pdo->query("SHOW COLUMNS FROM purchase_payments")->fetchAll(), 'Field');
        if (!in_array('account_id', $purchasePaymentColumns, true)) $pdo->exec("ALTER TABLE purchase_payments ADD account_id VARCHAR(64) NULL AFTER payment_method");
        if (!in_array('branch_id', $purchasePaymentColumns, true)) $pdo->exec("ALTER TABLE purchase_payments ADD branch_id VARCHAR(64) NULL AFTER notes");
        $pdo->exec("UPDATE purchase_payments pp JOIN purchase_invoices pi ON pi.id COLLATE utf8mb4_unicode_ci=pp.invoice_id COLLATE utf8mb4_unicode_ci SET pp.branch_id=pi.branch_id WHERE pp.branch_id IS NULL OR pp.branch_id=''");
        $pdo->exec("UPDATE purchase_payments SET account_id=bank_account WHERE (account_id IS NULL OR account_id='') AND bank_account IS NOT NULL AND bank_account<>''");
    }
    $coaIds = seedChartOfAccounts($pdo);
    $pdo->exec("UPDATE chart_of_accounts SET is_active=0 WHERE code IN ('1000','1300','4101','4102')");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_payments (
        id VARCHAR(64) PRIMARY KEY, payment_number VARCHAR(40) NOT NULL UNIQUE, invoice_id VARCHAR(64) NOT NULL,
        date DATE NOT NULL, amount DECIMAL(15,2) NOT NULL DEFAULT 0, payment_method VARCHAR(30) NOT NULL DEFAULT 'Tunai',
        account_id VARCHAR(64) NULL, account_name VARCHAR(120) NULL, notes VARCHAR(255) NULL, branch_id VARCHAR(64) NOT NULL,
        created_by VARCHAR(64) NULL, created_by_name VARCHAR(150) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_customer_payment_invoice (invoice_id), INDEX idx_customer_payment_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_payment_sequences (
        branch_id VARCHAR(64) NOT NULL, period CHAR(4) NOT NULL, last_number INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (branch_id, period)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_payment_audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, payment_id VARCHAR(64) NULL,
        payment_number VARCHAR(40) NOT NULL, invoice_id VARCHAR(64) NOT NULL, action VARCHAR(30) NOT NULL,
        reason VARCHAR(255) NULL, snapshot_json LONGTEXT NULL, user_id VARCHAR(64) NULL,
        user_name VARCHAR(150) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payment_audit_invoice (invoice_id), INDEX idx_payment_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS branch_deposits (
        id VARCHAR(64) PRIMARY KEY, deposit_number VARCHAR(40) NOT NULL UNIQUE, date DATE NOT NULL,
        branch_id VARCHAR(20) NOT NULL, source_account_id VARCHAR(64) NOT NULL, destination_account_id VARCHAR(64) NOT NULL,
        amount DECIMAL(15,2) NOT NULL, status ENUM('Dikirim','Terverifikasi','Ditolak') NOT NULL DEFAULT 'Dikirim',
        notes VARCHAR(255) NULL, proof_url VARCHAR(255) NULL, created_by VARCHAR(64) NULL, created_by_name VARCHAR(150) NULL,
        verified_by VARCHAR(64) NULL, verified_by_name VARCHAR(150) NULL, verified_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_deposit_branch (branch_id), INDEX idx_deposit_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS technician_attendance (
        id VARCHAR(64) PRIMARY KEY, attendance_date DATE NOT NULL, user_id VARCHAR(64) NOT NULL,
        user_name VARCHAR(150) NOT NULL, branch_id VARCHAR(20) NOT NULL,
        status ENUM('Hadir','Izin','Sakit','Libur','Alpha') NOT NULL DEFAULT 'Hadir',
        check_in TIME NULL, check_out TIME NULL, late_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        notes VARCHAR(255) NULL, created_by VARCHAR(64) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_attendance_day (attendance_date,user_id,branch_id),
        INDEX idx_attendance_date (attendance_date), INDEX idx_attendance_branch (branch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS bonus_rules (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(150) NOT NULL,
        metric ENUM('attendance_days','completed_work_orders','paid_revenue','late_minutes','absence_days') NOT NULL,
        calculation_mode ENUM('per_unit','threshold') NOT NULL DEFAULT 'per_unit',
        operator_symbol ENUM('gte','lte','eq') NOT NULL DEFAULT 'gte', threshold_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        result_type ENUM('points','fixed') NOT NULL DEFAULT 'points', result_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        branch_id VARCHAR(20) NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
        valid_from DATE NULL, valid_until DATE NULL, created_by VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_bonus_rule_branch (branch_id), INDEX idx_bonus_rule_metric (metric)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS bonus_runs (
        id VARCHAR(64) PRIMARY KEY, period CHAR(7) NOT NULL, branch_id VARCHAR(20) NOT NULL,
        bonus_pool DECIMAL(15,2) NOT NULL DEFAULT 0, total_points DECIMAL(15,2) NOT NULL DEFAULT 0,
        total_bonus DECIMAL(15,2) NOT NULL DEFAULT 0,
        status ENUM('Draft','Disetujui','Dibayar') NOT NULL DEFAULT 'Draft', snapshot_json LONGTEXT NOT NULL,
        created_by VARCHAR(64) NULL, created_by_name VARCHAR(150) NULL, approved_by_name VARCHAR(150) NULL,
        approved_at DATETIME NULL, paid_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_bonus_run_period (period), INDEX idx_bonus_run_branch (branch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $defaultBonusRules = [
        ['BONUS-ATTENDANCE','Hadir penuh','attendance_days','per_unit','gte',0,'points',1],
        ['BONUS-WO','WO selesai','completed_work_orders','per_unit','gte',0,'points',2],
        ['BONUS-REVENUE','Pendapatan terbayar per Rp1 juta','paid_revenue','per_unit','gte',1000000,'points',1],
        ['BONUS-LATE','Penalti keterlambatan per 15 menit','late_minutes','per_unit','gte',15,'points',-0.5],
        ['BONUS-ABSENT','Penalti alpha','absence_days','per_unit','gte',0,'points',-3],
    ];
    $bonusSeed = $pdo->prepare("INSERT IGNORE INTO bonus_rules(id,name,metric,calculation_mode,operator_symbol,threshold_value,result_type,result_value,is_active) VALUES(?,?,?,?,?,?,?,?,1)");
    foreach ($defaultBonusRules as $bonusRule) $bonusSeed->execute($bonusRule);

    // Setiap cabang memiliki satu gudang utama. ID mengikuti cabang agar deterministik.
    $branches = $pdo->query("SELECT id, code, name FROM branches")->fetchAll();
    $branchMappingKey = 'branch_coa_mapping_v1';
    $branchMappingCheck = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
    $branchMappingCheck->execute([$branchMappingKey]);
    $branchMappingPending = (int)$branchMappingCheck->fetchColumn() === 0;
    $warehouseInsert = $pdo->prepare("
        INSERT IGNORE INTO warehouses (id, code, name, branch_id, is_default, is_sellable, is_active)
        VALUES (?, ?, ?, ?, 1, 1, 1)
    ");
    if (!empty($branches)) {
        $pdo->prepare("INSERT IGNORE INTO warehouses(id,code,name,address,branch_id,is_default,is_sellable,is_system,is_active) VALUES('WH-TRANSIT','TRANSIT','Transit (AOL System)','Gudang sementara barang dalam perjalanan',?,0,0,1,1)")
            ->execute([(string)$branches[0]['id']]);
    }
    foreach ($branches as $branch) {
        $warehouseInsert->execute([
            'WH-' . substr(preg_replace('/[^A-Za-z0-9]/', '', $branch['id']), -12),
            'GD-' . $branch['code'],
            'GUDANG UTAMA ' . $branch['name'],
            $branch['id'],
        ]);
        $normalizedBranch = strtoupper((string)$branch['name']);
        $branchLedger = str_contains($normalizedBranch,'PERINTIS')
            ? ['PR.110102','PR.110101']
            : (str_contains($normalizedBranch,'CAKALANG') ? ['CK.1101-01','CK.1101-02'] : (str_contains($normalizedBranch,'MAMUJU') ? ['MM.1101-01','MM.1101-02'] : [null,null]));
        if ($branchLedger[0] && isset($coaIds[$branchLedger[0]],$coaIds[$branchLedger[1]])) {
            $cashId = 'CASH-' . $branch['id'];
            $bankId = 'BANK-' . $branch['id'];
            $cashAccount = $pdo->prepare("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id,is_active) VALUES(?,?,?,?,?,?,1)
                ON DUPLICATE KEY UPDATE name=VALUES(name),account_type='cash',branch_id=VALUES(branch_id),ledger_account_id=VALUES(ledger_account_id),is_active=1");
            $cashAccount->execute([$cashId,'KAS-'.$branch['code'],'KAS TUNAI '.$branch['name'],'cash',$branch['id'],$coaIds[$branchLedger[0]]]);
            $bankAccount = $pdo->prepare("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id,is_active) VALUES(?,?,?,?,?,?,1)
                ON DUPLICATE KEY UPDATE name=VALUES(name),account_type='bank',branch_id=VALUES(branch_id),ledger_account_id=VALUES(ledger_account_id),is_active=1");
            $bankAccount->execute([$bankId,'BANK-'.$branch['code'],'BANK / TRANSFER '.$branch['name'],'bank',$branch['id'],$coaIds[$branchLedger[1]]]);
            if ($branchMappingPending) {
                $setting = $pdo->prepare("INSERT INTO branch_account_settings(branch_id,cash_account_id,bank_account_id,qris_account_id,deposit_destination_account_id,receivable_coa_id,service_revenue_coa_id,goods_revenue_coa_id,inventory_coa_id)
                    VALUES(?,?,?,NULL,?,?,?,?,?) ON DUPLICATE KEY UPDATE cash_account_id=VALUES(cash_account_id),bank_account_id=VALUES(bank_account_id),qris_account_id=NULL,deposit_destination_account_id=VALUES(deposit_destination_account_id),receivable_coa_id=VALUES(receivable_coa_id),service_revenue_coa_id=VALUES(service_revenue_coa_id),goods_revenue_coa_id=VALUES(goods_revenue_coa_id),inventory_coa_id=VALUES(inventory_coa_id)");
                $setting->execute([$branch['id'],$cashId,$bankId,$bankId,$coaIds['110301'],$coaIds['400002'],$coaIds['400001'],$coaIds['110401']]);
            }
        }
    }
    if ($branchMappingPending) {
        $markBranchMapping = $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)');
        $markBranchMapping->execute([$branchMappingKey]);
    }
    $pdo->exec("UPDATE cash_accounts SET is_active=0 WHERE account_type='qris' OR code LIKE '%QRIS%'");

    // Database yang sudah pernah dipakai dapat memiliki tabel pembayaran versi lama.
    // Lengkapi kolom akun di sini (di dalam bootstrap schema), bukan di helper
    // validasi tanggal yang belum tentu pernah dipanggil.
    if ($pdo->query("SHOW TABLES LIKE 'customer_payments'")->fetch()) {
        $paymentColumns = array_column($pdo->query("SHOW COLUMNS FROM customer_payments")->fetchAll(), 'Field');
        if (!in_array('account_id', $paymentColumns, true)) {
            $pdo->exec("ALTER TABLE customer_payments ADD account_id VARCHAR(64) NULL AFTER payment_method");
        }
        if (!in_array('account_name', $paymentColumns, true)) {
            $pdo->exec("ALTER TABLE customer_payments ADD account_name VARCHAR(120) NULL AFTER account_id");
        }
        // QRIS lama digabung ke Transfer dan diarahkan ke bank cabang.
        $pdo->exec("UPDATE customer_payments SET payment_method='Transfer' WHERE payment_method IN ('QRIS','QRIS/Transfer')");
        if ($pdo->query("SHOW TABLES LIKE 'sales_invoices'")->fetch()) {
            $pdo->exec("UPDATE sales_invoices SET payment_method='Transfer' WHERE payment_method IN ('QRIS','QRIS/Transfer')");
        }
        $pdo->exec("
            UPDATE customer_payments p
            JOIN branch_account_settings s ON s.branch_id COLLATE utf8mb4_unicode_ci=p.branch_id COLLATE utf8mb4_unicode_ci
            JOIN cash_accounts a ON a.id COLLATE utf8mb4_unicode_ci=(CASE
                WHEN p.payment_method='Tunai' THEN s.cash_account_id ELSE s.bank_account_id END) COLLATE utf8mb4_unicode_ci
            LEFT JOIN cash_accounts old_a ON old_a.id COLLATE utf8mb4_unicode_ci=p.account_id COLLATE utf8mb4_unicode_ci
            SET p.account_id=a.id,p.account_name=a.name
            WHERE p.account_id IS NULL OR p.account_name IS NULL
               OR (p.payment_method<>'Tunai' AND old_a.account_type<>'bank')
        ");
    }
    // Hak pembayaran berdiri sendiri. Role lama otomatis mewarisi hak yang
    // setara dari modul faktur agar tidak kehilangan menu setelah pembaruan.
    if ($pdo->query("SHOW TABLES LIKE 'roles'")->fetch()) {
        $roleRows = $pdo->query("SELECT id,code,name,permissions FROM roles")->fetchAll();
        $roleUpdate = $pdo->prepare("UPDATE roles SET permissions=? WHERE id=?");
        foreach ($roleRows as $roleRow) {
            $permissions = json_decode((string)($roleRow['permissions'] ?? '[]'), true);
            if (!is_array($permissions)) $permissions = [];
            $next = $permissions;
            if (in_array('invoice:view', $permissions, true)) $next[] = 'payment:view';
            if (in_array('invoice:create', $permissions, true) || in_array('invoice:edit', $permissions, true)) $next[] = 'payment:create';
            if (in_array('invoice:delete', $permissions, true) || in_array('invoice:edit', $permissions, true)) $next[] = 'payment:delete';
            $roleCode = strtoupper(trim((string)($roleRow['code'] ?? '')));
            $roleName = strtolower(trim((string)($roleRow['name'] ?? '')));
            if ($roleCode === 'ADM' || str_contains($roleName, 'administrator')) $next[] = 'payment:edit';
            $next = array_values(array_unique($next));
            if ($next !== $permissions) $roleUpdate->execute([json_encode($next), $roleRow['id']]);
        }
    }
    $pdo->exec("
        INSERT IGNORE INTO warehouse_stocks (warehouse_id, item_id, quantity, reserved_quantity)
        SELECT w.id, s.item_id, s.stock, GREATEST(0, s.stock - s.sellable_stock)
        FROM branch_item_stocks s
        JOIN warehouses w ON w.branch_id COLLATE utf8mb4_unicode_ci = s.branch_id AND w.is_default = 1
    ");
    $pdo->exec("
        INSERT IGNORE INTO user_branch_access (user_id, branch_id)
        SELECT u.id, b.id FROM users u JOIN branches b WHERE u.is_owner = 1
    ");
    $pdo->exec("
        INSERT IGNORE INTO user_branch_access (user_id, branch_id)
        SELECT id, branch_id FROM users WHERE branch_id IS NOT NULL AND branch_id <> ''
    ");
    if ($pdo->query("SHOW TABLES LIKE 'sales_invoices'")->fetch()) {
        $invoiceColumns = array_column($pdo->query("SHOW COLUMNS FROM sales_invoices")->fetchAll(), 'Field');
        if (!in_array('payment_method', $invoiceColumns, true)) {
            $pdo->exec("ALTER TABLE sales_invoices ADD payment_method VARCHAR(30) NOT NULL DEFAULT 'Tunai' AFTER payment");
        }
    }
    runProductionIntegrityRepair20260808($pdo);
    runProductionIntegrityRepair20260808StatusRestore($pdo);
    runVehicleOtherColorCleanup20260817($pdo);
}

function getBearerToken(): string {
    // Cookie HttpOnly menjadi sumber utama. Bearer token tetap didukung
    // sementara agar sesi lama tidak terputus saat pembaruan diterapkan.
    $cookieToken = trim((string)($_COOKIE['drac_session'] ?? ''));
    if ($cookieToken !== '') return $cookieToken;
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', $header, $match) ? trim($match[1]) : '';
}

function requireAuthenticatedUser(PDO $pdo): array {
    static $authenticatedUser = null;
    if (is_array($authenticatedUser)) return $authenticatedUser;

    $token = getBearerToken();
    if ($token === '') respondError('Sesi login diperlukan', 401);
    $stmt = $pdo->prepare("
        SELECT u.* FROM api_sessions s
        JOIN users u ON u.id = s.user_id COLLATE utf8mb4_unicode_ci
        WHERE s.token_hash = ? AND s.expires_at > NOW() AND s.revoked_at IS NULL AND u.is_active = 1
    ");
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) respondError('Sesi login tidak valid atau kedaluwarsa', 401);
    if (empty($user['is_owner'])) {
        $idleStmt=$pdo->prepare("
            SELECT
                COALESCE(r.idle_timeout_minutes, 30) AS idle_timeout_minutes,
                CASE
                    WHEN s.last_activity IS NOT NULL
                     AND COALESCE(r.idle_timeout_minutes, 30) > 0
                     AND TIMESTAMPDIFF(SECOND, s.last_activity, NOW()) >= COALESCE(r.idle_timeout_minutes, 30) * 60
                    THEN 1 ELSE 0
                END AS idle_expired
            FROM api_sessions s LEFT JOIN user_login_rules r ON r.user_id=s.user_id COLLATE utf8mb4_unicode_ci
            WHERE s.token_hash=?
        ");
        $idleStmt->execute([hash('sha256',$token)]);$idle=$idleStmt->fetch();
        $minutes=(int)($idle['idle_timeout_minutes']??30);
        // Bandingkan waktu sepenuhnya di MySQL. Membandingkan DATETIME MySQL
        // dengan time() PHP dapat langsung mengeluarkan user saat zona waktu
        // server database berbeda dengan zona waktu PHP.
        if($minutes>0&&!empty($idle['idle_expired'])){
            $pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE token_hash=?")->execute([hash('sha256',$token)]);
            writeLoginAudit($pdo,$user['id'],$user['username'],'session_revoked','Otomatis logout karena tidak aktif');
            respondError('Sesi berakhir karena tidak ada aktivitas',401);
        }
    }
    $pdo->prepare("UPDATE api_sessions SET last_activity=NOW() WHERE token_hash=?")->execute([hash('sha256', $token)]);
    $authenticatedUser = $user;
    return $authenticatedUser;
}

function getUserPermissions(PDO $pdo, array $user): array {
    if (!empty($user['is_owner'])) return ['*'];
    $stmt = $pdo->prepare("SELECT code, name, permissions FROM roles WHERE id = ? AND is_active = 1 LIMIT 1");
    $stmt->execute([$user['role_id'] ?? '']);
    $role = $stmt->fetch();
    if (!$role) return [];

    $permissions = json_decode((string)($role['permissions'] ?? '[]'), true);
    $permissions = is_array($permissions) ? array_map('strval', $permissions) : [];

    // Role Teknisi dari instalasi lama belum selalu memiliki izin mobile
    // untuk registrasi WO. Berikan baseline operasional yang sama seperti
    // role Teknisi baru, tanpa membuka invoice, laporan, atau pengaturan.
    $roleCode = strtoupper(trim((string)($role['code'] ?? '')));
    $roleName = strtolower(trim((string)($role['name'] ?? '')));
    if ($roleCode === 'TKN' || str_contains($roleName, 'teknisi') || str_contains($roleName, 'technician')) {
        $permissions = array_merge($permissions, [
            'ai:view',
            'wo:view', 'wo:create',
            'customer:view', 'customer:create', 'customer:edit',
            'vehicle:view', 'vehicle:create', 'vehicle:edit',
            'item:view',
        ]);
    }

    return array_values(array_unique($permissions));
}

function authenticatedUserHasPermission(PDO $pdo, array $user, string $permission): bool {
    return !empty($user['is_owner']) || in_array($permission, getUserPermissions($pdo, $user), true);
}

function requireAuthenticatedUserPermission(PDO $pdo, array $user, string $permission): void {
    if (authenticatedUserHasPermission($pdo, $user, $permission)) return;
    respondError('Akun tidak memiliki izin ' . $permission, 403);
}

function getAccessibleBranchIds(PDO $pdo, array $user): array {
    if (!empty($user['is_owner']) || authenticatedUserHasPermission($pdo, $user, 'all_branches')) {
        return array_map('strval', array_column($pdo->query("SELECT id FROM branches WHERE is_active = 1 ORDER BY id")->fetchAll(), 'id'));
    }

    $ids = getUserBranchIds($pdo, (string)$user['id']);
    if (!empty($user['branch_id'])) $ids[] = (string)$user['branch_id'];
    return array_values(array_unique(array_filter(array_map('strval', $ids))));
}

function requireAccessibleBranch(PDO $pdo, array $user, ?string $branchId): void {
    if ($branchId === null || $branchId === '') respondError('Cabang wajib dipilih', 422);
    if (!in_array($branchId, getAccessibleBranchIds($pdo, $user), true)) {
        respondError('Akun tidak memiliki akses ke cabang tersebut', 403);
    }
}

function requestIp(): string {
    return substr((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function requestUserAgent(): string {
    return substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
}

function writeLoginAudit(PDO $pdo, ?string $userId, string $username, string $event, string $notes = ''): void {
    $pdo->prepare("INSERT INTO login_audit_logs(user_id,username,event_type,ip_address,user_agent,notes) VALUES(?,?,?,?,?,?)")
        ->execute([$userId,$username,$event,requestIp(),requestUserAgent(),substr($notes,0,255)]);
}

function requireOwner(PDO $pdo): array {
    $user = requireAuthenticatedUser($pdo);
    if (!(bool)($user['is_owner'] ?? false)) respondError('Hanya Owner yang dapat mengatur Integrasi AI', 403);
    return $user;
}

function getUserBranchIds(PDO $pdo, string $userId): array {
    $stmt = $pdo->prepare("SELECT branch_id FROM user_branch_access WHERE user_id = ? ORDER BY branch_id");
    $stmt->execute([$userId]);
    return array_column($stmt->fetchAll(), 'branch_id');
}

function defaultWarehouseId(PDO $pdo, string $branchId): string {
    $stmt = $pdo->prepare("SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1");
    $stmt->execute([$branchId]);
    $id = $stmt->fetchColumn();
    if (!$id) throw new Exception("Gudang utama cabang {$branchId} tidak ditemukan");
    return (string)$id;
}

function aiEncryptionKey(): string {
    return hash('sha256', DB_PASS . '|dokter-ac-mobil|ai', true);
}

function encryptSecret(string $value): string {
    $iv = random_bytes(16);
    $encrypted = openssl_encrypt($value, 'AES-256-CBC', aiEncryptionKey(), OPENSSL_RAW_DATA, $iv);
    if ($encrypted === false) throw new Exception('Gagal mengenkripsi API Key');
    return base64_encode($iv . $encrypted);
}

function decryptSecret(string $value): string {
    $raw = base64_decode($value, true);
    if ($raw === false || strlen($raw) <= 16) throw new Exception('Data API Key tidak valid');
    $decrypted = openssl_decrypt(substr($raw, 16), 'AES-256-CBC', aiEncryptionKey(), OPENSSL_RAW_DATA, substr($raw, 0, 16));
    if ($decrypted === false) throw new Exception('Gagal membaca API Key');
    return $decrypted;
}

if (!function_exists('nextDocumentNumber')) {
    function nextDocumentNumber(PDO $pdo, string $type, string $branchId, ?string $date = null): string {
        $date = $date ?: date('Y-m-d');
        $prefix = $type === 'work_order' ? 'WO-' : 'INV-';
        $branchCodes = ['BR-001' => 'D', 'BR-002' => 'C', 'BR-003' => 'M'];
        $digits = 3;

        $settingsTable = $pdo->query("SHOW TABLES LIKE 'app_settings'")->fetch();
        if ($settingsTable) {
            $row = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
            $settings = $row ? json_decode($row['settings_json'], true) : null;
            if (is_array($settings)) {
                $branchCodes = $settings['branchDocumentCodes'] ?? $branchCodes;
                $documents = $settings['documents'] ?? [];
                $prefix = $type === 'work_order'
                    ? ($documents['workOrderPrefix'] ?? $prefix)
                    : ($documents['invoicePrefix'] ?? $prefix);
                $digits = max(3, min(6, (int)($documents['sequenceDigits'] ?? 3)));
            }
        }

        $sequenceDate = $type === 'sales_invoice' ? date('Y-01-01', strtotime($date)) : $date;
        $increment = $pdo->prepare("
            INSERT INTO document_sequences (document_type, branch_id, sequence_date, last_sequence)
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1
        ");
        $increment->execute([$type, $branchId, $sequenceDate]);

        $select = $pdo->prepare("
            SELECT last_sequence FROM document_sequences
            WHERE document_type = ? AND branch_id = ? AND sequence_date = ?
        ");
        $select->execute([$type, $branchId, $sequenceDate]);
        $sequence = (int)$select->fetchColumn();

        $dateCode = date('ymd', strtotime($date));
        $branchCode = strtoupper($branchCodes[$branchId] ?? 'X');
        if ($type === 'sales_invoice') {
            $branchNumbers = ['BR-001' => '3', 'BR-002' => '2', 'BR-003' => '1'];
            return $branchCode . date('y', strtotime($date)) . ($branchNumbers[$branchId] ?? '0')
                . str_pad((string)$sequence, 3, '0', STR_PAD_LEFT);
        }
        return $prefix . $branchCode . $dateCode . str_pad((string)$sequence, $digits, '0', STR_PAD_LEFT);
    }
}

if (!function_exists('nextCustomerPaymentNumber')) {
    function nextCustomerPaymentNumber(PDO $pdo, string $branchId, string $branchCode, string $date): string {
        $period = date('ym', strtotime($date));
        $code = strtoupper(substr(trim($branchCode) ?: 'P', 0, 1));
        $prefix = 'PAY-' . $code . $period;

        // Kunci satu baris urutan per cabang/periode agar dua kasir tidak memperoleh
        // nomor yang sama. Nomor lama tetap diperiksa karena data migrasi atau nomor
        // yang pernah dibuat sebelum tabel sequence tersedia dapat lebih besar.
        $pdo->prepare("INSERT IGNORE INTO customer_payment_sequences(branch_id,period,last_number) VALUES(?,?,0)")
            ->execute([$branchId, $period]);
        $lock = $pdo->prepare("SELECT last_number FROM customer_payment_sequences WHERE branch_id=? AND period=? FOR UPDATE");
        $lock->execute([$branchId, $period]);
        $stored = (int)$lock->fetchColumn();

        $suffixStart = strlen($prefix) + 1;
        $maxStmt = $pdo->prepare("SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number, {$suffixStart}) AS UNSIGNED)),0)
            FROM customer_payments WHERE payment_number LIKE ?");
        $maxStmt->execute([$prefix . '%']);
        $next = max($stored, (int)$maxStmt->fetchColumn()) + 1;

        $exists = $pdo->prepare("SELECT 1 FROM customer_payments WHERE payment_number=? LIMIT 1");
        do {
            $number = $prefix . str_pad((string)$next, 3, '0', STR_PAD_LEFT);
            $exists->execute([$number]);
            if ($exists->fetchColumn()) $next++;
            else break;
        } while (true);

        $pdo->prepare("UPDATE customer_payment_sequences SET last_number=? WHERE branch_id=? AND period=?")
            ->execute([$next, $branchId, $period]);
        return $number;
    }
}

if (!function_exists('adjustBranchStock')) {
    function adjustBranchStock(PDO $pdo, string $branchId, string $itemId, int $delta): void {
        $itemStmt = $pdo->prepare("SELECT type FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $item = $itemStmt->fetch();
        if (!$item || $item['type'] !== 'Persediaan') return;
        $warehouseId = defaultWarehouseId($pdo, $branchId);

        $warehouseCurrent = $pdo->prepare("
            SELECT quantity FROM warehouse_stocks
            WHERE warehouse_id = ? AND item_id = ? FOR UPDATE
        ");
        $warehouseCurrent->execute([$warehouseId, $itemId]);
        $warehouseQty = $warehouseCurrent->fetchColumn();
        if ($delta < 0 && (($warehouseQty === false ? 0 : (int)$warehouseQty) + $delta < 0)) {
            throw new Exception("Stok item {$itemId} di gudang utama cabang {$branchId} tidak mencukupi");
        }
        $warehouseUpsert = $pdo->prepare("
            INSERT INTO warehouse_stocks (warehouse_id, item_id, quantity, reserved_quantity)
            VALUES (?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE quantity = GREATEST(0, quantity + VALUES(quantity))
        ");
        $warehouseUpsert->execute([$warehouseId, $itemId, $delta]);

        $currentStmt = $pdo->prepare("
            SELECT stock, sellable_stock FROM branch_item_stocks
            WHERE branch_id = ? AND item_id = ? FOR UPDATE
        ");
        $currentStmt->execute([$branchId, $itemId]);
        $current = $currentStmt->fetch();

        if ($delta < 0 && (!$current ||
            (int)$current['stock'] + $delta < 0 ||
            (int)$current['sellable_stock'] + $delta < 0)) {
            throw new Exception("Stok item {$itemId} di cabang {$branchId} tidak mencukupi");
        }

        if ($delta >= 0) {
            $stmt = $pdo->prepare("
                INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    stock = GREATEST(0, stock + VALUES(stock)),
                    sellable_stock = GREATEST(0, sellable_stock + VALUES(sellable_stock))
            ");
            $stmt->execute([$branchId, $itemId, $delta, $delta]);
        } else {
            $stmt = $pdo->prepare("
                UPDATE branch_item_stocks
                SET stock = GREATEST(0, stock + ?),
                    sellable_stock = GREATEST(0, sellable_stock + ?)
                WHERE branch_id = ? AND item_id = ?
            ");
            $stmt->execute([$delta, $delta, $branchId, $itemId]);
        }

        $sync = $pdo->prepare("
            UPDATE items i
            JOIN branch_item_stocks s
              ON s.item_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
             AND s.branch_id COLLATE utf8mb4_unicode_ci = i.branch_id COLLATE utf8mb4_unicode_ci
            SET i.stock = s.stock, i.sellable_stock = s.sellable_stock
            WHERE i.id = ? AND i.branch_id = ?
        ");
        $sync->execute([$itemId, $branchId]);
    }
}

/**
 * Terapkan mutasi stok penjualan tanpa memblokir transaksi.
 * Saldo boleh negatif dan akan dipulihkan oleh penerimaan atau penyesuaian stok.
 */
function isBackdateReasonRequired(PDO $pdo): bool {
    try {
        $row = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
        if (!$row) return true;
        $settings = json_decode($row['settings_json'], true);
        return ($settings['security']['requireBackdateReason'] ?? true) !== false;
    } catch (Throwable $e) {
        return true;
    }
}

function requireUserPermission(PDO $pdo, string $permission): array {
    $user = requireAuthenticatedUser($pdo);
    if (!authenticatedUserHasPermission($pdo, $user, $permission)) {
        $labels = [
            'wo:create' => 'Buat WO', 'invoice:create' => 'Buat Faktur',
            'wo:backdate' => 'Input WO Tanggal Mundur',
            'invoice:backdate' => 'Input Faktur Tanggal Mundur',
            'payment:backdate' => 'Input Pembayaran Tanggal Mundur',
            'payment:view' => 'Lihat Pembayaran', 'payment:create' => 'Buat Pembayaran',
            'payment:edit' => 'Edit Pembayaran', 'payment:delete' => 'Hapus Pembayaran',
        ];
        respondError('Akun tidak memiliki izin ' . ($labels[$permission] ?? $permission), 403);
    }
    return $user;
}

function adjustBranchStockAllowNegative(PDO $pdo, string $branchId, string $itemId, int $delta): void {
    $itemStmt = $pdo->prepare("SELECT type FROM items WHERE id = ?");
    $itemStmt->execute([$itemId]);
    $item = $itemStmt->fetch();
    if (!$item || $item['type'] !== 'Persediaan') return;

    $warehouseId = defaultWarehouseId($pdo, $branchId);
    $warehouseUpsert = $pdo->prepare("
        INSERT INTO warehouse_stocks (warehouse_id, item_id, quantity, reserved_quantity)
        VALUES (?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
    ");
    $warehouseUpsert->execute([$warehouseId, $itemId, $delta]);

    $branchUpsert = $pdo->prepare("
        INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            stock = stock + VALUES(stock),
            sellable_stock = sellable_stock + VALUES(sellable_stock)
    ");
    $branchUpsert->execute([$branchId, $itemId, $delta, $delta]);

    $sync = $pdo->prepare("
        UPDATE items i
        JOIN branch_item_stocks s
          ON s.item_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
         AND s.branch_id COLLATE utf8mb4_unicode_ci = i.branch_id COLLATE utf8mb4_unicode_ci
        SET i.stock = s.stock, i.sellable_stock = s.sellable_stock
        WHERE i.id = ? AND i.branch_id = ?
    ");
    $sync->execute([$itemId, $branchId]);
}

function adjustWarehouseStockAllowNegative(PDO $pdo, string $warehouseId, string $branchId, string $itemId, int $delta): void {
    $warehouseStmt = $pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id=?");
    $warehouseStmt->execute([$warehouseId]);
    $warehouse = $warehouseStmt->fetch();
    if (!$warehouse || !(bool)$warehouse['is_active'] || (string)$warehouse['branch_id'] !== $branchId) {
        throw new InvalidArgumentException('Gudang tujuan tidak valid atau bukan milik cabang penerimaan');
    }
    $itemStmt = $pdo->prepare("SELECT type FROM items WHERE id=?");
    $itemStmt->execute([$itemId]);
    if ($itemStmt->fetchColumn() !== 'Persediaan') return;
    $pdo->prepare("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity,reserved_quantity) VALUES(?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)")
        ->execute([$warehouseId,$itemId,$delta]);
    $pdo->prepare("INSERT INTO branch_item_stocks(branch_id,item_id,stock,sellable_stock) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE stock=stock+VALUES(stock),sellable_stock=sellable_stock+VALUES(sellable_stock)")
        ->execute([$branchId,$itemId,$delta,$delta]);
    $pdo->prepare("UPDATE items i JOIN branch_item_stocks s ON s.item_id COLLATE utf8mb4_unicode_ci=i.id COLLATE utf8mb4_unicode_ci AND s.branch_id COLLATE utf8mb4_unicode_ci=i.branch_id COLLATE utf8mb4_unicode_ci SET i.stock=s.stock,i.sellable_stock=s.sellable_stock WHERE i.id=? AND i.branch_id=?")
        ->execute([$itemId,$branchId]);
}

/**
 * Perbaikan satu-kali untuk inkonsistensi relasi WO, faktur, dan pembayaran
 * yang ditemukan pada audit produksi 8 Agustus 2026.
 *
 * Semua baris yang diubah disalin dahulu ke data_repair_snapshots. Migrasi
 * sengaja tidak membuat ulang status_log lama karena waktu/aktor historisnya
 * tidak dapat dipastikan tanpa mengarang data audit.
 */
function runProductionIntegrityRepair20260808(PDO $pdo): void {
    $repairKey = 'repair_20260808_wo_invoice_integrity_v1';
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS app_schema_migrations (
            migration_key VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS data_repair_snapshots (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            repair_key VARCHAR(100) NOT NULL,
            entity_type VARCHAR(60) NOT NULL,
            entity_id VARCHAR(100) NOT NULL,
            snapshot_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_repair_snapshot_key (repair_key),
            INDEX idx_repair_snapshot_entity (entity_type, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $check = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
        $check->execute([$repairKey]);
        if ((int)$check->fetchColumn() > 0) return;
        if (!$pdo->query("SHOW TABLES LIKE 'sales_invoices'")->fetch()) return;

        $pdo->beginTransaction();
        $snapshotStmt = $pdo->prepare("INSERT INTO data_repair_snapshots
            (repair_key,entity_type,entity_id,snapshot_json) VALUES(?,?,?,?)");
        $snapshot = static function (string $type, string $id, array $row) use ($snapshotStmt, $repairKey): void {
            $json = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) throw new RuntimeException('Gagal membuat snapshot perbaikan data.');
            $snapshotStmt->execute([$repairKey, $type, $id, $json]);
        };

        $deleteInvoice = static function (array $invoice, string $reason) use ($pdo, $snapshot): void {
            $invoiceId = (string)$invoice['id'];
            $snapshot('sales_invoice:' . $reason, $invoiceId, $invoice);

            $paymentStmt = $pdo->prepare('SELECT * FROM customer_payments WHERE invoice_id=? ORDER BY id FOR UPDATE');
            $paymentStmt->execute([$invoiceId]);
            foreach ($paymentStmt->fetchAll() as $payment) {
                $snapshot('customer_payment:' . $reason, (string)$payment['id'], $payment);
            }

            $detailStmt = $pdo->prepare('SELECT * FROM sales_invoice_items WHERE invoice_id=? ORDER BY id FOR UPDATE');
            $detailStmt->execute([$invoiceId]);
            $details = $detailStmt->fetchAll();
            foreach ($details as $detail) {
                $detailId = isset($detail['id']) ? (string)$detail['id'] : $invoiceId . ':' . (string)($detail['item_id'] ?? '');
                $snapshot('sales_invoice_item:' . $reason, $detailId, $detail);
                $itemId = (string)($detail['item_id'] ?? '');
                if ($itemId === '') continue;
                $itemStmt = $pdo->prepare('SELECT type FROM items WHERE id=?');
                $itemStmt->execute([$itemId]);
                if ((string)$itemStmt->fetchColumn() !== 'Persediaan') continue;

                $branchId = (string)($invoice['branch_id'] ?? '');
                $stockStmt = $pdo->prepare('SELECT * FROM branch_item_stocks WHERE branch_id=? AND item_id=? FOR UPDATE');
                $stockStmt->execute([$branchId, $itemId]);
                $stockRow = $stockStmt->fetch();
                if ($stockRow) $snapshot('branch_item_stock_before_restore', $branchId . ':' . $itemId . ':' . $invoiceId, $stockRow);
                adjustBranchStockAllowNegative($pdo, $branchId, $itemId, (int)$detail['qty']);
            }

            $pdo->prepare('DELETE FROM customer_payments WHERE invoice_id=?')->execute([$invoiceId]);
            $pdo->prepare('DELETE FROM sales_invoice_items WHERE invoice_id=?')->execute([$invoiceId]);
            $pdo->prepare('DELETE FROM sales_invoices WHERE id=?')->execute([$invoiceId]);
        };

        $workOrders = $pdo->query('SELECT * FROM work_orders FOR UPDATE')->fetchAll();
        $woById = [];
        $woByNumber = [];
        foreach ($workOrders as $wo) {
            $woById[(string)$wo['id']] = $wo;
            $woByNumber[(string)$wo['wo_number']] = $wo;
        }

        $invoices = $pdo->query('SELECT * FROM sales_invoices ORDER BY created_at,id FOR UPDATE')->fetchAll();
        $invoicesByWo = [];
        foreach ($invoices as $invoice) {
            $woId = trim((string)($invoice['wo_id'] ?? ''));
            if ($woId !== '') $invoicesByWo[$woId][] = $invoice;
        }

        // Hapus hanya duplikat jika WO secara eksplisit menunjuk faktur yang dipertahankan.
        foreach ($invoicesByWo as $woId => $linkedInvoices) {
            if (count($linkedInvoices) < 2 || !isset($woById[$woId])) continue;
            $keepId = (string)($woById[$woId]['invoice_id'] ?? '');
            $knownIds = array_map(static fn(array $row): string => (string)$row['id'], $linkedInvoices);
            if ($keepId === '' || !in_array($keepId, $knownIds, true)) continue;
            foreach ($linkedInvoices as $invoice) {
                if ((string)$invoice['id'] !== $keepId) $deleteInvoice($invoice, 'duplicate');
            }
        }

        // Muat ulang setelah duplikat dibersihkan.
        $remainingInvoices = $pdo->query('SELECT * FROM sales_invoices ORDER BY created_at,id FOR UPDATE')->fetchAll();
        foreach ($remainingInvoices as $invoice) {
            $woId = trim((string)($invoice['wo_id'] ?? ''));
            $invoiceId = (string)$invoice['id'];
            $paymentCountStmt = $pdo->prepare('SELECT COUNT(*) FROM customer_payments WHERE invoice_id=?');
            $paymentCountStmt->execute([$invoiceId]);
            $isEmptyFinancialDocument = (float)$invoice['total'] == 0.0
                && (float)$invoice['payment'] == 0.0
                && (int)$paymentCountStmt->fetchColumn() === 0;
            if (!$isEmptyFinancialDocument || $woId === '') continue;

            if (!isset($woById[$woId])) {
                $deleteInvoice($invoice, 'orphan_zero');
                continue;
            }
            $wo = $woById[$woId];
            if ((string)($wo['invoice_id'] ?? '') !== $invoiceId) {
                $snapshot('work_order_before_invoice_unlink', $woId, $wo);
                $deleteInvoice($invoice, 'non_invoiced_zero');
                $pdo->prepare("UPDATE work_orders SET invoice_id=NULL,invoice_number=NULL WHERE id=?")
                    ->execute([$woId]);
            }
        }

        // Empat nilai ini terbukti tidak sama dengan total detail layanan pada audit.
        $estimateNumbers = ['WO-D260801003','WO-C260730001','WO-C260730002','WO-C260609001'];
        $estimateUpdate = $pdo->prepare('UPDATE work_orders SET estimate_total=total WHERE id=?');
        foreach ($estimateNumbers as $woNumber) {
            if (!isset($woByNumber[$woNumber])) continue;
            $wo = $woByNumber[$woNumber];
            if ((float)$wo['estimate_total'] == (float)$wo['total']) continue;
            $snapshot('work_order_before_estimate_normalization', (string)$wo['id'], $wo);
            $estimateUpdate->execute([(string)$wo['id']]);
        }

        $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$repairKey]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Production integrity repair 20260808 failed: ' . $e->getMessage());
    }
}

/** Pulihkan dua status WO yang terdampak aksi referensial saat faktur salah dibersihkan. */
function runProductionIntegrityRepair20260808StatusRestore(PDO $pdo): void {
    $repairKey = 'repair_20260808_wo_invoice_integrity_v2';
    try {
        $check = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
        $check->execute([$repairKey]);
        if ((int)$check->fetchColumn() > 0) return;

        $pdo->beginTransaction();
        $snapshotStmt = $pdo->prepare("INSERT INTO data_repair_snapshots
            (repair_key,entity_type,entity_id,snapshot_json) VALUES(?,?,?,?)");

        // WO ini mempunyai satu faktur sah dan lunas. Kembalikan tautan dua arahnya.
        $invoicedWoStmt = $pdo->prepare("SELECT * FROM work_orders WHERE wo_number=? FOR UPDATE");
        $invoicedWoStmt->execute(['WO-D260801005']);
        $invoicedWo = $invoicedWoStmt->fetch();
        if ($invoicedWo && ((string)($invoicedWo['invoice_id'] ?? '') === '' || (string)$invoicedWo['status'] !== 'Selesai')) {
            $invoiceStmt = $pdo->prepare("SELECT * FROM sales_invoices WHERE wo_id=? ORDER BY id FOR UPDATE");
            $invoiceStmt->execute([(string)$invoicedWo['id']]);
            $linkedInvoices = $invoiceStmt->fetchAll();
            if (count($linkedInvoices) === 1
                && (float)$linkedInvoices[0]['total'] > 0
                && (float)$linkedInvoices[0]['payment'] >= (float)$linkedInvoices[0]['total']) {
                $snapshotStmt->execute([
                    $repairKey,
                    'work_order_before_valid_invoice_relink',
                    (string)$invoicedWo['id'],
                    json_encode($invoicedWo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $pdo->prepare("UPDATE work_orders SET status='Selesai',invoice_id=?,invoice_number=? WHERE id=?")
                    ->execute([(string)$linkedInvoices[0]['id'], (string)$linkedInvoices[0]['invoice_number'], (string)$invoicedWo['id']]);
            }
        }

        // Faktur nol yang salah pada WO ini sudah dihapus. Dalam alur ringkas,
        // keputusan yang belum berlanjut dikembalikan ke Register.
        $pendingWoStmt = $pdo->prepare("SELECT * FROM work_orders WHERE wo_number=? FOR UPDATE");
        $pendingWoStmt->execute(['WO-C260728001']);
        $pendingWo = $pendingWoStmt->fetch();
        if ($pendingWo && (string)$pendingWo['status'] !== 'Register') {
            $invoiceCountStmt = $pdo->prepare('SELECT COUNT(*) FROM sales_invoices WHERE wo_id=?');
            $invoiceCountStmt->execute([(string)$pendingWo['id']]);
            if ((int)$invoiceCountStmt->fetchColumn() === 0 && !empty($pendingWo['pending_reason'])) {
                $snapshotStmt->execute([
                    $repairKey,
                    'work_order_before_pending_restore',
                    (string)$pendingWo['id'],
                    json_encode($pendingWo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $pdo->prepare("UPDATE work_orders SET status='Register',invoice_id=NULL,invoice_number=NULL WHERE id=?")
                    ->execute([(string)$pendingWo['id']]);
            }
        }

        $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$repairKey]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Production integrity status restore 20260808 failed: ' . $e->getMessage());
    }
}

/**
 * Bersihkan pilihan warna semu "Lainnya" tanpa menghapus kendaraan, WO, atau
 * faktur. Setiap baris disalin ke data_repair_snapshots sebelum diubah.
 * Kendaraan lama dikosongkan warnanya agar wajib dilengkapi dengan warna nyata
 * pada penyuntingan berikutnya.
 */
function runVehicleOtherColorCleanup20260817(PDO $pdo): void {
    $repairKey = 'repair_20260817_remove_vehicle_color_lainnya_v1';
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS app_schema_migrations (
            migration_key VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS data_repair_snapshots (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            repair_key VARCHAR(100) NOT NULL, entity_type VARCHAR(60) NOT NULL,
            entity_id VARCHAR(100) NOT NULL, snapshot_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_repair_snapshot_key (repair_key),
            INDEX idx_repair_snapshot_entity (entity_type, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $check = $pdo->prepare('SELECT COUNT(*) FROM app_schema_migrations WHERE migration_key=?');
        $check->execute([$repairKey]);
        if ((int)$check->fetchColumn() > 0) return;

        $pdo->beginTransaction();
        $snapshotStmt = $pdo->prepare("INSERT INTO data_repair_snapshots
            (repair_key,entity_type,entity_id,snapshot_json) VALUES(?,?,?,?)");
        $snapshot = static function (string $type, string $id, array $row) use ($snapshotStmt, $repairKey): void {
            $json = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) throw new RuntimeException('Gagal membuat snapshot pembersihan warna kendaraan.');
            $snapshotStmt->execute([$repairKey, $type, $id, $json]);
        };

        if ($pdo->query("SHOW TABLES LIKE 'vehicles'")->fetch()) {
            $vehicles = $pdo->query("SELECT * FROM vehicles WHERE LOWER(TRIM(color))='lainnya' FOR UPDATE")->fetchAll();
            $updateVehicle = $pdo->prepare("UPDATE vehicles SET color='', notes=CASE
                WHEN notes LIKE '%[PERLU DILENGKAPI] Warna kendaraan%' THEN notes
                WHEN TRIM(COALESCE(notes,''))='' THEN '[PERLU DILENGKAPI] Warna kendaraan belum diisi.'
                ELSE CONCAT(notes, '\n[PERLU DILENGKAPI] Warna kendaraan belum diisi.') END WHERE id=?");
            foreach ($vehicles as $vehicle) {
                $snapshot('vehicle_before_other_color_cleanup', (string)$vehicle['id'], $vehicle);
                $updateVehicle->execute([(string)$vehicle['id']]);
            }
        }

        foreach (['work_orders' => 'work_order', 'sales_invoices' => 'sales_invoice'] as $table => $entityType) {
            if (!$pdo->query("SHOW TABLES LIKE '{$table}'")->fetch()) continue;
            $rows = $pdo->query("SELECT * FROM {$table} WHERE LOWER(vehicle_info) LIKE '%lainnya%' FOR UPDATE")->fetchAll();
            $update = $pdo->prepare("UPDATE {$table} SET vehicle_info=? WHERE id=?");
            foreach ($rows as $row) {
                $oldInfo = (string)($row['vehicle_info'] ?? '');
                $newInfo = trim((string)preg_replace('/\s*(?:-|–|—|\/)\s*Lainnya\b|\s*\(\s*Lainnya\s*\)/iu', '', $oldInfo));
                $newInfo = preg_replace('/\s{2,}/u', ' ', $newInfo) ?? $newInfo;
                if ($newInfo === $oldInfo) continue;
                $snapshot($entityType . '_before_other_color_cleanup', (string)$row['id'], $row);
                $update->execute([$newInfo, (string)$row['id']]);
            }
        }

        if ($pdo->query("SHOW TABLES LIKE 'vehicle_colors'")->fetch()) {
            $colors = $pdo->query("SELECT * FROM vehicle_colors WHERE LOWER(TRIM(name))='lainnya' FOR UPDATE")->fetchAll();
            foreach ($colors as $color) $snapshot('vehicle_color_before_delete', (string)$color['id'], $color);
            $pdo->exec("DELETE FROM vehicle_colors WHERE LOWER(TRIM(name))='lainnya'");
        }

        $pdo->prepare('INSERT INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$repairKey]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Vehicle other color cleanup 20260817 failed: ' . $e->getMessage());
    }
}

function branchCashSummary(PDO $pdo, ?array $actor = null): array {
    $sql="SELECT b.id branch_id,b.name branch_name,a.id account_id,a.name account_name,
        COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.branch_id COLLATE utf8mb4_unicode_ci=b.id COLLATE utf8mb4_unicode_ci AND p.account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0) cash_received,
        COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.branch_id COLLATE utf8mb4_unicode_ci=b.id COLLATE utf8mb4_unicode_ci AND pp.account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0) cash_expenses,
        COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.branch_id COLLATE utf8mb4_unicode_ci=b.id COLLATE utf8mb4_unicode_ci AND d.source_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status IN ('Dikirim','Terverifikasi')),0) deposited
        FROM branches b JOIN cash_accounts a ON a.branch_id COLLATE utf8mb4_unicode_ci=b.id COLLATE utf8mb4_unicode_ci AND a.account_type='cash' WHERE b.is_active=1 AND a.is_active=1";
    $rows=$pdo->query($sql)->fetchAll();
    if($actor){$allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);$rows=array_values(array_filter($rows,fn($row)=>isset($allowed[(string)$row['branch_id']])));}
    foreach($rows as &$r){
        $r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['accountId']=$r['account_id'];$r['accountName']=$r['account_name'];
        $r['cashReceived']=(float)$r['cash_received'];$r['cashExpenses']=(float)$r['cash_expenses'];$r['deposited']=(float)$r['deposited'];
        $r['unsubmitted']=max(0,$r['cashReceived']-$r['cashExpenses']-$r['deposited']);
    }
    return $rows;
}
