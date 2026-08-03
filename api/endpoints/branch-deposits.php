<?php
function branchCashSummary(PDO $pdo): array {
    $sql="SELECT b.id branch_id,b.name branch_name,a.id account_id,a.name account_name,
        COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.branch_id=b.id AND p.account_id=a.id),0) cash_received,
        COALESCE((SELECT SUM(d.amount) FROM branch_deposits d WHERE d.branch_id=b.id AND d.status IN ('Dikirim','Terverifikasi')),0) deposited
        FROM branches b JOIN cash_accounts a ON a.branch_id=b.id AND a.account_type='cash' WHERE b.is_active=1";
    $rows=$pdo->query($sql)->fetchAll();
    foreach($rows as &$r){$r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['accountId']=$r['account_id'];$r['accountName']=$r['account_name'];$r['cashReceived']=(float)$r['cash_received'];$r['deposited']=(float)$r['deposited'];$r['unsubmitted']=max(0,$r['cashReceived']-$r['deposited']);}
    return $rows;
}
switch($method){
case 'GET':
    $rows=$pdo->query("SELECT d.*,b.name branch_name,sa.name source_name,da.name destination_name FROM branch_deposits d JOIN branches b ON b.id=d.branch_id JOIN cash_accounts sa ON sa.id=d.source_account_id JOIN cash_accounts da ON da.id=d.destination_account_id ORDER BY d.date DESC,d.created_at DESC")->fetchAll();
    foreach($rows as &$r){$r['depositNumber']=$r['deposit_number'];$r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['sourceAccountId']=$r['source_account_id'];$r['sourceName']=$r['source_name'];$r['destinationAccountId']=$r['destination_account_id'];$r['destinationName']=$r['destination_name'];$r['amount']=(float)$r['amount'];$r['createdByName']=$r['created_by_name'];$r['verifiedByName']=$r['verified_by_name'];}
    respondSuccess(['deposits'=>$rows,'summary'=>branchCashSummary($pdo)]);break;
case 'POST':
    $d=getInput();$pdo->beginTransaction();
    try {
        $branchId=(string)($d['branchId']??'');$amount=(float)($d['amount']??0);
        $summary=array_values(array_filter(branchCashSummary($pdo),fn($x)=>$x['branchId']===$branchId));
        $available=$summary[0]['unsubmitted']??0;
        if($amount<=0||$amount>$available)throw new Exception('Nominal setoran melebihi tunai yang belum disetor');
        $date=(string)($d['date']??date('Y-m-d'));if($date>date('Y-m-d'))throw new Exception('Tanggal tidak boleh melewati hari ini');
        $seq=$pdo->prepare("SELECT COUNT(*) FROM branch_deposits WHERE branch_id=? AND YEAR(date)=YEAR(?)");$seq->execute([$branchId,$date]);
        $branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$branchId]);
        $number='SET-'.strtoupper(substr((string)$branch->fetchColumn(),0,1)).date('ym',strtotime($date)).str_pad((string)((int)$seq->fetchColumn()+1),3,'0',STR_PAD_LEFT);
        $id=generateId();
        $stmt=$pdo->prepare("INSERT INTO branch_deposits(id,deposit_number,date,branch_id,source_account_id,destination_account_id,amount,status,notes,proof_url,created_by,created_by_name)VALUES(?,?,?,?,?,?,?,'Dikirim',?,?,?,?)");
        $stmt->execute([$id,$number,$date,$branchId,$d['sourceAccountId'],$d['destinationAccountId'],$amount,trim((string)($d['notes']??''))?:null,$d['proofUrl']??null,$d['createdBy']??null,$d['createdByName']??null]);
        $pdo->commit();respondSuccess(['id'=>$id,'depositNumber'=>$number],'Setoran dikirim untuk verifikasi');
    } catch(Exception $e){$pdo->rollBack();respondError($e->getMessage(),422);}break;
case 'POST_LEGACY':
    $d=getInput();$pdo->beginTransaction();try{$branchId=(string)($d['branchId']??'');$amount=(float)($d['amount']??0);$summary=array_values(array_filter(branchCashSummary($pdo),fn($x)=>$x['branchId']===$branchId));$available=$summary[0]['unsubmitted']??0;if($amount<=0||$amount>$available)throw new Exception('Nominal setoran melebihi tunai yang belum disetor');$date=(string)($d['date']??date('Y-m-d'));if($date>date('Y-m-d'))throw new Exception('Tanggal tidak boleh melewati hari ini');$seq=$pdo->prepare("SELECT COUNT(*) FROM branch_deposits WHERE branch_id=? AND YEAR(date)=YEAR(?)");$seq->execute([$branchId,$date]);$branch=$pdo->prepare("SELECT code FROM branches WHERE id=?");$branch->execute([$branchId]);$number='SET-'.strtoupper(substr((string)$branch->fetchColumn(),0,1)).date('ym',strtotime($date)).str_pad((string)((int)$seq->fetchColumn()+1),3,'0',STR_PAD_LEFT);$id=generateId();$stmt=$pdo->prepare("INSERT INTO branch_deposits(id,deposit_number,date,branch_id,source_account_id,destination_account_id,amount,status,notes,proof_url,created_by,created_by_name)VALUES(?,?,?,?,?,?,?,'Dikirim',?,?,?,?,?)");$stmt->execute([$id,$number,$date,$branchId,$d['sourceAccountId'],$d['destinationAccountId'],$amount,trim((string)($d['notes']??''))?:null,$d['proofUrl']??null,$d['createdBy']??null,$d['createdByName']??null]);$pdo->commit();respondSuccess(['id'=>$id,'depositNumber'=>$number],'Setoran dikirim untuk verifikasi');}catch(Exception $e){$pdo->rollBack();respondError($e->getMessage(),422);}break;
case 'PUT':
    if(!$id)respondError('ID wajib',422);$d=getInput();$status=$d['status']??'';if(!in_array($status,['Terverifikasi','Ditolak'],true))respondError('Status tidak valid',422);$stmt=$pdo->prepare("UPDATE branch_deposits SET status=?,verified_by=?,verified_by_name=?,verified_at=NOW(),notes=CONCAT(COALESCE(notes,''),?) WHERE id=?");$stmt->execute([$status,$d['verifiedBy']??null,$d['verifiedByName']??null,!empty($d['reason'])?' | '.$d['reason']:'',$id]);respondSuccess(null,'Setoran diperbarui');break;
default:respondError('Method not allowed',405);
}
