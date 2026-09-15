<?php
// Pure normalization/classification shared by preview, execution and runtime tests.
function customerImportPhone(string $raw): string {
    $raw = trim($raw);
    if ($raw === '' || !preg_match('/^\+?[0-9 ()\-.]+$/D', $raw)) return '';
    $digits = preg_replace('/\D/', '', $raw);
    if (str_starts_with($digits, '62')) $digits = '0' . substr($digits, 2);
    // Do not guess missing prefixes, extensions, multiple numbers or mistyped digits.
    if (!preg_match('/^0[2-9][0-9]{7,11}$/D', $digits)) return '';
    if (preg_match('/([0-9])\1{5,}/', $digits) || count(array_unique(str_split(substr($digits, 2)))) < 3) return '';
    return $digits;
}

function customerImportName(string $raw): string {
    // Remove only recognizable phone tokens. Preserve brackets and their business meaning.
    $name = preg_replace_callback('/(?<![\pL\d])(?:\+?62|0)[0-9][0-9 ()\-.]{6,}[0-9](?!\d)/u', static function ($m) {
        return customerImportPhone($m[0]) !== '' ? ' ' : $m[0];
    }, $raw);
    return trim(preg_replace('/\s+/u', ' ', $name));
}

function customerImportNameKey(string $name): string {
    $name = customerImportName($name);
    return function_exists('mb_strtoupper') ? mb_strtoupper($name, 'UTF-8') : strtoupper($name);
}

function customerImportValidateRows($rows): array {
    if (!is_array($rows) || !array_is_list($rows) || count($rows) < 1 || count($rows) > 5000) throw new InvalidArgumentException('Import harus berisi 1–5000 baris.');
    $limits = ['name'=>500, 'phone'=>200, 'businessPhone'=>200, 'category'=>150, 'accurateId'=>150, 'email'=>150, 'address'=>2000, 'contact'=>500, 'description'=>2000];
    $result = []; $numbers = [];
    foreach ($rows as $row) {
        if (!is_array($row) || !isset($row['rowNumber']) || !is_int($row['rowNumber']) || $row['rowNumber'] < 2 || $row['rowNumber'] > 1000000 || isset($numbers[$row['rowNumber']])) throw new InvalidArgumentException('Nomor baris sumber tidak valid/duplikat.');
        $numbers[$row['rowNumber']] = true;
        $clean = ['rowNumber'=>$row['rowNumber']];
        foreach ($limits as $field=>$limit) {
            $value = $row[$field] ?? '';
            if (!is_string($value) || mb_strlen($value, 'UTF-8') > $limit || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) throw new InvalidArgumentException("Field {$field} pada baris {$row['rowNumber']} tidak valid/melebihi batas.");
            $clean[$field] = $value;
        }
        $result[] = $clean;
    }
    return $result;
}

