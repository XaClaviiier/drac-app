<?php
function mapLedgerAccount(array $r): array {
    return ['id'=>$r['id'],'code'=>$r['code'],'name'=>$r['name'],'accountType'=>$r['account_type'],
        'parentId'=>$r['parent_id'],'parentName'=>$r['parent_name']??null,'normalBalance'=>$r['normal_balance'],
        'isActive'=>(bool)$r['is_active'],'detailType'=>$r['detail_type']??'','notes'=>$r['notes']??'',
        'revision'=>(int)($r['revision']??0)];
}
if ($method === 'GET') {
    $rows=$pdo->query('SELECT a.*,p.name parent_name FROM chart_of_accounts a LEFT JOIN chart_of_accounts p ON p.id=a.parent_id ORDER BY a.code')->fetchAll();
    respondSuccess(array_map('mapLedgerAccount',$rows));
}
if (!in_array($method,['POST','PUT','DELETE'],true)) respondError('Method not allowed',405);
$types=['Kas & Bank'=>'Asset','Piutang Usaha'=>'Asset','Persediaan'=>'Asset','Aset Lancar Lainnya'=>'Asset','Aset Tetap'=>'Asset','Akumulasi Penyusutan'=>'Asset','Aset Lainnya'=>'Asset','Utang Usaha'=>'Liability','Liabilitas Jangka Pendek'=>'Liability','Liabilitas Jangka Panjang'=>'Liability','Modal'=>'Equity','Pendapatan'=>'Revenue','Beban Pokok Penjualan'=>'Expense','Beban'=>'Expense','Beban Lainnya'=>'Expense','Pendapatan Lainnya'=>'Revenue'];
$d=getInput();$pdo->beginTransaction();
try {
    lockInventoryMutation($pdo);
    lockInventoryMutationAuthorization($pdo,$requestUser,'settings:edit');
    $all=$pdo->query('SELECT * FROM chart_of_accounts ORDER BY id FOR UPDATE')->fetchAll();
    $byId=[];foreach($all as $row)$byId[(string)$row['id']]=$row;
    $existing=$id?($byId[$id]??null):null;
    if($method!=='POST'&&!$existing)throw new DomainException('Akun tidak ditemukan',404);
    if($existing&&array_key_exists('revision',$d)&&(int)$d['revision']!==(int)$existing['revision'])throw new DomainException('Akun sudah diubah. Muat ulang sebelum menyimpan.',409);
    if($method==='DELETE') {
        $journalUsage=$pdo->prepare('SELECT 1 FROM journal_lines WHERE account_id=? LIMIT 1');$journalUsage->execute([$id]);
        if($journalUsage->fetchColumn())throw new DomainException('Akun dipakai jurnal; tidak dapat dihapus.',422);
        $used=$pdo->prepare('SELECT (SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id=?)+(SELECT COUNT(*) FROM cash_accounts WHERE ledger_account_id=?)+(SELECT COUNT(*) FROM branch_account_settings WHERE receivable_coa_id=? OR service_revenue_coa_id=? OR goods_revenue_coa_id=? OR inventory_coa_id=?)');
        $used->execute([$id,$id,$id,$id,$id,$id]);
        if((int)$used->fetchColumn()>0)throw new DomainException('Akun sedang digunakan. Nonaktifkan akun bila tidak dipakai.',422);
        $pdo->prepare('DELETE FROM chart_of_accounts WHERE id=?')->execute([$id]);
        $pdo->commit();respondSuccess(null,'Akun dihapus');
    }
    $name=trim((string)($d['name']??''));$code=strtoupper(trim((string)($d['code']??'')));
    $detail=trim((string)($d['detailType']??$existing['detail_type']??''));
    $type=$detail!==''?($types[$detail]??null):($d['accountType']??$existing['account_type']??'Asset');
    if(!in_array($type,['Asset','Liability','Equity','Revenue','Expense'],true))throw new InvalidArgumentException('Tipe akun tidak valid');
    if($existing&&$type!==$existing['account_type'])throw new InvalidArgumentException('Kelompok akun tersimpan tidak dapat diganti');
    $normal=$d['normalBalance']??$existing['normal_balance']??(($detail==='Akumulasi Penyusutan'||in_array($type,['Liability','Equity','Revenue'],true))?'Credit':'Debit');
    if(!in_array($normal,['Debit','Credit'],true))throw new InvalidArgumentException('Saldo normal tidak valid');
    $parent=trim((string)($d['parentId']??''));
    if($parent!=='') {
        if(!isset($byId[$parent]))throw new InvalidArgumentException('Akun induk tidak ditemukan');
        if($byId[$parent]['account_type']!==$type)throw new InvalidArgumentException('Tipe akun induk harus sesuai');
        if(!(bool)$byId[$parent]['is_active']&&(!$existing||$existing['parent_id']!==$parent))throw new InvalidArgumentException('Akun induk nonaktif');
        $visited=[];$cursor=$parent;
        while($cursor!=='') {if($cursor===$id||isset($visited[$cursor]))throw new InvalidArgumentException('Hubungan akun induk berputar');$visited[$cursor]=true;$cursor=(string)($byId[$cursor]['parent_id']??'');}
    }
    if(!empty($d['autoCode'])) {
        if($existing||$parent==='')throw new InvalidArgumentException('Kode otomatis hanya untuk subakun baru');
        $codes=array_column($all,'code');$n=1;
        do{$code=$byId[$parent]['code'].'-'.str_pad((string)$n++,2,'0',STR_PAD_LEFT);}while(in_array($code,$codes,true));
    }
    $notes=trim((string)($d['notes']??$existing['notes']??''));
    if($code===''||$name==='')throw new InvalidArgumentException('Kode dan nama akun wajib diisi');
    if(strlen($code)>30||mb_strlen($name)>120||strlen($notes)>10000)throw new InvalidArgumentException('Kode maksimal 30 karakter, nama 120 karakter, catatan 10.000 byte');
    if(!preg_match('/^[A-Z0-9._-]+$/D',$code))throw new InvalidArgumentException('Kode hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung');
    foreach($all as $row)if(strcasecmp($row['code'],$code)===0&&$row['id']!==$id)throw new InvalidArgumentException('Kode akun sudah digunakan');
    $active=!empty($d['isActive'])?1:0;
    if($method==='POST') {
        $id=generateId();$pdo->prepare('INSERT INTO chart_of_accounts(id,code,name,account_type,parent_id,normal_balance,is_active,detail_type,notes) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$id,$code,$name,$type,$parent?:null,$normal,$active,$detail,$notes]);
    } else {
        $pdo->prepare('UPDATE chart_of_accounts SET code=?,name=?,account_type=?,parent_id=?,normal_balance=?,is_active=?,detail_type=?,notes=?,revision=revision+1 WHERE id=?')->execute([$code,$name,$type,$parent?:null,$normal,$active,$detail,$notes,$id]);
    }
    $pdo->commit();respondSuccess(['id'=>$id],'Akun perkiraan tersimpan');
} catch(Throwable $e) {
    if($pdo->inTransaction())$pdo->rollBack();
    if($e instanceof InvalidArgumentException||$e instanceof DomainException)respondError($e->getMessage(),$e instanceof DomainException?(int)$e->getCode():422);
    error_log('Chart of accounts: '.$e->getMessage());respondError('Akun gagal disimpan. Muat ulang dan coba lagi.',500);
}
