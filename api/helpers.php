<?php
// Helper API ditempatkan terpisah agar pembaruan fungsi tidak perlu
// menimpa config.php yang berisi kredensial database hosting.

function normalizeVehiclePlate(string $value): string {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value));
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
    if ((string)$vehicle['customer_id'] !== (string)$customer['id']) {
        throw new InvalidArgumentException('Kendaraan yang dipilih bukan milik pelanggan tersebut.');
    }
    return [$customer, $vehicle];
}

function assertNoActiveWorkOrder(PDO $pdo, string $vehicleRefId, ?string $excludeWoId = null): void {
    $sql = "SELECT wo_number FROM work_orders
            WHERE vehicle_ref_id = ? AND status IN ('Pengecekan', 'Proses', 'Selesai')";
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

    // Setiap cabang memiliki satu gudang utama. ID mengikuti cabang agar deterministik.
    $branches = $pdo->query("SELECT id, code, name FROM branches")->fetchAll();
    $warehouseInsert = $pdo->prepare("
        INSERT IGNORE INTO warehouses (id, code, name, branch_id, is_default, is_sellable, is_active)
        VALUES (?, ?, ?, ?, 1, 1, 1)
    ");
    foreach ($branches as $branch) {
        $warehouseInsert->execute([
            'WH-' . substr(preg_replace('/[^A-Za-z0-9]/', '', $branch['id']), -12),
            'GD-' . $branch['code'],
            'GUDANG UTAMA ' . $branch['name'],
            $branch['id'],
        ]);
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
}

function getBearerToken(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', $header, $match) ? trim($match[1]) : '';
}

function requireAuthenticatedUser(PDO $pdo): array {
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
            SELECT r.idle_timeout_minutes,s.last_activity
            FROM api_sessions s LEFT JOIN user_login_rules r ON r.user_id=s.user_id COLLATE utf8mb4_unicode_ci
            WHERE s.token_hash=?
        ");
        $idleStmt->execute([hash('sha256',$token)]);$idle=$idleStmt->fetch();
        $minutes=(int)($idle['idle_timeout_minutes']??30);
        if($minutes>0&&!empty($idle['last_activity'])&&strtotime($idle['last_activity'])<time()-($minutes*60)){
            $pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE token_hash=?")->execute([hash('sha256',$token)]);
            writeLoginAudit($pdo,$user['id'],$user['username'],'session_revoked','Otomatis logout karena tidak aktif');
            respondError('Sesi berakhir karena tidak ada aktivitas',401);
        }
    }
    $pdo->prepare("UPDATE api_sessions SET last_activity=NOW() WHERE token_hash=?")->execute([hash('sha256', $token)]);
    return $user;
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

        $increment = $pdo->prepare("
            INSERT INTO document_sequences (document_type, branch_id, sequence_date, last_sequence)
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1
        ");
        $increment->execute([$type, $branchId, $date]);

        $select = $pdo->prepare("
            SELECT last_sequence FROM document_sequences
            WHERE document_type = ? AND branch_id = ? AND sequence_date = ?
        ");
        $select->execute([$type, $branchId, $date]);
        $sequence = (int)$select->fetchColumn();

        $dateCode = date('ymd', strtotime($date));
        $branchCode = strtoupper($branchCodes[$branchId] ?? 'X');
        return $prefix . $branchCode . $dateCode . str_pad((string)$sequence, $digits, '0', STR_PAD_LEFT);
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
