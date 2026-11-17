<?php
// Supplier mapping is metadata only: never recreate receipt lines or stock movements.
if ($method !== 'PUT' || !$id) respondError('Method not allowed', 405);
$d = getInput();
if (!isset($d['supplierId'], $d['expectedSupplierId']) || !is_string($d['supplierId']) || !is_string($d['expectedSupplierId'])) {
    respondError('Supplier dan pemetaan sebelumnya wajib dikirim', 422);
}
$supplierId = trim($d['supplierId']);
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
$pdo->beginTransaction();
try {
    lockInventoryMutation($pdo);
    $authorization = lockInventoryMutationAuthorization($pdo, $actor, 'receipt:supplier');
    $actor = $authorization['actor'];

    $receiptStmt = $pdo->prepare('SELECT * FROM goods_receipts WHERE id=? FOR UPDATE');
    $receiptStmt->execute([$id]);
    $receipt = $receiptStmt->fetch();
    if (!$receipt) throw new DomainException('Penerimaan tidak ditemukan', 404);
    assertLockedInventoryBranchAccess($authorization, (string)$receipt['branch_id']);
    if (($receipt['source_type'] ?? 'Supplier') === 'Transfer Gudang') throw new InvalidArgumentException('Transfer gudang tidak dipetakan ke supplier');
    if (!in_array($receipt['status'], ['Draft', 'Diterima'], true)) throw new DomainException('Supplier hanya dapat diubah sebelum penerimaan difakturkan atau dibatalkan', 409);
    if ((string)($receipt['supplier_id'] ?? '') !== $d['expectedSupplierId']) throw new DomainException('Supplier penerimaan sudah berubah. Daftar diperbarui, silakan pilih kembali.', 409);

    $linesStmt = $pdo->prepare('SELECT qty_invoiced FROM goods_receipt_items WHERE receipt_id=? FOR UPDATE');
    $linesStmt->execute([$id]);
    foreach ($linesStmt->fetchAll() as $line) {
        if ((int)$line['qty_invoiced'] > 0) throw new DomainException('Supplier penerimaan yang sudah difakturkan tidak dapat diubah', 409);
    }
    $linkedStmt = $pdo->prepare('SELECT COUNT(*) FROM purchase_invoice_items WHERE receipt_id=?');
    $linkedStmt->execute([$id]);
    if ((int)$linkedStmt->fetchColumn() > 0) throw new DomainException('Supplier penerimaan yang sudah difakturkan tidak dapat diubah', 409);

    $supplier = null;
    if ($supplierId !== '') {
        $supplierStmt = $pdo->prepare('SELECT id,name FROM suppliers WHERE id=? AND is_active=1 FOR UPDATE');
        $supplierStmt->execute([$supplierId]);
        $supplier = $supplierStmt->fetch();
        if (!$supplier) throw new InvalidArgumentException('Supplier tidak ditemukan atau nonaktif');
    }
    $supplierName = $supplier['name'] ?? '';
    if ($supplierId !== (string)($receipt['supplier_id'] ?? '') || $supplierName !== (string)($receipt['supplier_name'] ?? '')) {
        $pdo->prepare('UPDATE goods_receipts SET supplier_id=?,supplier_name=? WHERE id=?')
            ->execute([$supplier['id'] ?? null, $supplierName, $id]);
        $snapshot = json_encode([
            'before' => ['supplierId' => $receipt['supplier_id'], 'supplierName' => $receipt['supplier_name'] ?? ''],
            'after' => ['supplierId' => $supplierId, 'supplierName' => $supplierName],
        ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('goods_receipt',?,?,'update',?,?,?,?)")
            ->execute([$id, $receipt['receipt_number'], 'Pemetaan supplier', $snapshot, $actor['id'], $actor['name']]);
    }
    $pdo->commit();
    respondSuccess(['id' => $id, 'supplierId' => $supplierId, 'supplierName' => $supplierName], 'Supplier penerimaan disimpan');
} catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($e->getMessage(), in_array($e->getCode(), [403, 404, 409], true) ? $e->getCode() : 409);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($e->getMessage(), 422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Receipt supplier mapping: '.$e->getMessage());
    respondError('Gagal menyimpan supplier penerimaan', 500);
}
