<?php
switch($method){
case 'GET':
    $actor=$requestUser??requireAuthenticatedUser($pdo);$allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);
    $rows=array_values(array_filter($pdo->query("SELECT d.*,b.name branch_name,sa.name source_name,da.name destination_name FROM branch_deposits d JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=d.branch_id COLLATE utf8mb4_unicode_ci JOIN cash_accounts sa ON sa.id COLLATE utf8mb4_unicode_ci=d.source_account_id COLLATE utf8mb4_unicode_ci JOIN cash_accounts da ON da.id COLLATE utf8mb4_unicode_ci=d.destination_account_id COLLATE utf8mb4_unicode_ci ORDER BY d.date DESC,d.created_at DESC")->fetchAll(),fn($row)=>isset($allowed[(string)$row['branch_id']])));
    foreach($rows as &$r){$r['depositNumber']=$r['deposit_number'];$r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['sourceAccountId']=$r['source_account_id'];$r['sourceName']=$r['source_name'];$r['destinationAccountId']=$r['destination_account_id'];$r['destinationName']=$r['destination_name'];$r['amount']=(float)$r['amount'];$r['createdByName']=$r['created_by_name'];$r['verifiedByName']=$r['verified_by_name'];}
    respondSuccess(['deposits'=>$rows,'summary'=>branchCashSummary($pdo,$actor)]);break;
case 'POST':
    $actor=$requestUser??requireAuthenticatedUser($pdo);$d=getInput();$pdo->beginTransaction();
    try {
        $branchId=(string)($d['branchId']??'');$amount=(float)($d['amount']??0);
        requireAccessibleBranch($pdo,$actor,$branchId);
        $sourceAccountId=(string)($d['sourceAccountId']??'');
        $source=$pdo->prepare("SELECT id,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1 FOR UPDATE");$source->execute([$sourceAccountId]);$sourceRow=$source->fetch();
        if(!$sourceRow||$sourceRow['account_type']!=='cash'||(string)$sourceRow['branch_id']!==$branchId)throw new Exception('Akun sumber tunai tidak sesuai cabang');
        $summary=array_values(array_filter(branchCashSummary($pdo,$actor),fn($x)=>$x['branchId']===$branchId && $x['accountId']===$sourceAccountId));
        $available=$summary[0]['unsubmitted']??0;
        if($amount<=0||$amount>$available)throw new Exception('Nominal setoran melebihi tunai yang belum disetor');
        $date=(string)($d['date']??date('Y-m-d'));if($date>date('Y-m-d'))throw new Exception('Tanggal tidak boleh melewati hari ini');
        $seq=$pdo->prepare("SELECT COUNT(*) FROM branch_deposits WHERE branch_id=? AND YEAR(date)=YEAR(?)");$seq->execute([$branchId,$date]);
        $branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$branchId]);
        $number='SET-'.strtoupper(substr((string)$branch->fetchColumn(),0,1)).date('ym',strtotime($date)).str_pad((string)((int)$seq->fetchColumn()+1),3,'0',STR_PAD_LEFT);
        $destinationAccountId=(string)($d['destinationAccountId']??'');
        if($destinationAccountId===''){
            $default=$pdo->prepare("SELECT deposit_destination_account_id FROM branch_account_settings WHERE branch_id=?");$default->execute([$branchId]);
            $destinationAccountId=(string)($default->fetchColumn()?:'');
        }
        $destination=$pdo->prepare("SELECT id,account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1");$destination->execute([$destinationAccountId]);$destinationRow=$destination->fetch();
        if(!$destinationRow||$destinationRow['account_type']==='cash')throw new Exception('Akun tujuan setoran cabang belum diatur');
        if($destinationRow['branch_id']&&$destinationRow['branch_id']!==$branchId)throw new Exception('Akun tujuan tidak sesuai cabang');
        $id=generateId();
        $stmt=$pdo->prepare("INSERT INTO branch_deposits(id,deposit_number,date,branch_id,source_account_id,destination_account_id,amount,status,notes,proof_url,created_by,created_by_name)VALUES(?,?,?,?,?,?,?,'Dikirim',?,?,?,?)");
        $stmt->execute([$id,$number,$date,$branchId,$sourceAccountId,$destinationAccountId,$amount,trim((string)($d['notes']??''))?:null,$d['proofUrl']??null,$actor['id']??null,$actor['name']??$actor['username']??null]);
        $pdo->commit();respondSuccess(['id'=>$id,'depositNumber'=>$number],'Setoran dikirim untuk verifikasi');
    } catch(Exception $e){$pdo->rollBack();respondError($e->getMessage(),422);}break;
case 'PUT':
    if(!$id)respondError('ID wajib',422);$actor=$requestUser??requireAuthenticatedUser($pdo);$d=getInput();$status=$d['status']??'';if(!in_array($status,['Terverifikasi','Ditolak'],true))respondError('Status tidak valid',422);
    $pdo->beginTransaction();
    try{
        $current=$pdo->prepare("SELECT * FROM branch_deposits WHERE id=? FOR UPDATE");$current->execute([$id]);$deposit=$current->fetch();if(!$deposit)throw new Exception('Setoran tidak ditemukan');requireAccessibleBranch($pdo,$actor,(string)$deposit['branch_id']);if($deposit['status']!=='Dikirim')throw new Exception('Setoran yang sudah diproses tidak dapat diverifikasi ulang');
        $stmt=$pdo->prepare("UPDATE branch_deposits SET status=?,verified_by=?,verified_by_name=?,verified_at=NOW(),notes=CONCAT(COALESCE(notes,''),?) WHERE id=? AND status='Dikirim'");$stmt->execute([$status,$actor['id']??null,$actor['name']??$actor['username']??null,!empty($d['reason'])?' | '.$d['reason']:'',$id]);
        if($status==='Terverifikasi'){
            $accounts=$pdo->prepare('SELECT id,ledger_account_id FROM cash_accounts WHERE id IN (?,?) AND is_active=1');$accounts->execute([$deposit['source_account_id'],$deposit['destination_account_id']]);$ledger=[];foreach($accounts->fetchAll() as $account)$ledger[(string)$account['id']]=(string)$account['ledger_account_id'];
            postOperationalJournal($pdo,$deposit['date'],'Setoran kas '.$deposit['deposit_number'],(string)$deposit['branch_id'],'branch_deposit',(string)$id,'DEPOSIT',[
                [$ledger[(string)$deposit['destination_account_id']]??'',(float)$deposit['amount'],0,'Bank tujuan setoran'],[$ledger[(string)$deposit['source_account_id']]??'',0,(float)$deposit['amount'],'Kas sumber setoran']
            ],$actor['id']??null);
        }
        $pdo->commit();respondSuccess(null,'Setoran diperbarui');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}break;
default:respondError('Method not allowed',405);
}
