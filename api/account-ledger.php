<?php
/** Shared COA hierarchy and journal projections; reading never seeds or changes accounts. */
function accountLedgerDescendants(array $accounts, string $accountId): array {
    $children=[];$known=[];
    foreach($accounts as $account){
        $id=(string)$account['id'];$known[$id]=true;
        $parent=(string)($account['parent_id']??'');
        if($parent!=='')$children[$parent][]=$id;
    }
    if(!isset($known[$accountId]))throw new InvalidArgumentException('Akun perkiraan tidak ditemukan');
    $result=[];$pending=[$accountId];
    while($pending){$id=array_pop($pending);if(isset($result[$id]))continue;$result[$id]=true;foreach($children[$id]??[] as $child)$pending[]=$child;}
    return array_keys($result);
}

function accountLedgerBalances(PDO $pdo, array $accounts, array $actor, string $asOf, string $branchId=''): array {
    $date=DateTimeImmutable::createFromFormat('!Y-m-d',$asOf);
    if(!$date||$date->format('Y-m-d')!==$asOf)throw new InvalidArgumentException('Tanggal saldo tidak valid');
    [$scope,$params]=cashJournalScope($pdo,$actor,$branchId);
    $stmt=$pdo->prepare("SELECT l.account_id,SUM(l.debit-l.credit) signed_balance,
        SUM(CASE WHEN j.source_type='opening_balance' THEN l.debit-l.credit ELSE 0 END) opening_balance,
        MAX(CASE WHEN j.source_type='opening_balance' THEN j.entry_date ELSE NULL END) opening_date
        FROM journal_lines l JOIN journal_entries j ON j.id COLLATE utf8mb4_unicode_ci=l.journal_id COLLATE utf8mb4_unicode_ci
        WHERE j.posted=1 AND j.entry_date<=? AND $scope GROUP BY l.account_id");
    $stmt->execute(array_merge([$asOf],$params));
    $totals=[];foreach($stmt->fetchAll() as $row)$totals[(string)$row['account_id']]=$row;
    $result=[];
    foreach($accounts as $account){
        $ids=accountLedgerDescendants($accounts,(string)$account['id']);
        $signed=0.0;$opening=0.0;$openingDate=null;
        foreach($ids as $id){
            $total=$totals[$id]??[];$signed+=(float)($total['signed_balance']??0);$opening+=(float)($total['opening_balance']??0);
            $candidate=$total['opening_date']??null;
            if($candidate!==null&&($openingDate===null||$candidate>$openingDate))$openingDate=$candidate;
        }
        $direction=($account['normal_balance']??'Debit')==='Credit'?-1:1;
        $result[(string)$account['id']]=['balance'=>round($signed*$direction,2),'signedBalance'=>round($signed,2),
            'openingBalance'=>round($opening*$direction,2),'openingBalanceDate'=>$openingDate,'balanceDate'=>$asOf,
            'includesSubaccounts'=>count($ids)>1];
    }
    return $result;
}
