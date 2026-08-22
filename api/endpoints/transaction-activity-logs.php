<?php
$actor=$requestUser ?? requireAuthenticatedUser($pdo);
if($method!=='GET')respondError('Method not allowed',405);
$roleStmt=$pdo->prepare("SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1");
$roleStmt->execute([$actor['role_id']??'']);
$role=$roleStmt->fetch()?:[];
$isAdmin=!empty($actor['is_owner'])||strtoupper((string)($role['code']??''))==='ADM'||strtolower((string)($role['name']??''))==='administrator';
if(!$isAdmin)respondError('Log Aktivitas hanya tersedia untuk Owner dan Administrator',403);

$entityType=trim((string)($_GET['entityType']??''));
$entityId=trim((string)($_GET['entityId']??''));
$limit=max(1,min(500,(int)($_GET['limit']??100)));
$where=[];$params=[];
if($entityType!==''){$where[]='entity_type=?';$params[]=$entityType;}
if($entityId!==''){$where[]='entity_id=?';$params[]=$entityId;}
$sql="SELECT * FROM transaction_activity_logs".($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY created_at DESC,id DESC LIMIT {$limit}";
$stmt=$pdo->prepare($sql);$stmt->execute($params);
$rows=$stmt->fetchAll();
foreach($rows as &$row){
    $row['entityType']=$row['entity_type'];$row['entityId']=$row['entity_id'];$row['entityNumber']=$row['entity_number'];
    $row['actionType']=$row['action_type'];$row['snapshot']=$row['snapshot_json']?json_decode($row['snapshot_json'],true):null;
    $row['userId']=$row['user_id'];$row['userName']=$row['user_name'];$row['createdAt']=$row['created_at'];
    unset($row['snapshot_json']);
}
respondSuccess($rows);
