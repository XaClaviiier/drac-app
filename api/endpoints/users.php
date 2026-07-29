<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("
            SELECT u.*, r.name as role_name, b.name as branch_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN branches b ON u.branch_id = b.id
            ORDER BY u.username
        ")->fetchAll();
        foreach ($rows as &$r) {
            unset($r['password']);
            $r['roleName'] = $r['role_name'];
            $r['roleId'] = $r['role_id'];
            $r['branchName'] = $r['branch_name'];
            $r['branchId'] = $r['branch_id'];
            $r['isActive'] = (bool)$r['is_active'];
            $r['isOwner'] = (bool)($r['is_owner'] ?? false);
            $r['isProtected'] = (bool)($r['is_protected'] ?? false);
            $r['lastLogin'] = $r['last_login'];
            $r['createdAt'] = $r['created_at'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $stmt = $pdo->prepare("INSERT INTO users (id, username, name, email, password, role_id, branch_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['username'], $d['name'], $d['email'] ?? '',
            $d['password'], $d['roleId'], $d['branchId'],
            $d['isActive'] ?? 1
        ]);
        respondSuccess(null, 'User ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $protected = $pdo->prepare("SELECT is_protected FROM users WHERE id = ?");
        $protected->execute([$id]);
        $existing = $protected->fetch();
        if ($existing && !empty($existing['is_protected']) && (($d['isActive'] ?? true) == false || ($d['roleId'] ?? '1') !== '1')) {
            respondError('Akun Owner tidak dapat dinonaktifkan atau diganti rolenya', 403);
        }
        if (!empty($d['password'])) {
            $stmt = $pdo->prepare("UPDATE users SET username=?, name=?, email=?, password=?, role_id=?, branch_id=?, is_active=? WHERE id=?");
            $stmt->execute([$d['username'], $d['name'], $d['email'] ?? '', $d['password'], $d['roleId'], $d['branchId'], $d['isActive'] ?? 1, $id]);
        } else {
            $stmt = $pdo->prepare("UPDATE users SET username=?, name=?, email=?, role_id=?, branch_id=?, is_active=? WHERE id=?");
            $stmt->execute([$d['username'], $d['name'], $d['email'] ?? '', $d['roleId'], $d['branchId'], $d['isActive'] ?? 1, $id]);
        }
        respondSuccess(null, 'User diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $protected = $pdo->prepare("SELECT is_protected FROM users WHERE id = ?");
        $protected->execute([$id]);
        $existing = $protected->fetch();
        if ($existing && !empty($existing['is_protected'])) respondError('Akun Owner tidak dapat dihapus', 403);
        $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]);
        respondSuccess(null, 'User dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
