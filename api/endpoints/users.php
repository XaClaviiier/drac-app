<?php
$actor = requireAuthenticatedUser($pdo);

function mapUserRow(PDO $pdo, array $row): array {
    unset($row['password']);
    $row['roleName'] = $row['role_name'] ?? '';
    $row['roleId'] = $row['role_id'];
    $row['branchName'] = $row['branch_name'] ?? '';
    $row['branchId'] = $row['branch_id'];
    $row['branchIds'] = getUserBranchIds($pdo, $row['id']);
    $row['isActive'] = (bool)$row['is_active'];
    $row['isOwner'] = (bool)($row['is_owner'] ?? false);
    $row['isProtected'] = (bool)($row['is_protected'] ?? false);
    $row['lastLogin'] = $row['last_login'];
    $row['createdAt'] = $row['created_at'];
    return $row;
}

function saveUserBranches(PDO $pdo, string $userId, array $branchIds): void {
    $branchIds = array_values(array_unique(array_filter(array_map('strval', $branchIds))));
    if (!$branchIds) respondError('Pilih minimal satu cabang', 422);
    $placeholders = implode(',', array_fill(0, count($branchIds), '?'));
    $validStmt = $pdo->prepare("SELECT id FROM branches WHERE is_active=1 AND id IN ($placeholders)");
    $validStmt->execute($branchIds);
    $validIds = array_map('strval', array_column($validStmt->fetchAll(), 'id'));
    if (count($validIds) !== count($branchIds)) respondError('Ada cabang yang tidak valid atau nonaktif', 422);

    $pdo->beginTransaction();
    try {
        $pdo->prepare("DELETE FROM user_branch_access WHERE user_id = ?")->execute([$userId]);
        $insert = $pdo->prepare("INSERT INTO user_branch_access (user_id, branch_id) VALUES (?, ?)");
        foreach ($validIds as $branchId) $insert->execute([$userId, $branchId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

if ($action === 'password' && $method === 'PUT') {
    if (!$id) respondError('ID required');
    $d = getInput();
    $isSelf = $actor['id'] === $id;
    $isOwner = (bool)($actor['is_owner'] ?? false);
    if (!$isSelf && !$isOwner) respondError('Tidak berhak mengubah password user lain', 403);
    $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) respondError('User tidak ditemukan', 404);
    if ($isSelf && !$isOwner) {
        $current = (string)($d['currentPassword'] ?? '');
        $valid = password_verify($current, $target['password']) || hash_equals((string)$target['password'], $current);
        if (!$valid) respondError('Password saat ini salah', 422);
    }
    $newPassword = trim((string)($d['newPassword'] ?? ''));
    if (strlen($newPassword) < 6) respondError('Password minimal 6 karakter', 422);
    $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([password_hash($newPassword, PASSWORD_DEFAULT), $id]);
    respondSuccess(null, 'Password berhasil diubah');
}

switch ($method) {
    case 'GET':
        requireAuthenticatedUserPermission($pdo, $actor, 'user:view');
        $rows = $pdo->query("
            SELECT u.*, r.name role_name, b.name branch_name
            FROM users u LEFT JOIN roles r ON u.role_id=r.id LEFT JOIN branches b ON u.branch_id=b.id
            ORDER BY u.is_owner DESC, u.name
        ")->fetchAll();
        respondSuccess(array_map(fn($r) => mapUserRow($pdo, $r), $rows));
        break;

    case 'POST':
        if (!(bool)($actor['is_owner'] ?? false)) respondError('Hanya Owner dapat menambah pengguna', 403);
        $d = getInput();
        $userId = $d['id'] ?? generateId();
        $branchIds = $d['branchIds'] ?? [$d['branchId']];
        if (!empty($d['branchId']) && !in_array($d['branchId'], $branchIds, true)) $branchIds[] = $d['branchId'];
        if (!$branchIds) respondError('Pilih minimal satu cabang', 422);
        $stmt = $pdo->prepare("INSERT INTO users (id,username,name,email,password,role_id,branch_id,is_active) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->execute([$userId,$d['username'],$d['name'],$d['email']??'',password_hash($d['password'], PASSWORD_DEFAULT),$d['roleId'],$d['branchId']??$branchIds[0],$d['isActive']??1]);
        saveUserBranches($pdo, $userId, $branchIds);
        respondSuccess(null, 'User ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        if (!(bool)($actor['is_owner'] ?? false)) respondError('Hanya Owner dapat mengubah pengguna', 403);
        $d = getInput();
        $stmt = $pdo->prepare("SELECT is_owner,is_protected FROM users WHERE id=?");
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) respondError('User tidak ditemukan', 404);
        $branchIds = $d['branchIds'] ?? [$d['branchId']];
        if (!empty($d['branchId']) && !in_array($d['branchId'], $branchIds, true)) $branchIds[] = $d['branchId'];
        if (!empty($existing['is_owner'])) {
            $branchIds = array_column($pdo->query("SELECT id FROM branches WHERE is_active=1")->fetchAll(), 'id');
            $d['isActive'] = true;
        }
        if (!$branchIds) respondError('Pilih minimal satu cabang', 422);
        $pdo->prepare("UPDATE users SET username=?,name=?,email=?,role_id=?,branch_id=?,is_active=? WHERE id=?")
            ->execute([$d['username'],$d['name'],$d['email']??'',$d['roleId'],$d['branchId']??$branchIds[0],$d['isActive']??1,$id]);
        saveUserBranches($pdo, $id, $branchIds);
        respondSuccess(null, 'User diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        if (!(bool)($actor['is_owner'] ?? false)) respondError('Hanya Owner dapat menghapus pengguna', 403);
        $stmt=$pdo->prepare("SELECT is_protected FROM users WHERE id=?"); $stmt->execute([$id]);
        if ($stmt->fetchColumn()) respondError('Akun Owner tidak dapat dihapus',403);
        $pdo->prepare("DELETE FROM user_branch_access WHERE user_id=?")->execute([$id]);
        $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]);
        respondSuccess(null,'User dihapus');
        break;
    default: respondError('Method not allowed',405);
}
