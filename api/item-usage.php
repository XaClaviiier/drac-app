<?php
/** Pemakaian operasional: dokumen tersendiri, memakai ledger persediaan bersama. */
function ensureItemUsageSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_usages (
        id VARCHAR(64) PRIMARY KEY, usage_number VARCHAR(60) NOT NULL UNIQUE,
        usage_date DATE NOT NULL, branch_id VARCHAR(64) NOT NULL, warehouse_id VARCHAR(64) NOT NULL,
        purpose VARCHAR(1000) NOT NULL, responsible_name VARCHAR(120) NOT NULL,
        expense_account_id VARCHAR(64) NULL, inventory_account_id VARCHAR(64) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Draft', revision INT NOT NULL DEFAULT 0,
        total_value DECIMAL(18,2) NOT NULL DEFAULT 0,
        request_key VARCHAR(64) NOT NULL UNIQUE, request_hash CHAR(64) NOT NULL,
        created_by VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        posted_by VARCHAR(64) NULL, posted_at DATETIME NULL,
        cancelled_by VARCHAR(64) NULL, cancelled_at DATETIME NULL, cancellation_reason VARCHAR(1000) NULL,
        INDEX idx_usage_branch_date(branch_id,usage_date), INDEX idx_usage_warehouse(warehouse_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_usage_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usage_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL, item_code VARCHAR(100) NOT NULL, item_name VARCHAR(255) NOT NULL,
        unit VARCHAR(30) NOT NULL, quantity INT NOT NULL,
        unit_cost DECIMAL(18,4) NOT NULL DEFAULT 0, total_value DECIMAL(18,2) NOT NULL DEFAULT 0,
        stock_before INT NULL, movement_id VARCHAR(64) NULL, line_notes VARCHAR(500) NOT NULL DEFAULT '',
        UNIQUE KEY uq_usage_item(usage_id,item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function grantInitialItemUsagePermissions(PDO $pdo): void {
    $pdo->beginTransaction();
    try {
        $roles = $pdo->query('SELECT id,code,name,permissions FROM roles ORDER BY id FOR UPDATE')->fetchAll();
        $update = $pdo->prepare('UPDATE roles SET permissions=? WHERE id=?');
        foreach ($roles as $role) {
            $permissions = json_decode((string)$role['permissions'], true);
            $permissions = is_array($permissions) ? $permissions : [];
            $next = $permissions;
            foreach (['view','create','edit','delete'] as $action) {
                if (in_array('item:'.$action, $permissions, true)) $next[] = 'item_usage:'.$action;
            }
            if (strtoupper((string)$role['code']) === 'ADM' || strtolower((string)$role['name']) === 'administrator') {
                foreach (['view','create','edit','post','cancel','delete'] as $action) $next[] = 'item_usage:'.$action;
            }
            $next = array_values(array_unique($next));
            if ($next !== $permissions) $update->execute([json_encode($next), $role['id']]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function itemUsageDate($value): string {
    $date = is_string($value) ? $value : '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts)
        || !checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1]) || $parts[1] < '1000') {
        throw new InvalidArgumentException('Tanggal pemakaian tidak valid');
    }
    return $date;
}

function itemUsageText($value, int $limit, string $label, bool $required = false): string {
    if (!is_scalar($value) && $value !== null) throw new InvalidArgumentException($label.' tidak valid');
    $text = trim((string)$value);
    if (($required && $text === '') || strlen($text) > $limit) throw new InvalidArgumentException($label.' wajib diisi, maksimal '.$limit.' karakter');
    return $text;
}

function normalizeItemUsage(array $input): array {
    $lines = $input['rows'] ?? null;
    if (!is_array($lines) || !$lines || count($lines) > 500) throw new InvalidArgumentException('Isi 1–500 barang pemakaian');
    $rows = [];
    foreach ($lines as $line) {
        if (!is_array($line)) throw new InvalidArgumentException('Rincian barang tidak valid');
        $itemId = itemUsageText($line['itemId'] ?? '', 64, 'Barang', true);
        if (isset($rows[$itemId])) throw new InvalidArgumentException('Barang yang sama cukup dimasukkan satu kali');
        $rows[$itemId] = [
            'itemId' => $itemId,
            'quantity' => parseBoundedDecimalInteger($line['quantity'] ?? null, '1', '2147483647', 'Jumlah dipakai'),
            'lineNotes' => itemUsageText($line['lineNotes'] ?? '', 500, 'Keterangan barang'),
        ];
    }
    ksort($rows, SORT_STRING);
    return [
        'date' => itemUsageDate($input['date'] ?? ''),
        'warehouseId' => itemUsageText($input['warehouseId'] ?? '', 64, 'Gudang', true),
        'purpose' => itemUsageText($input['purpose'] ?? '', 1000, 'Keperluan', true),
        'responsibleName' => itemUsageText($input['responsibleName'] ?? '', 120, 'Penanggung jawab', true),
        'expenseAccountId' => itemUsageText($input['expenseAccountId'] ?? '', 64, 'Akun biaya'),
        'rows' => array_values($rows),
    ];
}

function itemUsageAccount(PDO $pdo, string $id, string $type, string $label): void {
    $stmt = $pdo->prepare('SELECT a.id,a.account_type,a.is_active,EXISTS(SELECT 1 FROM chart_of_accounts c WHERE c.parent_id=a.id) has_children FROM chart_of_accounts a WHERE a.id=? FOR UPDATE');
    $stmt->execute([$id]);
    $account = $stmt->fetch();
    if (!$account || !$account['is_active'] || $account['account_type'] !== $type || $account['has_children']) {
        throw new InvalidArgumentException($label.' harus berupa akun detail '.$type.' yang aktif');
    }
}

function itemUsageAmount(float $cost, int $quantity): float {
    $value = round($cost * $quantity, 2);
    if (!is_finite($value) || $value < 0 || $value > 999999999999.99) throw new InvalidArgumentException('Nilai pemakaian melebihi batas');
    return $value;
}

function saveItemUsageLines(PDO $pdo, string $id, array $input): void {
    $items = lockActiveInventoryItems($pdo, array_column($input['rows'], 'itemId'));
    $pdo->prepare('DELETE FROM item_usage_items WHERE usage_id=?')->execute([$id]);
    $insert = $pdo->prepare('INSERT INTO item_usage_items(usage_id,item_id,item_code,item_name,unit,quantity,unit_cost,total_value,line_notes) VALUES(?,?,?,?,?,?,?,?,?)');
    $total = 0.0;
    foreach ($input['rows'] as $line) {
        $item = $items[$line['itemId']];
        $cost = round(estimateInventoryUnitCost($pdo, $line['itemId'], $input['warehouseId'], $input['date']), 4);
        $value = itemUsageAmount($cost, $line['quantity']);
        $insert->execute([$id,$item['id'],$item['code'],$item['name'],$item['unit'],$line['quantity'],$cost,$value,$line['lineNotes']]);
        $total += $value;
    }
    itemUsageAmount($total, 1);
    $pdo->prepare('UPDATE item_usages SET total_value=? WHERE id=?')->execute([$total,$id]);
}

function itemUsageAudit(PDO $pdo, array $actor, array $doc, string $action, string $reason, array $snapshot): void {
    // Kolom audit bersama dibatasi 255 karakter; alasan lengkap tetap di snapshot.
    preg_match('/^.{0,255}/us', $reason, $summary);
    $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('item_usage',?,?,?,?,?,?,?)")
        ->execute([$doc['id'],$doc['usage_number'],$action,$summary[0] ?? '',json_encode(['reason'=>$reason]+$snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$actor['id'],$actor['name'] ?? '']);
}

function postItemUsage(PDO $pdo, array $doc, array $actor): void {
    $warehouse = lockActiveInventoryWarehouses($pdo, [$doc['warehouse_id']])[$doc['warehouse_id']];
    if ((string)$warehouse['branch_id'] !== (string)$doc['branch_id']) throw new DomainException('Cabang gudang berubah. Periksa Draft.', 409);
    $stmt = $pdo->prepare('SELECT * FROM item_usage_items WHERE usage_id=? ORDER BY item_id FOR UPDATE');
    $stmt->execute([$doc['id']]);
    $lines = $stmt->fetchAll();
    if (!$lines) throw new InvalidArgumentException('Rincian pemakaian kosong');
    lockActiveInventoryItems($pdo, array_column($lines, 'item_id'));
    $defaults = getDefaultAccountSettings($pdo, $doc['branch_id']);
    $inventory = resolveDefaultCoaId($pdo, $defaults, 'inventoryCoaId', '110401');
    itemUsageAccount($pdo, (string)$doc['expense_account_id'], 'Expense', 'Akun biaya pemakaian');
    itemUsageAccount($pdo, $inventory, 'Asset', 'Akun persediaan');
    $total = 0.0;
    foreach ($lines as $line) {
        $quantity = parseBoundedDecimalInteger($line['quantity'], '1', '2147483647', 'Jumlah dipakai');
        $stock = $pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE');
        $stock->execute([$doc['warehouse_id'],$line['item_id']]);
        $before = (int)($stock->fetchColumn() ?: 0);
        if ($before < $quantity) throw new DomainException('Stok '.$line['item_name'].' tidak cukup (tersedia '.$before.' '.$line['unit'].')', 409);
        $cost = round(estimateInventoryUnitCost($pdo, $line['item_id'], $doc['warehouse_id'], $doc['usage_date']), 4);
        if ($cost <= 0) throw new InvalidArgumentException('Data persediaan '.$line['item_name'].' belum lengkap. Hubungi administrator sebelum posting.');
        $value = itemUsageAmount($cost, $quantity);
        $total += $value;
        adjustWarehouseStock($pdo, $doc['warehouse_id'], $doc['branch_id'], $line['item_id'], -$quantity);
        $movementId = recordStockMovement($pdo,$line['item_id'],$doc['warehouse_id'],null,$quantity,'usage','item_usage',$doc['id'],$doc['usage_number'],'Pemakaian '.$doc['usage_number'].' — '.$doc['purpose'],$actor['id'],$doc['usage_date'].' 12:00:00',null,null,'item_usage:'.$line['id'],$cost);
        $pdo->prepare('UPDATE item_usage_items SET unit_cost=?,total_value=?,stock_before=?,movement_id=? WHERE id=?')->execute([$cost,$value,$before,$movementId,$line['id']]);
    }
    itemUsageAmount($total, 1);
    if ($total <= 0) throw new InvalidArgumentException('Nilai pemakaian harus lebih dari nol');
    postOperationalJournal($pdo,$doc['usage_date'],'Pemakaian barang '.$doc['usage_number'],$doc['branch_id'],'item_usage',$doc['id'],'USAGE',[
        [$doc['expense_account_id'],$total,0,'Pemakaian '.$doc['usage_number']],[$inventory,0,$total,'Pemakaian persediaan'],
    ],$actor['id']);
    $pdo->prepare("UPDATE item_usages SET status='Posted',total_value=?,inventory_account_id=?,posted_by=?,posted_at=NOW(),revision=revision+1 WHERE id=?")
        ->execute([$total,$inventory,$actor['id'],$doc['id']]);
    $stmt->execute([$doc['id']]);
    itemUsageAudit($pdo,$actor,$doc,'post',$doc['purpose'],['totalValue'=>$total,'rows'=>$stmt->fetchAll()]);
}

function cancelItemUsage(PDO $pdo, array $doc, array $actor, string $reason): void {
    $warehouse = lockActiveInventoryWarehouses($pdo, [$doc['warehouse_id']])[$doc['warehouse_id']];
    if ((string)$warehouse['branch_id'] !== (string)$doc['branch_id']) throw new DomainException('Cabang gudang berubah', 409);
    $stmt = $pdo->prepare('SELECT * FROM item_usage_items WHERE usage_id=? ORDER BY item_id FOR UPDATE');
    $stmt->execute([$doc['id']]);
    $lines = $stmt->fetchAll();
    if (!$lines) throw new DomainException('Rincian pemakaian tidak ditemukan', 409);
    foreach ($lines as $line) {
        $item = $pdo->prepare('SELECT type FROM items WHERE id=? FOR UPDATE');
        $item->execute([$line['item_id']]);
        if ($item->fetchColumn() !== 'Persediaan') throw new DomainException('Tipe barang '.$line['item_name'].' berubah', 409);
        adjustWarehouseStockAllowNegative($pdo,$doc['warehouse_id'],$doc['branch_id'],$line['item_id'],(int)$line['quantity']);
        recordStockMovement($pdo,$line['item_id'],null,$doc['warehouse_id'],(int)$line['quantity'],'reversal','item_usage',$doc['id'],$doc['usage_number'],'Pembatalan pemakaian '.$doc['usage_number'].' — '.$reason,$actor['id'],null,$line['movement_id'],null,'item_usage_cancel:'.$line['id'],(float)$line['unit_cost']);
    }
    $original = $pdo->prepare("SELECT journal_id FROM journal_postings WHERE source_type='item_usage' AND source_id=? AND posting_key='USAGE' FOR UPDATE");
    $original->execute([$doc['id']]);
    $journalId = $original->fetchColumn();
    if (!$journalId) throw new DomainException('Jurnal pemakaian tidak ditemukan', 409);
    $journalLines = $pdo->prepare('SELECT account_id,debit,credit,memo FROM journal_lines WHERE journal_id=? FOR UPDATE');
    $journalLines->execute([$journalId]);
    $reversed = array_map(static fn(array $row): array => [$row['account_id'],(float)$row['credit'],(float)$row['debit'],$row['memo']], $journalLines->fetchAll());
    $reversalId = postOperationalJournal($pdo,date('Y-m-d'),'Pembatalan pemakaian '.$doc['usage_number'],$doc['branch_id'],'item_usage',$doc['id'],'USAGE_REVERSAL',$reversed,$actor['id']);
    $pdo->prepare('UPDATE journal_entries SET reversal_of_id=? WHERE id=?')->execute([$journalId,$reversalId]);
    $pdo->prepare("UPDATE item_usages SET status='Cancelled',cancelled_by=?,cancelled_at=NOW(),cancellation_reason=?,revision=revision+1 WHERE id=?")
        ->execute([$actor['id'],$reason,$doc['id']]);
    itemUsageAudit($pdo,$actor,$doc,'cancel',$reason,['document'=>$doc,'rows'=>$lines]);
}

function mapItemUsage(array $row): array {
    // Dokumen operasional tidak menampilkan nilai persediaan kepada petugas.
    // HPP dan total nilai tetap tersimpan untuk pembukuan dan laporan administrator.
    return [
        'id'=>$row['id'],'usageNumber'=>$row['usage_number'],'date'=>$row['usage_date'],
        'branchId'=>$row['branch_id'],'branchName'=>$row['branch_name'] ?? '',
        'warehouseId'=>$row['warehouse_id'],'warehouseName'=>$row['warehouse_name'] ?? '',
        'purpose'=>$row['purpose'],'responsibleName'=>$row['responsible_name'],
        'expenseAccountId'=>$row['expense_account_id'] ?? '', 'expenseAccountName'=>$row['expense_account_name'] ?? '',
        'status'=>$row['status'],'revision'=>(int)$row['revision'],
        'createdByName'=>$row['created_by_name'] ?? '', 'createdAt'=>$row['created_at'],
        'postedAt'=>$row['posted_at'],'cancelledAt'=>$row['cancelled_at'],'cancellationReason'=>$row['cancellation_reason'],
    ];
}
