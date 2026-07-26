<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM suppliers ORDER BY code")->fetchAll();
        foreach ($rows as &$r) {
            $r['contactPerson'] = $r['contact_person'];
            $r['isActive'] = (bool)$r['is_active'];
            $r['createdAt'] = $r['created_at'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        // Auto-generate code jika kosong
        $code = $d['code'] ?? '';
        if (!$code) {
            $maxRow = $pdo->query("SELECT code FROM suppliers ORDER BY id DESC LIMIT 1")->fetch();
            $num = 1;
            if ($maxRow && preg_match('/SUP-(\d+)/', $maxRow['code'], $m)) {
                $num = intval($m[1]) + 1;
            }
            $code = 'SUP-' . str_pad($num, 3, '0', STR_PAD_LEFT);
        }
        $stmt = $pdo->prepare("INSERT INTO suppliers (id, code, name, contact_person, phone, email, address, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $code, $d['name'], $d['contactPerson'] ?? '',
            $d['phone'] ?? '', $d['email'] ?? '', $d['address'] ?? '',
            $d['isActive'] ?? 1
        ]);
        respondSuccess(['code' => $code], 'Supplier ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, is_active=? WHERE id=?");
        $stmt->execute([$d['name'], $d['contactPerson'] ?? '', $d['phone'] ?? '', $d['email'] ?? '', $d['address'] ?? '', $d['isActive'] ?? 1, $id]);
        respondSuccess(null, 'Supplier diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM suppliers WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Supplier dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
