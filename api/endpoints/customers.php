<?php
$sanitizeCustomerName = static function ($value): string {
    $name = trim((string)$value);
    $name = preg_replace('/^(?:(?:reg)(?:\s+wo)?|wo)\b\s*[,;:\-]?\s*/iu', '', $name);
    $name = preg_replace('/^[,;:\-\s]+|[,;:\-\s]+$/u', '', (string)$name);
    $name = preg_replace('/\s+/u', ' ', (string)$name);
    $name = trim((string)$name);
    return function_exists('mb_strtoupper') ? mb_strtoupper($name, 'UTF-8') : strtoupper($name);
};
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
        foreach ($rows as &$r) {
            $r['customerCode']       = $r['customer_code'];
            $r['companyName']        = $r['company_name'] ?? '';
            $r['accountType']        = $r['account_type'] ?? 'Pribadi';
            $r['primaryContactId']   = $r['primary_contact_id'] ?? null;
            $r['billingContactId']   = $r['billing_contact_id'] ?? null;
            $r['branchId']           = $r['branch_id'];
            $r['firstSeenBranchId']  = $r['first_seen_branch_id'] ?? $r['branch_id'];
            $r['createdAt']          = $r['created_at'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $companyName = trim((string)($d['companyName'] ?? ''));
        $name = $sanitizeCustomerName($d['name'] ?? '');
        if ($name === '' && $companyName !== '') $name = function_exists('mb_strtoupper') ? mb_strtoupper($companyName, 'UTF-8') : strtoupper($companyName);
        $phone = trim((string)($d['phone'] ?? ''));
        if ($name === '' || ($companyName === '' && $phone === '')) respondError('Nama customer dan nomor HP wajib diisi. Untuk perusahaan, Nama Perusahaan wajib diisi.', 422);
        $normalizedPhone = preg_replace('/\D/', '', $phone);
        foreach ($pdo->query("SELECT customer_code, name, phone FROM customers")->fetchAll() as $existing) {
            if ($normalizedPhone !== '' && preg_replace('/\D/', '', (string)$existing['phone']) === $normalizedPhone) {
                respondError('Nomor HP sudah terdaftar atas nama ' . $existing['name'] . ' (' . $existing['customer_code'] . ').', 409);
            }
        }
        $pdo->query("SELECT GET_LOCK('customer_code_sequence', 10)");
        $maxRow = $pdo->query("
            SELECT MAX(CAST(SUBSTRING(customer_code, 5) AS UNSIGNED))
            FROM customers WHERE customer_code REGEXP '^PLG-[0-9]+$'
        ")->fetchColumn();
        $code = 'PLG-' . str_pad((string)(((int)$maxRow) + 1), 3, '0', STR_PAD_LEFT);
        $branchId = (string)($d['branchId'] ?? '');
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $branchId);
        $firstSeenBranchId = (string)($d['firstSeenBranchId'] ?? $branchId);
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $firstSeenBranchId);

        $customerId = $d['id'] ?? generateId();
        $accountType = $companyName !== '' ? 'Perusahaan' : 'Pribadi';
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("INSERT INTO customers (id, customer_code, name, company_name, account_type, phone, email, address, branch_id, first_seen_branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$customerId,$code,$name,$companyName,$accountType,$phone,$d['email'] ?? '',$d['address'] ?? '',$branchId,$firstSeenBranchId]);
            $personId = 'CP-' . strtoupper(substr(hash('sha256', (string)$customerId), 0, 24));
            $pdo->prepare("INSERT INTO customer_people(id,customer_id,name,phone,email,relationship_label,is_active) VALUES(?,?,?,?,?,'Pemilik akun',1)")->execute([$personId,$customerId,$name,$phone,$d['email'] ?? '']);
            foreach (['Owner','PIC','Keuangan'] as $roleCode) $pdo->prepare("INSERT INTO customer_person_roles(person_id,role_code) VALUES(?,?)")->execute([$personId,$roleCode]);
            $pdo->prepare("UPDATE customers SET primary_contact_id=?,billing_contact_id=? WHERE id=?")->execute([$personId,$personId,$customerId]);
            $pdo->prepare("INSERT INTO customer_master_audit_logs(entity_type,entity_id,action_type,after_json,user_id,user_name) VALUES('customer',?,'create',?,?,?)")->execute([$customerId,json_encode(['name'=>$name,'companyName'=>$companyName,'accountType'=>$accountType,'phone'=>$phone,'email'=>$d['email']??'','address'=>$d['address']??''],JSON_UNESCAPED_UNICODE),$requestUser['id']??null,$requestUser['name']??null]);
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
        $pdo->query("SELECT RELEASE_LOCK('customer_code_sequence')");
        respondSuccess(['customerCode' => $code], 'Pelanggan ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $currentStmt = $pdo->prepare("SELECT * FROM customers WHERE id=?");
        $currentStmt->execute([$id]);
        $current = $currentStmt->fetch();
        if (!$current) respondError('Pelanggan tidak ditemukan', 404);
        // Master pelanggan bersifat global. Cabang asal tetap dipertahankan,
        // tetapi teknisi cabang lain yang berhak edit boleh melengkapi datanya.
        $branchId = (string)$current['branch_id'];
        $name = $sanitizeCustomerName($d['name'] ?? '');
        if ($name === '') respondError('Nama pelanggan wajib diisi.', 422);
        $companyName = trim((string)($d['companyName'] ?? ($current['company_name'] ?? '')));
        $accountType = $companyName !== '' ? 'Perusahaan' : 'Pribadi';
        $after = ['name'=>$name,'companyName'=>$companyName,'accountType'=>$accountType,'phone'=>$d['phone']??'','email'=>$d['email']??'','address'=>$d['address']??'','branchId'=>$branchId];
        $stmt = $pdo->prepare("UPDATE customers SET name=?,company_name=?,account_type=?,phone=?,email=?,address=?,branch_id=? WHERE id=?");
        $stmt->execute([$name,$companyName,$accountType,$d['phone'] ?? '',$d['email'] ?? '',$d['address'] ?? '',$branchId,$id]);
        $pdo->prepare("UPDATE customer_people SET name=?,phone=?,email=? WHERE id=? AND relationship_label='Pemilik akun'")
            ->execute([$name,$d['phone'] ?? '',$d['email'] ?? '',$current['primary_contact_id'] ?? '']);
        $pdo->prepare("INSERT INTO customer_master_audit_logs(entity_type,entity_id,action_type,before_json,after_json,user_id,user_name) VALUES('customer',?,'update',?,?,?,?)")->execute([$id,json_encode($current,JSON_UNESCAPED_UNICODE),json_encode($after,JSON_UNESCAPED_UNICODE),$requestUser['id']??null,$requestUser['name']??null]);
        respondSuccess(null, 'Pelanggan diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        foreach ([['vehicles','customer_id'],['work_orders','customer_ref_id'],['sales_invoices','customer_ref_id']] as [$table,$column]) {
            $check=$pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$column}=?");$check->execute([$id]);
            if((int)$check->fetchColumn()>0) respondError('Pelanggan sudah memiliki kendaraan atau transaksi. Nonaktifkan/arsipkan data, jangan hapus histori.',409);
        }
        $personIds=$pdo->prepare("SELECT id FROM customer_people WHERE customer_id=?");$personIds->execute([$id]);$personIds=$personIds->fetchAll(PDO::FETCH_COLUMN);
        foreach($personIds as $personId){$pdo->prepare("DELETE FROM vehicle_people WHERE person_id=?")->execute([$personId]);$pdo->prepare("DELETE FROM customer_person_roles WHERE person_id=?")->execute([$personId]);}
        $pdo->prepare("DELETE FROM customer_people WHERE customer_id=?")->execute([$id]);
        $pdo->prepare("DELETE FROM customers WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Pelanggan dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
