<?php
// Currency is DECIMAL(15,2) at the database boundary; arithmetic is integer cents.
function journalMoney($value): int {
    if (!is_string($value) && !is_int($value) && !is_float($value)) throw new DomainException('Nominal wajib angka desimal.');
    $text=(string)$value;
    if (!preg_match('/^\d{1,13}(?:\.\d{1,2})?$/D', $text)) throw new DomainException('Nominal maksimal 13 digit dan 2 desimal; tanpa pembulatan.');
    $parts = explode('.', $text);
    return (int)$parts[0] * 100 + (int)str_pad($parts[1] ?? '', 2, '0');
}

function journalDecimal(int $cents): string {
    return intdiv($cents, 100) . '.' . str_pad((string)($cents % 100), 2, '0', STR_PAD_LEFT);
}

function assertNoPostedAccounting(PDO $pdo): void {
    if ($pdo->query('SELECT 1 FROM journal_entries LIMIT 1')->fetchColumn()) {
        throw new DomainException('Pembersihan data diblokir karena jurnal sudah ada. Gunakan prosedur koreksi akuntansi, bukan hapus massal.', 409);
    }
}

function postJournal(PDO $pdo, string $branch, string $date, string $description, array $lines, string $actor, string $sourceType='manual', ?string $sourceId=null): string {
    if (!$pdo->inTransaction()) throw new DomainException('Jurnal wajib dalam transaksi sumber.');

    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date || $date > date('Y-m-d')) {
        throw new DomainException('Tanggal jurnal tidak valid.');
    }

    if (!$branch || !trim($description) || strlen($description) > 255 || count($lines) < 2 || count($lines) > 100) {
        throw new DomainException('Lengkapi cabang, keterangan dan 2–100 baris jurnal.');
    }

    if ($sourceType !== 'manual' || $sourceId !== null) {
        throw new DomainException('Sumber jurnal manual tidak valid.');
    }

    $debit = 0;
    $credit = 0;
    $validated = [];

    foreach ($lines as $line) {
        $d = journalMoney($line['debit'] ?? '0');
        $c = journalMoney($line['credit'] ?? '0');
        if (($d > 0) === ($c > 0)) {
            throw new DomainException('Isi tepat satu sisi debit atau kredit per baris.');
        }

        $accountStmt = $pdo->prepare('SELECT * FROM chart_of_accounts WHERE id=?');
        $accountStmt->execute([$line['accountId'] ?? '']);
        $account = $accountStmt->fetch(PDO::FETCH_ASSOC);

        $childStmt = $pdo->prepare('SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id=?');
        $childStmt->execute([$line['accountId'] ?? '']);
        if (!$account || !$account['is_active'] || $childStmt->fetchColumn() > 0) {
            throw new DomainException('Pilih akun perkiraan aktif tanpa sub-akun.');
        }

        $debit += $d;
        $credit += $c;
        $validated[] = [$account, journalDecimal($d), journalDecimal($c)];
    }

    if ($debit !== $credit || $debit === 0 || $debit > 999999999999999) {
        throw new DomainException('Debit dan kredit wajib seimbang dan lebih dari nol.');
    }

    $id = bin2hex(random_bytes(16));
    $pdo->prepare('INSERT INTO journal_entries(id,branch_id,date,description,source_type,source_id,created_by) VALUES(?,?,?,?,?,?,?)')->execute([$id, $branch, $date, $description, $sourceType, $sourceId, $actor]);

    $lineStmt = $pdo->prepare('INSERT INTO journal_lines(journal_id,line_number,account_id,account_code,account_name,debit,credit) VALUES(?,?,?,?,?,?,?)');
    foreach ($validated as $i => [$account, $debitValue, $creditValue]) {
        $lineStmt->execute([$id, $i + 1, $account['id'], $account['code'], $account['name'], $debitValue, $creditValue]);
    }

    return $id;
}

function journalRow(PDO $pdo, string $table, string $id): array {
    if (!$pdo->inTransaction()) throw new DomainException('Posting wajib dalam transaksi.');

    $key = $table === 'branch_account_settings' ? 'branch_id' : 'id';
    $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    $query = $pdo->prepare("SELECT * FROM {$table} WHERE {$key}=?{$lock}");
    $query->execute([$id]);
    $row = $query->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        throw new DomainException('Data/mapping akuntansi belum tersedia. Atur akun cabang dan kas/bank terlebih dahulu.');
    }

    return $row;
}

function journalMappedAccount(PDO $pdo, string $id, string $type): string {
    $account = journalRow($pdo, 'chart_of_accounts', $id);
    if ($account['account_type'] !== $type || !$account['is_active']) {
        throw new DomainException('Tipe mapping akun cabang/kas-bank tidak sesuai atau nonaktif.');
    }

    return $id;
}
