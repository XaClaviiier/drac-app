<?php
function mapCashAccount(array $row): array {
    $row['accountType']=$row['account_type'];$row['branchId']=$row['branch_id'];$row['branchName']=$row['branch_name']??null;
    $row['isActive']=(bool)$row['is_active'];$row['balance']=(float)($row['balance']??0);return $row;
}
switch($method){
case 'GET':
    $rows=$pdo->query("SELECT a.*,b.name branch_name,
      COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci),0)
      +COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.destination_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status='Terverifikasi'),0)
      -COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.source_account_id COLLATE utf8mb4_unicode_ci=a.id COLLATE utf8mb4_unicode_ci AND d.status IN ('Dikirim','Terverifikasi')),0) balance
      FROM cash_accounts a LEFT JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=a.branch_id COLLATE utf8mb4_unicode_ci ORDER BY a.account_type,a.name")->fetchAll();
    respondSuccess(array_map('mapCashAccount',$rows));break;
case 'POST':
    $d=getInput();$name=trim((string)($d['name']??''));$type=$d['accountType']??'';
    if($name===''||!in_array($type,['cash','bank','qris'],true))respondError('Nama dan jenis akun wajib diisi',422);
    $branchId=$type==='cash'?($d['branchId']??null):null;if($type==='cash'&&!$branchId)respondError('Cabang wajib dipilih untuk akun kas',422);
    $id=generateId();$code=strtoupper(trim((string)($d['code']??'')))?:strtoupper($type).'-'.substr($id,-6);
    $duplicate=$pdo->prepare("SELECT COUNT(*) FROM cash_accounts WHERE code=?");$duplicate->execute([$code]);
    if((int)$duplicate->fetchColumn()>0)respondError('Kode akun sudah digunakan. Kosongkan kode agar dibuat otomatis, atau gunakan kode lain.',422);
    try{$stmt=$pdo->prepare("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,is_active)VALUES(?,?,?,?,?,1)");$stmt->execute([$id,$code,$name,$type,$branchId]);respondSuccess(['id'=>$id],'Akun kas/bank dibuat');}catch(Throwable $e){error_log('cash-accounts POST: '.$e->getMessage());respondError('Akun kas gagal dibuat. Periksa cabang dan data akun.',500);}break;
case 'PUT':
    if(!$id)respondError('ID wajib',422);$d=getInput();$stmt=$pdo->prepare("UPDATE cash_accounts SET code=?,name=?,account_type=?,branch_id=?,is_active=? WHERE id=?");$type=$d['accountType']??'bank';$stmt->execute([strtoupper(trim((string)$d['code'])),trim((string)$d['name']),$type,$type==='cash'?($d['branchId']??null):null,!empty($d['isActive'])?1:0,$id]);respondSuccess(null,'Akun diperbarui');break;
case 'DELETE':
    if(!$id)respondError('ID wajib',422);$used=$pdo->prepare("SELECT (SELECT COUNT(*) FROM customer_payments WHERE account_id=?)+(SELECT COUNT(*) FROM branch_deposits WHERE source_account_id=? OR destination_account_id=?)");$used->execute([$id,$id,$id]);if((int)$used->fetchColumn()>0)respondError('Akun sudah memiliki transaksi dan tidak dapat dihapus. Nonaktifkan akun.',422);$pdo->prepare("DELETE FROM cash_accounts WHERE id=?")->execute([$id]);respondSuccess(null,'Akun dihapus');break;
default:respondError('Method not allowed',405);
}
