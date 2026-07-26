<?php
// BRANCHES CRUD
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
        foreach ($rows as &$r) $r['isActive'] = (bool)$r['is_active'];
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $stmt = $pdo->prepare("INSERT INTO branches (id, code, name, address, phone, is_active) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['code'], $d['name'], $d['address'] ?? '',
            $d['phone'] ?? '', $d['isActive'] ?? 1
        ]);
        respondSuccess(null, 'Cabang ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE branches SET code=?, name=?, address=?, phone=?, is_active=? WHERE id=?");
        $stmt->execute([$d['code'], $d['name'], $d['address'] ?? '', $d['phone'] ?? '', $d['isActive'] ?? 1, $id]);
        respondSuccess(null, 'Cabang diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM branches WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Cabang dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
