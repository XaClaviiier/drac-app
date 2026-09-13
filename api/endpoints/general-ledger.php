<?php
/** Buku Besar: laporan transaksi per akun dari jurnal yang sudah diposting. */
function ensureGeneralLedgerTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        entry_date DATE NOT NULL,
        entry_number VARCHAR(60) NOT NULL UNIQUE,
        description VARCHAR(500) NOT NULL,
        branch_id VARCHAR(64) NULL,
        source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
        source_id VARCHAR(64) NULL,
        posted TINYINT(1) NOT NULL DEFAULT 1,
        status ENUM('Draft','Posted','Reversed','Voided') NOT NULL DEFAULT 'Posted',
        created_by VARCHAR(64) NULL,
        posted_by VARCHAR(64) NULL,
        posted_at DATETIME NULL,
        reversal_of_id VARCHAR(64) NULL,
        void_reason VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_journal_entries_date (entry_date),
        INDEX idx_journal_entries_branch_date (branch_id, entry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $columns = array_column($pdo->query('SHOW COLUMNS FROM journal_entries')->fetchAll(), 'Field');
    if (!in_array('status', $columns, true)) $pdo->exec("ALTER TABLE journal_entries ADD status ENUM('Draft','Posted','Reversed','Voided') NOT NULL DEFAULT 'Posted' AFTER posted");
    if (!in_array('posted_by', $columns, true)) $pdo->exec("ALTER TABLE journal_entries ADD posted_by VARCHAR(64) NULL AFTER created_by");
    if (!in_array('posted_at', $columns, true)) $pdo->exec("ALTER TABLE journal_entries ADD posted_at DATETIME NULL AFTER posted_by");
    if (!in_array('reversal_of_id', $columns, true)) $pdo->exec("ALTER TABLE journal_entries ADD reversal_of_id VARCHAR(64) NULL AFTER posted_at");
    if (!in_array('void_reason', $columns, true)) $pdo->exec("ALTER TABLE journal_entries ADD void_reason VARCHAR(500) NULL AFTER reversal_of_id");
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_lines (
        id VARCHAR(64) PRIMARY KEY,
        journal_id VARCHAR(64) NOT NULL,
        account_id VARCHAR(64) NOT NULL,
        debit DECIMAL(18,2) NOT NULL DEFAULT 0,
        credit DECIMAL(18,2) NOT NULL DEFAULT 0,
        memo VARCHAR(500) NULL,
        INDEX idx_journal_lines_account (account_id),
        INDEX idx_journal_lines_journal (journal_id),
        CONSTRAINT fk_journal_lines_entry FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_postings (
        id VARCHAR(64) PRIMARY KEY, journal_id VARCHAR(64) NOT NULL, source_type VARCHAR(40) NOT NULL,
        source_id VARCHAR(64) NULL, posting_key VARCHAR(60) NOT NULL, status ENUM('Posted','Reversed','Voided') NOT NULL DEFAULT 'Posted',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_journal_posting_source (source_type, source_id, posting_key),
        INDEX idx_journal_postings_journal (journal_id), CONSTRAINT fk_journal_postings_entry FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, journal_id VARCHAR(64) NOT NULL, action VARCHAR(30) NOT NULL,
        reason VARCHAR(500) NULL, snapshot_json LONGTEXT NULL, user_id VARCHAR(64) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_journal_audit_journal (journal_id), CONSTRAINT fk_journal_audit_entry FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

ensureGeneralLedgerTables($pdo);
if ($method === 'POST') {
    $d = getInput(); $date = trim((string)($d['date'] ?? '')); $description = trim((string)($d['description'] ?? ''));
    $branchId = trim((string)($d['branchId'] ?? '')); $lines = $d['lines'] ?? [];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || $description === '' || !is_array($lines) || count($lines) < 2) respondError('Tanggal, keterangan, dan minimal dua baris jurnal wajib diisi', 422);
    if ($branchId !== '') requireAccessibleBranch($pdo, $requestUser, $branchId);
    $debit = 0.0; $credit = 0.0; $clean = [];
    foreach ($lines as $line) {
        $accountId = trim((string)($line['accountId'] ?? '')); $dr = round((float)($line['debit'] ?? 0), 2); $cr = round((float)($line['credit'] ?? 0), 2);
        if ($accountId === '' || ($dr > 0 && $cr > 0) || ($dr <= 0 && $cr <= 0)) respondError('Setiap baris harus memiliki satu akun dan debit atau kredit', 422);
        $clean[] = [$accountId, $dr, $cr, trim((string)($line['memo'] ?? ''))]; $debit += $dr; $credit += $cr;
    }
    if (round($debit, 2) !== round($credit, 2) || $debit <= 0) respondError('Total debit dan kredit harus sama dan lebih dari nol', 422);
    $ids = array_values(array_unique(array_column(array_map(fn($x) => ['id'=>$x[0]], $clean), 'id')));
    $marks = implode(',', array_fill(0, count($ids), '?')); $check = $pdo->prepare("SELECT COUNT(*) FROM chart_of_accounts WHERE is_active=1 AND id IN ($marks)"); $check->execute($ids);
    if ((int)$check->fetchColumn() !== count($ids)) respondError('Ada akun yang tidak ditemukan atau nonaktif', 422);
    $pdo->beginTransaction();
    try {
        $prefix = 'JRN-' . str_replace('-', '', substr($date, 0, 7)) . '-'; $next = $pdo->prepare('SELECT COUNT(*) FROM journal_entries WHERE entry_number LIKE ?'); $next->execute([$prefix . '%']);
        $number = $prefix . str_pad((string)((int)$next->fetchColumn() + 1), 4, '0', STR_PAD_LEFT); $journalId = generateId();
        $userId = $requestUser['id'] ?? null;
        $pdo->prepare("INSERT INTO journal_entries(id,entry_date,entry_number,description,branch_id,source_type,posted,status,created_by,posted_by,posted_at) VALUES(?,?,?,?,?,?,1,'Posted',?,?,NOW())")->execute([$journalId,$date,$number,$description,$branchId?:null,'manual',$userId,$userId]);
        $insert = $pdo->prepare('INSERT INTO journal_lines(id,journal_id,account_id,debit,credit,memo) VALUES(?,?,?,?,?,?)'); foreach ($clean as [$accountId,$dr,$cr,$memo]) $insert->execute([generateId(),$journalId,$accountId,$dr,$cr,$memo?:null]);
        $pdo->prepare("INSERT INTO journal_postings(id,journal_id,source_type,source_id,posting_key,status) VALUES(?,?,?,?,?,'Posted')")->execute([generateId(),$journalId,'manual',null,'MANUAL']);
        $pdo->prepare('INSERT INTO journal_audit_logs(journal_id,action,snapshot_json,user_id) VALUES(?,?,?,?)')->execute([$journalId,'created',json_encode(['number'=>$number,'date'=>$date,'description'=>$description,'lines'=>$clean],JSON_UNESCAPED_UNICODE),$userId]);
        $pdo->commit(); respondSuccess(['id'=>$journalId,'number'=>$number], 'Jurnal berhasil disimpan');
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
if ($method !== 'GET') respondError('Method not allowed', 405);
$accountId = trim((string)($_GET['accountId'] ?? ''));
$from = trim((string)($_GET['from'] ?? date('Y-m-01')));
$to = trim((string)($_GET['to'] ?? date('Y-m-d')));
$branchId = trim((string)($_GET['branchId'] ?? ''));
if ($accountId === '') respondError('Akun wajib dipilih', 422);
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $to) || $from > $to) respondError('Rentang tanggal tidak valid', 422);
if ($branchId !== '') requireAccessibleBranch($pdo, $requestUser, $branchId);

$beforeSql = 'SELECT COALESCE(SUM(l.debit-l.credit),0) FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_id WHERE l.account_id=? AND j.posted=1 AND j.entry_date < ?';
$params = [$accountId, $from];
if ($branchId !== '') { $beforeSql .= ' AND j.branch_id=?'; $params[] = $branchId; }
$stmt = $pdo->prepare($beforeSql); $stmt->execute($params);
$opening = (float)$stmt->fetchColumn();

$sql = 'SELECT j.id journalId,j.entry_date entryDate,j.entry_number entryNumber,j.description,l.debit,l.credit,l.memo,j.branch_id branchId,b.name branchName FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_id LEFT JOIN branches b ON b.id=j.branch_id WHERE l.account_id=? AND j.posted=1 AND j.entry_date BETWEEN ? AND ?';
$params = [$accountId, $from, $to];
if ($branchId !== '') { $sql .= ' AND j.branch_id=?'; $params[] = $branchId; }
$sql .= ' ORDER BY j.entry_date,j.entry_number,l.id';
$stmt = $pdo->prepare($sql); $stmt->execute($params);
$balance = $opening; $rows = [];
foreach ($stmt->fetchAll() as $row) {
    $debit = (float)$row['debit']; $credit = (float)$row['credit']; $balance += $debit - $credit;
    $rows[] = ['journalId'=>$row['journalId'],'date'=>$row['entryDate'],'number'=>$row['entryNumber'],'description'=>$row['description'],'memo'=>$row['memo'],'branchId'=>$row['branchId'],'branchName'=>$row['branchName'],'debit'=>$debit,'credit'=>$credit,'balance'=>$balance];
}
respondSuccess(['accountId'=>$accountId,'from'=>$from,'to'=>$to,'openingBalance'=>$opening,'rows'=>$rows,'closingBalance'=>$balance]);
