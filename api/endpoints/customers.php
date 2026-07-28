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
        $code = $d['customerCode'] ?? '';
        if (!$code) {
            $maxRow = $pdo->query("SELECT customer_code FROM customers ORDER BY id DESC LIMIT 1")->fetch();
            $num = 1;
            if ($maxRow && preg_match('/PLG-(\d+)/', $maxRow['customer_code'], $m)) {
                $num = intval($m[1]) + 1;
            }
            $code = 'PLG-' . str_pad($num, 3, '0', STR_PAD_LEFT);
        }
        $branchId          = $d['branchId'] ?? 'BR-001';
        $firstSeenBranchId = $d['firstSeenBranchId'] ?? $branchId;

        $stmt = $pdo->prepare("INSERT INTO customers (id, customer_code, name, phone, email, address, branch_id, first_seen_branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $code, $d['name'], $d['phone'] ?? '',
            $d['email'] ?? '', $d['address'] ?? '',
            $branchId, $firstSeenBranchId
        ]);
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
