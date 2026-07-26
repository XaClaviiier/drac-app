<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM roles ORDER BY code")->fetchAll();
        foreach ($rows as &$r) {
            $r['isActive'] = (bool)$r['is_active'];
            $r['permissions'] = $r['permissions'] ? json_decode($r['permissions']) : [];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $stmt = $pdo->prepare("INSERT INTO roles (id, code, name, description, permissions, is_active) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['code'], $d['name'], $d['description'] ?? '',
            json_encode($d['permissions'] ?? []),
            $d['isActive'] ?? 1
        ]);
        respondSuccess(null, 'Role ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE roles SET code=?, name=?, description=?, permissions=?, is_active=? WHERE id=?");
        $stmt->execute([$d['code'], $d['name'], $d['description'] ?? '', json_encode($d['permissions'] ?? []), $d['isActive'] ?? 1, $id]);
        respondSuccess(null, 'Role diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM roles WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Role dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
