<?php
$actor=$requestUser??requireAuthenticatedUser($pdo);
requireAuthenticatedUserPermission($pdo,$actor,'report:view');
if($method==='GET'){
    $branches=getAccessibleBranchIds($pdo,$actor);if(!$branches)respondSuccess([]);
    $marks=implode(',',array_fill(0,count($branches),'?'));
    $q=$pdo->prepare("SELECT * FROM journal_entries WHERE branch_id IN ($marks) ORDER BY date DESC,created_at DESC,id DESC LIMIT 500");$q->execute($branches);$rows=$q->fetchAll(PDO::FETCH_ASSOC);
    $q=$pdo->prepare('SELECT line_number,account_id,account_code,account_name,debit,credit FROM journal_lines WHERE journal_id=? ORDER BY line_number');
    foreach($rows as &$row){$q->execute([$row['id']]);$row['lines']=$q->fetchAll(PDO::FETCH_ASSOC);}unset($row);
    respondSuccess($rows);return;
}
if($method!=='POST')respondError('Jurnal bersifat permanen. Edit/hapus/reversal belum didukung.',405);
requireAuthenticatedUserPermission($pdo,$actor,'settings:edit');
$d=getInput();$pdo->beginTransaction();
try{
    lockInventoryMutation($pdo);
    $auth=lockInventoryMutationAuthorization($pdo,$actor,'settings:edit');
    assertLockedInventoryPermission($auth,'report:view');
    $branch=(string)($d['branchId']??'');assertLockedInventoryBranchAccess($auth,$branch);assertActiveBranch($pdo,$branch);
    if(array_key_exists('sourceType',$d)||array_key_exists('sourceId',$d)||array_key_exists('source_type',$d)||array_key_exists('source_id',$d))throw new DomainException('Sumber otomatis tidak boleh dikirim melalui jurnal manual.');
    if(!is_array($d['lines']??null))throw new DomainException('Baris jurnal wajib diisi.');
    $id=postJournal($pdo,$branch,(string)($d['date']??''),(string)($d['description']??''),$d['lines'],(string)$auth['actor']['id'],'manual',null);
    $pdo->commit();respondSuccess(['id'=>$id],'Jurnal tersimpan permanen.');
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e instanceof PDOException?'Gagal menyimpan jurnal. Tidak ada perubahan tersimpan.':$e->getMessage(),transactionExceptionStatus($e,422));}
