<?php
function mapCashAccount(array $row): array {
    $row['accountType']=$row['account_type'];$row['branchId']=$row['branch_id'];$row['branchName']=$row['branch_name']??null;
    $row['ledgerAccountId']=$row['ledger_account_id']??null;$row['ledgerAccountName']=$row['ledger_account_name']??null;
    $row['bankName']=$row['bank_name']??null;$row['accountNumber']=$row['account_number']??null;$row['accountHolder']=$row['account_holder']??null;
    $row['isActive']=(bool)$row['is_active'];$row['balance']=(float)($row['balance']??0);
    $row['inTransit']=(float)($row['in_transit']??0);$row['unsubmitted']=(float)($row['unsubmitted']??0);return $row;
}
switch($method){
case 'GET':
    $actor=$requestUser??requireAuthenticatedUser($pdo);$allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);
    $rows=$pdo->query("SELECT a.*,b.name branch_name,
      COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0)
      -COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.bank_account COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0)
      +COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.destination_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status='Terverifikasi'),0)
      -COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.source_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status IN ('Dikirim','Terverifikasi')),0) balance
      ,COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.source_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status='Dikirim'),0) in_transit
      ,CASE WHEN a.account_type='cash' THEN GREATEST(0,
        COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0)
        -COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.bank_account COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0)
        -COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.source_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status IN ('Dikirim','Terverifikasi')),0)) ELSE 0 END unsubmitted
      ,c.name ledger_account_name
      FROM cash_accounts a LEFT JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=a.branch_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN chart_of_accounts c ON c.id COLLATE utf8mb4_unicode_ci=a.ledger_account_id COLLATE utf8mb4_unicode_ci
      ORDER BY a.account_type,a.name")->fetchAll();
    $rows=array_values(array_filter($rows,fn($row)=>empty($row['branch_id'])||isset($allowed[(string)$row['branch_id']])));respondSuccess(array_map('mapCashAccount',$rows));break;
case 'POST':
    $actor=$requestUser??requireAuthenticatedUser($pdo);$d=getInput();$name=trim((string)($d['name']??''));$type=$d['accountType']??'';
    if($name===''||!in_array($type,['cash','bank'],true))respondError('Nama dan jenis akun wajib diisi',422);
    $branchId=!empty($d['isCompanyWide'])?null:($d['branchId']??null);if(!$branchId&&$type==='cash')respondError('Cabang wajib dipilih untuk akun kas tunai',422);
    if($branchId)requireAccessibleBranch($pdo,$actor,(string)$branchId);
    $id=generateId();$code=strtoupper(trim((string)($d['code']??'')))?:strtoupper($type).'-'.substr($id,-6);
    $duplicate=$pdo->prepare("SELECT COUNT(*) FROM cash_accounts WHERE code=?");$duplicate->execute([$code]);
    if((int)$duplicate->fetchColumn()>0)respondError('Kode akun sudah digunakan. Kosongkan kode agar dibuat otomatis, atau gunakan kode lain.',422);
    $ledger=$d['ledgerAccountId']??null;
    try{$stmt=$pdo->prepare("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id,bank_name,account_number,account_holder,is_active)VALUES(?,?,?,?,?,?,?,?,?,1)");$stmt->execute([$id,$code,$name,$type,$branchId,$ledger,$d['bankName']??null,$d['accountNumber']??null,$d['accountHolder']??null]);respondSuccess(['id'=>$id],'Akun kas/bank dibuat');}catch(Throwable $e){error_log('cash-accounts POST: '.$e->getMessage());respondError('Akun kas gagal dibuat. Periksa cabang dan data akun.',500);}break;
case 'PUT':
    if(!$id)respondError('ID wajib',422);$actor=$requestUser??requireAuthenticatedUser($pdo);$d=getInput();$type=$d['accountType']??'bank';if(!in_array($type,['cash','bank'],true))respondError('Jenis akun wajib Tunai atau Bank',422);$branchId=!empty($d['isCompanyWide'])?null:($d['branchId']??null);if($type==='cash'&&!$branchId)respondError('Cabang wajib dipilih untuk akun kas tunai',422);
    $current=$pdo->prepare("SELECT branch_id FROM cash_accounts WHERE id=?");$current->execute([$id]);$currentBranch=$current->fetchColumn();if($currentBranch)requireAccessibleBranch($pdo,$actor,(string)$currentBranch);if($branchId)requireAccessibleBranch($pdo,$actor,(string)$branchId);
    $stmt=$pdo->prepare("UPDATE cash_accounts SET code=?,name=?,account_type=?,branch_id=?,ledger_account_id=?,bank_name=?,account_number=?,account_holder=?,is_active=? WHERE id=?");
    $stmt->execute([strtoupper(trim((string)$d['code'])),trim((string)$d['name']),$type,$branchId,$d['ledgerAccountId']??null,$d['bankName']??null,$d['accountNumber']??null,$d['accountHolder']??null,!empty($d['isActive'])?1:0,$id]);respondSuccess(null,'Akun diperbarui');break;
case 'DELETE':
    if(!$id)respondError('ID wajib',422);$actor=$requestUser??requireAuthenticatedUser($pdo);$account=$pdo->prepare("SELECT branch_id FROM cash_accounts WHERE id=?");$account->execute([$id]);$accountBranch=$account->fetchColumn();if($accountBranch)requireAccessibleBranch($pdo,$actor,(string)$accountBranch);$used=$pdo->prepare("SELECT (SELECT COUNT(*) FROM customer_payments WHERE account_id=?)+(SELECT COUNT(*) FROM purchase_payments WHERE bank_account=?)+(SELECT COUNT(*) FROM branch_deposits WHERE source_account_id=? OR destination_account_id=?)+(SELECT COUNT(*) FROM branch_account_settings WHERE cash_account_id=? OR bank_account_id=? OR qris_account_id=? OR deposit_destination_account_id=?)");$used->execute([$id,$id,$id,$id,$id,$id,$id,$id]);if((int)$used->fetchColumn()>0)respondError('Akun sudah digunakan pada transaksi atau pengaturan cabang. Nonaktifkan akun.',422);$pdo->prepare("DELETE FROM cash_accounts WHERE id=?")->execute([$id]);respondSuccess(null,'Akun dihapus');break;
default:respondError('Method not allowed',405);
}
