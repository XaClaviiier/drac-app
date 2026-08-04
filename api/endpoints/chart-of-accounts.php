<?php
function mapLedgerAccount(array $r): array {
    return ['id'=>$r['id'],'code'=>$r['code'],'name'=>$r['name'],'accountType'=>$r['account_type'],
        'parentId'=>$r['parent_id'],'parentName'=>$r['parent_name']??null,'normalBalance'=>$r['normal_balance'],
        'isActive'=>(bool)$r['is_active']];
}
switch ($method) {
case 'GET':
    $rows=$pdo->query("SELECT a.*,p.name parent_name FROM chart_of_accounts a LEFT JOIN chart_of_accounts p ON p.id=a.parent_id ORDER BY a.code")->fetchAll();
    respondSuccess(array_map('mapLedgerAccount',$rows));break;
case 'POST':
    $d=getInput();$code=strtoupper(trim((string)($d['code']??'')));$name=trim((string)($d['name']??''));
    $type=$d['accountType']??'Asset';$normal=$d['normalBalance']??(in_array($type,['Revenue','Liability','Equity'],true)?'Credit':'Debit');
    if($code===''||$name==='')respondError('Kode dan nama akun wajib diisi',422);
    if(!in_array($type,['Asset','Liability','Equity','Revenue','Expense'],true))respondError('Tipe akun tidak valid',422);
    try{$id=generateId();$pdo->prepare("INSERT INTO chart_of_accounts(id,code,name,account_type,parent_id,normal_balance,is_active)VALUES(?,?,?,?,?,?,?)")
        ->execute([$id,$code,$name,$type,($d['parentId']??'')?:null,$normal,!empty($d['isActive'])?1:0]);respondSuccess(['id'=>$id],'Akun perkiraan dibuat');}
    catch(Throwable $e){respondError('Kode akun sudah digunakan',422);}break;
case 'PUT':
    if(!$id)respondError('ID wajib',422);$d=getInput();
    $pdo->prepare("UPDATE chart_of_accounts SET code=?,name=?,account_type=?,parent_id=?,normal_balance=?,is_active=? WHERE id=?")
        ->execute([strtoupper(trim($d['code'])),trim($d['name']),$d['accountType'],($d['parentId']??'')?:null,$d['normalBalance'],!empty($d['isActive'])?1:0,$id]);
    respondSuccess(null,'Akun perkiraan diperbarui');break;
case 'DELETE':
    if(!$id)respondError('ID wajib',422);
    $used=$pdo->prepare("SELECT (SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id=?)+(SELECT COUNT(*) FROM cash_accounts WHERE ledger_account_id=?)+(SELECT COUNT(*) FROM branch_account_settings WHERE receivable_coa_id=? OR service_revenue_coa_id=? OR goods_revenue_coa_id=? OR inventory_coa_id=?)");
    $used->execute([$id,$id,$id,$id,$id,$id]);if((int)$used->fetchColumn()>0)respondError('Akun sedang digunakan. Nonaktifkan akun bila tidak dipakai.',422);
    $pdo->prepare("DELETE FROM chart_of_accounts WHERE id=?")->execute([$id]);respondSuccess(null,'Akun dihapus');break;
default:respondError('Method not allowed',405);
}