function customerImportClassify(array $rows, array $existing): array {
    $byPhone = [];
    foreach ($existing as $customer) {
        $phone = customerImportPhone((string)$customer['phone']);
        if ($phone !== '') $byPhone[$phone][] = $customer;
    }
    $result = []; $groups = [];
    foreach ($rows as $row) {
        $phone = customerImportPhone($row['phone']);
        $name = customerImportName($row['name']);
        $r = $row + ['cleanName'=>$name, 'normalizedPhone'=>$phone, 'categories'=>trim($row['category']) === '' ? [] : [trim($row['category'])], 'status'=>'new', 'reason'=>'Nomor baru; siap ditambahkan.'];
        $reasons = [];
        if ($name === '' || mb_strlen($name, 'UTF-8') > 100 || !preg_match('/\pL/u', $name)) $reasons[] = 'Nama kosong/tidak valid atau melebihi 100 karakter.';
        if ($phone === '') $reasons[] = 'Telepon kosong, placeholder, format tidak valid, atau berisi beberapa nomor.';
        if (trim($row['email']) !== '' && (!filter_var(trim($row['email']), FILTER_VALIDATE_EMAIL) || mb_strlen(trim($row['email']), 'UTF-8') > 100)) $reasons[] = 'Email tidak valid atau melebihi 100 karakter.';
        if ($reasons) { $r['status'] = 'invalid'; $r['reason'] = implode(' ', $reasons); }
        else {
            preg_match_all('/(?<![\pL\d])(?:\+?62|0)[0-9][0-9 ()\-.]{6,}[0-9](?!\d)/u', $row['name'], $namePhones);
            foreach ($namePhones[0] as $namePhone) {
                if (customerImportPhone($namePhone) !== $phone) { $r['status']='conflict'; $r['reason']='Nomor dalam nama berbeda dari kolom telepon.'; }
            }
            if (trim($row['businessPhone']) !== '' && customerImportPhone($row['businessPhone']) !== $phone) { $r['status']='conflict'; $r['reason']='Telepon bisnis berbeda/tidak valid; tinjau kedua sumber.'; }
        }
        $result[] = $r;
        if ($phone !== '') $groups[$phone][] = count($result)-1;
    }
    foreach ($groups as $phone=>$indices) {
        $names = []; $blocked = false; $categories = [];
        foreach ($indices as $i) {
            $names[] = customerImportNameKey($result[$i]['cleanName']);
            $blocked = $blocked || in_array($result[$i]['status'], ['invalid','conflict'], true);
            $categories = array_merge($categories, $result[$i]['categories']);
        }
        $categories = array_values(array_unique($categories)); sort($categories, SORT_STRING);
        $matches = $byPhone[$phone] ?? [];
        $ambiguous = count(array_unique($names)) > 1 || count($matches) > 1;
        // Different spellings remain review candidates; no fuzzy automatic overwrite or merge.
        if (count($matches) === 1 && customerImportNameKey($matches[0]['name']) !== $names[0]) $ambiguous = true;
        foreach ($indices as $position=>$i) {
            $result[$i]['categories'] = $categories;
            if ($ambiguous || ($blocked && count($indices) > 1)) {
                $result[$i]['status'] = 'conflict';
                $result[$i]['reason'] = 'Nomor yang sama memiliki nama/data sumber ambigu; seluruh kelompok perlu review.';
            } elseif (in_array($result[$i]['status'], ['invalid','conflict'], true)) continue;
            elseif ($matches) {
                $result[$i]['status']='existing'; $result[$i]['customerId']=$matches[0]['id'];
                $result[$i]['reason']='Sudah ada; nama, kategori dan cabang existing tidak diubah.';
            } elseif ($position > 0) {
                $result[$i]['status']='duplicate'; $result[$i]['duplicateOf']=$result[$indices[0]]['rowNumber'];
                $result[$i]['reason']='Duplikat file; sumber dan variasi kategori tetap diaudit.';
            }
        }
    }
    return $result;
}

function customerImportSummary(array $rows): array {
    $counts = array_fill_keys(['new','existing','duplicate','conflict','invalid','created'], 0);
    foreach ($rows as $row) $counts[$row['status']]++;
    return $counts;
}

