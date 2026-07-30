<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
        foreach ($rows as &$r) {
            $r['customerCode']       = $r['customer_code'];
            $r['branchId']           = $r['branch_id'];
            $r['firstSeenBranchId']  = $r['first_seen_branch_id'] ?? $r['branch_id'];
            $r['createdAt']          = $r['created_at'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $name = trim((string)($d['name'] ?? ''));
        $phone = trim((string)($d['phone'] ?? ''));
        if ($name === '' || $phone === '') respondError('Nama dan nomor HP wajib diisi.', 422);
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
        $branchId          = $d['branchId'] ?? 'BR-001';
        $firstSeenBranchId = $d['firstSeenBranchId'] ?? $branchId;

        $stmt = $pdo->prepare("INSERT INTO customers (id, customer_code, name, phone, email, address, branch_id, first_seen_branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $code, strtoupper($name), $phone,
            $d['email'] ?? '', $d['address'] ?? '',
            $branchId, $firstSeenBranchId
        ]);
        $pdo->query("SELECT RELEASE_LOCK('customer_code_sequence')");
        respondSuccess(['customerCode' => $code], 'Pelanggan ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE customers SET name=?, phone=?, email=?, address=?, branch_id=? WHERE id=?");
        $stmt->execute([$d['name'], $d['phone'] ?? '', $d['email'] ?? '', $d['address'] ?? '', $d['branchId'] ?? 'BR-001', $id]);
        respondSuccess(null, 'Pelanggan diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM customers WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Pelanggan dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
