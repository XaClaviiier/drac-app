<?php
$actor = requireAuthenticatedUser($pdo);
if ($method !== 'PUT') respondError('Method not allowed', 405);
ensureTableColumn($pdo, 'stock_movements', 'verified_at', 'DATETIME NULL AFTER void_reason');
ensureTableColumn($pdo, 'stock_movements', 'verified_by', 'VARCHAR(20) NULL AFTER verified_at');
ensureTableColumn($pdo, 'stock_movements', 'verification_note', 'VARCHAR(255) NULL AFTER verified_by');
if (!authenticatedUserIsOwnerOrAdministrator($pdo, $actor)) {
    respondError('Verifikasi mutasi hanya dapat dilakukan Owner atau Administrator', 403);
}
$movementId = trim((string)$id);
if ($movementId === '') respondError('Mutasi tidak ditemukan', 422);
$input = getInput();
$note = trim((string)($input['note'] ?? ''));
if (strlen($note) > 255) respondError('Catatan verifikasi maksimal 255 karakter', 422);

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT m.id,m.verified_at,m.verified_by,m.source_warehouse_id,m.destination_warehouse_id,
            sw.branch_id source_branch_id,dw.branch_id destination_branch_id
        FROM stock_movements m
        LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id
        LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id
        WHERE m.id=? AND m.is_voided=0 FOR UPDATE");
    $stmt->execute([$movementId]);
    $movement = $stmt->fetch();
    if (!$movement) throw new DomainException('Mutasi tidak ditemukan atau sudah dibatalkan', 404);
    $allowed = array_map('strval', getAccessibleBranchIds($pdo, $actor));
    $visible = in_array((string)($movement['source_branch_id'] ?? ''), $allowed, true)
        || in_array((string)($movement['destination_branch_id'] ?? ''), $allowed, true);
    if (!$visible) throw new DomainException('Mutasi tidak dapat diakses', 403);
    if (empty($movement['verified_at'])) {
        $pdo->prepare('UPDATE stock_movements SET verified_at=NOW(),verified_by=?,verification_note=? WHERE id=?')
            ->execute([(string)($actor['id'] ?? ''), $note !== '' ? $note : null, $movementId]);
    }
    $pdo->commit();
    respondSuccess(['id' => $movementId, 'verifiedAt' => $movement['verified_at'] ?: date('Y-m-d H:i:s'),
        'verifiedBy' => $movement['verified_by'] ?: ($actor['id'] ?? null)], 'Mutasi berhasil diverifikasi');
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($error->getMessage(), transactionExceptionStatus($error, 422));
}
