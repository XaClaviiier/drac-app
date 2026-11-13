<?php
function mapCashAccount(array $row): array {
    $row['accountType']=$row['account_type'];$row['branchId']=$row['branch_id'];$row['branchName']=$row['branch_name']??null;
    $row['ledgerAccountId']=$row['ledger_account_id']??null;$row['ledgerAccountName']=$row['ledger_account_name']??null;
    $row['ledgerAccountCode']=$row['ledger_account_code']??null;
    $row['bankName']=$row['bank_name']??null;$row['accountNumber']=$row['account_number']??null;$row['accountHolder']=$row['account_holder']??null;
    $row['isActive']=(bool)$row['is_active'];
    $row['inTransit']=(float)($row['in_transit']??0);$row['unsubmitted']=(float)($row['unsubmitted']??0);return $row;
}
$actor=$requestUser??requireAuthenticatedUser($pdo);
if($method==='GET') {
    $pdo->beginTransaction();
    try {
        $rows=cashLedgerAccounts($pdo,$actor,trim((string)($_GET['branchId']??'')));
        $pdo->commit();respondSuccess(array_map('mapCashAccount',$rows));
    } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
}
if(!in_array($method,['POST','PUT','DELETE'],true))respondError('Method not allowed',405);
$d=getInput();$pdo->beginTransaction();
try {
    $current=null;
    if($method!=='POST') {
        if((string)($id??'')==='')throw new InvalidArgumentException('ID wajib diisi');
        $stmt=$pdo->prepare('SELECT * FROM cash_accounts WHERE id=? FOR UPDATE');$stmt->execute([$id]);$current=$stmt->fetch();
        if(!$current)throw new InvalidArgumentException('Akun kas/bank tidak ditemukan');
        if((string)($current['branch_id']??'')!=='')requireAccessibleBranch($pdo,$actor,(string)$current['branch_id']);
    }
    if($method==='DELETE') {
        $used=$pdo->prepare('SELECT COUNT(*) FROM branch_account_settings WHERE cash_account_id=? OR bank_account_id=? OR qris_account_id=? OR deposit_destination_account_id=?');
        $used->execute([$id,$id,$id,$id]);
        if(cashAccountHasHistory($pdo,$current)||(int)$used->fetchColumn()>0)throw new InvalidArgumentException('Akun sudah digunakan pada transaksi, jurnal, atau pengaturan cabang. Nonaktifkan akun.');
        $pdo->prepare('DELETE FROM cash_accounts WHERE id=?')->execute([$id]);
        $pdo->commit();respondSuccess(null,'Akun dihapus');
    }
    $name=trim((string)($d['name']??''));$type=(string)($d['accountType']??'');
    if($name===''||!in_array($type,['cash','bank'],true))throw new InvalidArgumentException('Nama dan jenis akun wajib diisi');
    $branchId=!empty($d['isCompanyWide'])?'':trim((string)($d['branchId']??''));
    if($branchId===''&&$type==='cash')throw new InvalidArgumentException('Cabang wajib dipilih untuk akun kas tunai');
    if($branchId!=='')requireAccessibleBranch($pdo,$actor,$branchId);
    $ledger=trim((string)($d['ledgerAccountId']??''));
    if($current&&cashAccountHasHistory($pdo,$current)
        &&($ledger!==(string)$current['ledger_account_id']||$type!==$current['account_type']||$branchId!==(string)($current['branch_id']??''))) {
        throw new InvalidArgumentException('Kode perkiraan, jenis, dan cabang akun yang memiliki riwayat tidak dapat diganti. Buat akun baru agar jurnal lama tetap sesuai.');
    }
    $id=$current['id']??generateId();
    $active=$method==='POST'?true:!empty($d['isActive']);
    // An existing invalid/inactive mapping can still be retired without rewriting history.
    if($active||!$current||$ledger!==(string)$current['ledger_account_id'])validateCashLedgerMapping($pdo,$ledger,(string)$id);
    $code=strtoupper(trim((string)($d['code']??'')))?:($current['code']??strtoupper($type).'-'.substr($id,-6));
    if(mb_strlen($name)>120||strlen($code)>30)throw new InvalidArgumentException('Nama maksimal 120 karakter dan kode maksimal 30 karakter');
    $duplicate=$pdo->prepare('SELECT COUNT(*) FROM cash_accounts WHERE code=? AND id<>?');$duplicate->execute([$code,$id]);
    if((int)$duplicate->fetchColumn()>0)throw new InvalidArgumentException('Kode akun sudah digunakan');
    $values=[$code,$name,$type,$branchId===''?null:$branchId,$ledger,$d['bankName']??null,$d['accountNumber']??null,$d['accountHolder']??null,$active?1:0];
    if($current) {
        $pdo->prepare('UPDATE cash_accounts SET code=?,name=?,account_type=?,branch_id=?,ledger_account_id=?,bank_name=?,account_number=?,account_holder=?,is_active=? WHERE id=?')->execute([...$values,$id]);
    } else {
        $pdo->prepare('INSERT INTO cash_accounts(code,name,account_type,branch_id,ledger_account_id,bank_name,account_number,account_holder,is_active,id) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute([...$values,$id]);
    }
    $pdo->commit();respondSuccess(['id'=>$id],$current?'Akun diperbarui':'Akun kas/bank dibuat');
} catch(InvalidArgumentException $e) {
    if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);
} catch(Throwable $e) {
    if($pdo->inTransaction())$pdo->rollBack();throw $e;
}
