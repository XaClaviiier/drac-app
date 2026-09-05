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

function normalizeUserBranchIds(mixed $branchIds, mixed $primaryBranchId): array {
    if(!is_array($branchIds))throw new InvalidArgumentException('Daftar cabang tidak valid');
    if($primaryBranchId!==null)$branchIds[]=$primaryBranchId;
    $normalized=[];
    foreach($branchIds as $branchId){
        if(!is_string($branchId)||$branchId!==trim($branchId)||!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/',$branchId))throw new InvalidArgumentException('ID cabang tidak valid');
        $normalized[$branchId]=true;
    }
    $ids=array_keys($normalized);sort($ids,SORT_STRING);
    if(!$ids)throw new InvalidArgumentException('Pilih minimal satu cabang');
    return $ids;
}

function lockValidUserBranchesForWrite(PDO $pdo, array $branchIds): array {
    $placeholders=implode(',',array_fill(0,count($branchIds),'?'));
    $stmt=$pdo->prepare("SELECT id,is_active FROM branches WHERE id IN ($placeholders) ORDER BY id FOR UPDATE");
    $stmt->execute($branchIds);$valid=[];
    foreach($stmt->fetchAll() as $branch)if(!empty($branch['is_active']))$valid[]=(string)$branch['id'];
    if($valid!==$branchIds)throw new InvalidArgumentException('Ada cabang yang tidak valid atau nonaktif');
    return $valid;
}

function lockAllActiveUserBranchesForWrite(PDO $pdo): array {
    $rows=$pdo->query("SELECT id,is_active FROM branches ORDER BY id FOR UPDATE")->fetchAll();
    $ids=[];foreach($rows as $row)if(!empty($row['is_active']))$ids[]=(string)$row['id'];
    if(!$ids)throw new InvalidArgumentException('Pilih minimal satu cabang');
    return $ids;
}

function lockUserAuthorizationWriteTarget(PDO $pdo, ?string $userId, string $requestedRoleId): ?array {
    $target=null;
    if($userId!==null){$stmt=$pdo->prepare("SELECT * FROM users WHERE id=? FOR UPDATE");$stmt->execute([$userId]);$target=$stmt->fetch()?:null;if(!$target)throw new InvalidArgumentException('User tidak ditemukan');}
    if($requestedRoleId===''&&$target)$requestedRoleId=(string)($target['role_id']??'');
    $roleIds=array_values(array_unique(array_filter([$requestedRoleId,(string)($target['role_id']??'')])));sort($roleIds,SORT_STRING);
    if(!$roleIds)throw new InvalidArgumentException('Peran wajib dipilih');
    $placeholders=implode(',',array_fill(0,count($roleIds),'?'));
    $roles=$pdo->prepare("SELECT id,is_active FROM roles WHERE id IN ($placeholders) ORDER BY id FOR UPDATE");$roles->execute($roleIds);$roleMap=[];foreach($roles->fetchAll() as $role)$roleMap[(string)$role['id']]=$role;
    if(empty($roleMap[$requestedRoleId]['is_active']))throw new InvalidArgumentException('Peran tidak valid atau nonaktif');
    if($userId!==null){$access=$pdo->prepare("SELECT branch_id FROM user_branch_access WHERE user_id=? ORDER BY branch_id FOR UPDATE");$access->execute([$userId]);$access->fetchAll();}
    return $target;
}

function saveUserBranches(PDO $pdo, string $userId, array $branchIds): void {
    if(!$pdo->inTransaction())throw new LogicException('Penggantian akses cabang wajib berada dalam transaksi');
    $pdo->prepare("DELETE FROM user_branch_access WHERE user_id=?")->execute([$userId]);
    $insert=$pdo->prepare("INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)");
    foreach($branchIds as $branchId)$insert->execute([$userId,$branchId]);
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
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'user:create');assertLockedInventoryOwner($authorization);$actor=$authorization['actor'];
            $roleId=(string)($d['roleId']??'');lockUserAuthorizationWriteTarget($pdo,null,$roleId);
            $branchIds=normalizeUserBranchIds($d['branchIds']??[], $d['branchId']??null);$branchIds=lockValidUserBranchesForWrite($pdo,$branchIds);
            $primaryBranchId=(string)($d['branchId']??$branchIds[0]);if(!in_array($primaryBranchId,$branchIds,true))throw new InvalidArgumentException('Cabang utama tidak valid');
            $stmt=$pdo->prepare("INSERT INTO users (id,username,name,email,password,role_id,branch_id,is_active) VALUES (?,?,?,?,?,?,?,?)");
            $stmt->execute([$userId,$d['username'],$d['name'],$d['email']??'',password_hash($d['password'], PASSWORD_DEFAULT),$roleId,$primaryBranchId,array_key_exists('isActive',$d)?(!empty($d['isActive'])?1:0):1]);
            saveUserBranches($pdo,$userId,$branchIds);$pdo->commit();respondSuccess(null,'User ditambahkan');
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),transactionExceptionStatus($e,422));}
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        if (!(bool)($actor['is_owner'] ?? false)) respondError('Hanya Owner dapat mengubah pengguna', 403);
        $d = getInput();
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'user:edit');assertLockedInventoryOwner($authorization);$actor=$authorization['actor'];
            $roleId=(string)($d['roleId']??'');$existing=lockUserAuthorizationWriteTarget($pdo,$id,$roleId);if(!array_key_exists('roleId',$d))$roleId=(string)($existing['role_id']??'');
            if(!empty($existing['is_owner'])){$branchIds=lockAllActiveUserBranchesForWrite($pdo);$isActive=1;}
            else{$branchIds=normalizeUserBranchIds($d['branchIds']??[], $d['branchId']??null);$branchIds=lockValidUserBranchesForWrite($pdo,$branchIds);$isActive=array_key_exists('isActive',$d)?(!empty($d['isActive'])?1:0):1;}
            $primaryBranchId=(string)($d['branchId']??($existing['branch_id']??$branchIds[0]));if(!in_array($primaryBranchId,$branchIds,true))$primaryBranchId=$branchIds[0];
            $pdo->prepare("UPDATE users SET username=?,name=?,email=?,role_id=?,branch_id=?,is_active=? WHERE id=?")
                ->execute([$d['username'],$d['name'],$d['email']??'',$roleId,$primaryBranchId,$isActive,$id]);
            saveUserBranches($pdo,$id,$branchIds);$pdo->commit();respondSuccess(null,'User diupdate');
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),transactionExceptionStatus($e,422));}
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        if (!(bool)($actor['is_owner'] ?? false)) respondError('Hanya Owner dapat menghapus pengguna', 403);
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'user:delete');assertLockedInventoryOwner($authorization);$actor=$authorization['actor'];
            $target=lockUserAuthorizationWriteTarget($pdo,$id,'');
            if(!empty($target['is_protected']))throw new DomainException('Akun Owner tidak dapat dihapus',403);
            $pdo->prepare("DELETE FROM user_branch_access WHERE user_id=?")->execute([$id]);
            $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(null,'User dihapus');
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),transactionExceptionStatus($e,422));}
        break;
    default: respondError('Method not allowed',405);
}
