<?php
// Helper API ditempatkan terpisah agar pembaruan fungsi tidak perlu
// menimpa config.php yang berisi kredensial database hosting.

if (!function_exists('nextDocumentNumber')) {
    function nextDocumentNumber(PDO $pdo, string $type, string $branchId, ?string $date = null): string {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS document_sequences (
                document_type ENUM('work_order','sales_invoice') NOT NULL,
                branch_id VARCHAR(20) NOT NULL,
                sequence_date DATE NOT NULL,
                last_sequence INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (document_type, branch_id, sequence_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
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
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS branch_item_stocks (
                branch_id VARCHAR(20) NOT NULL,
                item_id VARCHAR(20) NOT NULL,
                stock INT NOT NULL DEFAULT 0,
                sellable_stock INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (branch_id, item_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $itemStmt = $pdo->prepare("SELECT type FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $item = $itemStmt->fetch();
        if (!$item || $item['type'] !== 'Persediaan') return;

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
            JOIN branch_item_stocks s ON s.item_id = i.id AND s.branch_id = i.branch_id
            SET i.stock = s.stock, i.sellable_stock = s.sellable_stock
            WHERE i.id = ? AND i.branch_id = ?
        ");
        $sync->execute([$itemId, $branchId]);
    }
}