function customerImportDigest(array $rows, string $branchId, string $source): string {
    return hash('sha256', json_encode([$branchId,$source,$rows], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
}

function ensureCustomerImportSchema(PDO $pdo): void {
    $columns = array_column($pdo->query('SHOW COLUMNS FROM customers')->fetchAll(), 'Field');
    if (!in_array('categories', $columns, true)) $pdo->exec('ALTER TABLE customers ADD categories LONGTEXT NULL');
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_import_runs (
        run_id VARCHAR(64) PRIMARY KEY, payload_hash CHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
        branch_id VARCHAR(64) NOT NULL, source_name VARCHAR(255) NOT NULL, result_json LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function customerImportReadBack(PDO $pdo, array $result, string $branchId): void {
    $get = $pdo->prepare('SELECT * FROM customers WHERE id=?');
    foreach ($result as $row) {
        if ($row['status'] !== 'created') continue;
        $get->execute([$row['customerId']]); $stored = $get->fetch();
        if (!$stored || $stored['name'] !== $row['cleanName'] || $stored['phone'] !== $row['normalizedPhone'] || (string)$stored['first_seen_branch_id'] !== $branchId
            || json_decode($stored['categories'] ?? '[]', true) !== $row['categories'] || $stored['email'] !== trim($row['email']) || $stored['address'] !== trim($row['address'])) {
            throw new RuntimeException('Verifikasi baca ulang gagal. Unduh laporan dan periksa hasil sebelum melanjutkan.');
        }
    }
}

// One atomic transaction including row reports and idempotency checkpoint.
function customerImportExecute(PDO $pdo, array $rows, string $branchId, string $source, string $runId, string $digest, array $user): array {
    $payloadHash = customerImportDigest($rows, $branchId, $source);
    if ((int)$pdo->query("SELECT GET_LOCK('customer_code_sequence', 10)")->fetchColumn() !== 1) throw new RuntimeException('Import lain sedang berjalan. Coba ulang dengan ID yang sama.');
    try {
        $pdo->beginTransaction();
        $lookup = $pdo->prepare('SELECT * FROM customer_import_runs WHERE run_id=?'); $lookup->execute([$runId]); $previous = $lookup->fetch();
        if ($previous) {
            if ($previous['payload_hash'] !== $payloadHash || $previous['user_id'] !== (string)$user['id']) throw new InvalidArgumentException('ID import sudah dipakai untuk payload/pengguna berbeda.');
            $result = json_decode($previous['result_json'], true, 512, JSON_THROW_ON_ERROR);
        } else {
            $result = customerImportClassify($rows, $pdo->query('SELECT id,name,phone FROM customers')->fetchAll());
            if (!hash_equals(customerImportDigest($result, $branchId, $source), $digest)) throw new InvalidArgumentException('Data berubah sejak preview. Jalankan preview ulang.');
            $max = (int)$pdo->query("SELECT MAX(CAST(SUBSTRING(customer_code, 5) AS UNSIGNED)) FROM customers WHERE customer_code REGEXP '^PLG-[0-9]+$'")->fetchColumn();
            $insert = $pdo->prepare("INSERT INTO customers (id,customer_code,name,phone,email,address,branch_id,first_seen_branch_id,categories) VALUES (?,?,?,?,?,?,?,?,?)");
            foreach ($result as &$row) {
                if ($row['status'] !== 'new') continue;
                $customerId = generateId(); $personId = 'CP-' . strtoupper(substr(hash('sha256', $customerId), 0, 24));
                $insert->execute([$customerId,'PLG-'.str_pad((string)++$max,3,'0',STR_PAD_LEFT),$row['cleanName'],$row['normalizedPhone'],trim($row['email']),trim($row['address']),$branchId,$branchId,json_encode($row['categories'],JSON_UNESCAPED_UNICODE)]);
                $pdo->prepare("INSERT INTO customer_people(id,customer_id,name,phone,email,relationship_label,is_active) VALUES(?,?,?,?,?,'Pemilik akun',1)")->execute([$personId,$customerId,$row['cleanName'],$row['normalizedPhone'],trim($row['email'])]);
                foreach (['Owner','PIC','Keuangan'] as $role) $pdo->prepare('INSERT INTO customer_person_roles(person_id,role_code) VALUES(?,?)')->execute([$personId,$role]);
                $pdo->prepare('UPDATE customers SET primary_contact_id=?,billing_contact_id=? WHERE id=?')->execute([$personId,$personId,$customerId]);
                $row['status']='created'; $row['customerId']=$customerId; $row['reason']='Dibuat dan diverifikasi baca ulang.';
            }
            unset($row);
            $createdByRow = [];
            foreach ($result as $row) if ($row['status'] === 'created') $createdByRow[$row['rowNumber']] = $row['customerId'];
            foreach ($result as &$row) if ($row['status'] === 'duplicate') $row['customerId'] = $createdByRow[$row['duplicateOf']] ?? null;
            unset($row);
            $json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $pdo->prepare('INSERT INTO customer_import_runs(run_id,payload_hash,user_id,branch_id,source_name,result_json) VALUES(?,?,?,?,?,?)')->execute([$runId,$payloadHash,$user['id'],$branchId,$source,$json]);
            $pdo->prepare("INSERT INTO customer_master_audit_logs(entity_type,entity_id,action_type,after_json,user_id,user_name) VALUES('customer_import',?,'import',?,?,?)")
                ->execute([$runId,json_encode(['source'=>$source,'branchId'=>$branchId,'counts'=>customerImportSummary($result)],JSON_UNESCAPED_UNICODE),$user['id'],$user['name']??'']);
        }
        customerImportReadBack($pdo, $result, $branchId);
        $pdo->commit();
        // Verify committed state as well; a lost response can safely replay this run ID.
        customerImportReadBack($pdo, $result, $branchId);
        return ['rows'=>$result,'counts'=>customerImportSummary($result),'digest'=>$digest,'verified'=>true];
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    finally { $pdo->query("SELECT RELEASE_LOCK('customer_code_sequence')"); }
}
