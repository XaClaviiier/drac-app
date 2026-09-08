<?php
// BRANCHES CRUD
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
        foreach ($rows as &$r) { $r['isActive'] = (bool)$r['is_active']; $r['reviewUrl'] = $r['review_url'] ?? ''; }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'branch:create');
            $actor=$authorization['actor'];
            $stmt = $pdo->prepare("INSERT INTO branches (id, code, name, address, phone, review_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$d['id'] ?? generateId(),$d['code'],$d['name'],$d['address'] ?? '',$d['phone'] ?? '',$d['reviewUrl'] ?? '',$d['isActive'] ?? 1]);
            $pdo->commit();respondSuccess(null, 'Cabang ditambahkan');
        } catch(Throwable $error) {if($pdo->inTransaction())$pdo->rollBack();respondError($error->getMessage(),transactionExceptionStatus($error,422));}
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'branch:edit');
            $actor=$authorization['actor'];
            assertLockedInventoryBranchAccess($authorization,$id);
            $current=$pdo->prepare("SELECT id,is_active FROM branches WHERE id=? FOR UPDATE");$current->execute([$id]);if(!$current->fetch())throw new DomainException('Cabang tidak ditemukan',404);
            $stmt = $pdo->prepare("UPDATE branches SET code=?, name=?, address=?, phone=?, review_url=?, is_active=? WHERE id=?");
            $stmt->execute([$d['code'], $d['name'], $d['address'] ?? '', $d['phone'] ?? '', $d['reviewUrl'] ?? '', $d['isActive'] ?? 1, $id]);
            $pdo->commit();respondSuccess(null, 'Cabang diupdate');
        } catch(Throwable $error) {if($pdo->inTransaction())$pdo->rollBack();respondError($error->getMessage(),transactionExceptionStatus($error,422));}
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'branch:delete');
            $actor=$authorization['actor'];
            assertLockedInventoryBranchAccess($authorization,$id);
            $current=$pdo->prepare("SELECT id,is_active FROM branches WHERE id=? FOR UPDATE");$current->execute([$id]);if(!$current->fetch())throw new DomainException('Cabang tidak ditemukan',404);
            $pdo->prepare("UPDATE branches SET is_active=0 WHERE id=?")->execute([$id]);
            $pdo->commit();respondSuccess(null, 'Cabang dinonaktifkan');
        } catch(Throwable $error) {if($pdo->inTransaction())$pdo->rollBack();respondError($error->getMessage(),transactionExceptionStatus($error,422));}
        break;

    default: respondError('Method not allowed', 405);
}
