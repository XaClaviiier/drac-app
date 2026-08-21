<?php
$actor=requireAuthenticatedUser($pdo);
if($method==='GET'){
    $allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);
    $itemId=trim((string)($_GET['itemId']??''));
    $warehouseId=trim((string)($_GET['warehouseId']??''));
    $dateFrom=trim((string)($_GET['dateFrom']??''));
    $dateTo=trim((string)($_GET['dateTo']??''));
    $search=trim((string)($_GET['search']??''));
    $validDate=fn($value)=>$value===''||preg_match('/^\d{4}-\d{2}-\d{2}$/',$value);
    if(!$validDate($dateFrom)||!$validDate($dateTo)||($dateFrom!==''&&$dateTo!==''&&$dateFrom>$dateTo))respondError('Periode mutasi tidak valid',422);
    if($warehouseId!==''){$warehouseAccess=$pdo->prepare("SELECT branch_id FROM warehouses WHERE id=? AND is_active=1");$warehouseAccess->execute([$warehouseId]);$warehouseBranch=$warehouseAccess->fetchColumn();if($warehouseBranch===false||!isset($allowed[(string)$warehouseBranch]))respondError('Gudang tidak ditemukan atau tidak dapat diakses',403);}
    if(($_GET['reconcile']??'')==='1'){
        $warehouseRows=$pdo->query("SELECT id,branch_id,name FROM warehouses WHERE is_active=1")->fetchAll();
        $warehouseMap=[];foreach($warehouseRows as $warehouse)if(isset($allowed[(string)$warehouse['branch_id']]))$warehouseMap[(string)$warehouse['id']]=$warehouse;
        $actual=[];$stockRows=$pdo->query("SELECT warehouse_id,item_id,quantity FROM warehouse_stocks")->fetchAll();
        foreach($stockRows as $stock)if(isset($warehouseMap[(string)$stock['warehouse_id']]))$actual[(string)$stock['warehouse_id'].'|'.(string)$stock['item_id']]=(int)$stock['quantity'];
        $ledger=[];$movementRows=$pdo->query("SELECT item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type FROM stock_movements ORDER BY movement_sequence")->fetchAll();
        foreach($movementRows as $movement){$qty=(int)$movement['quantity'];$type=(string)$movement['movement_type'];$source=(string)($movement['source_warehouse_id']??'');$destination=(string)($movement['destination_warehouse_id']??'');$item=(string)$movement['item_id'];
            if($destination!==''&&isset($warehouseMap[$destination])&&$type!=='transfer_send'){$key=$destination.'|'.$item;$ledger[$key]=($ledger[$key]??0)+$qty;}
            if($source!==''&&isset($warehouseMap[$source])&&$type!=='transfer_receive'){$key=$source.'|'.$item;$ledger[$key]=($ledger[$key]??0)-$qty;}
        }
        $keys=array_unique(array_merge(array_keys($actual),array_keys($ledger)));$itemIds=array_values(array_unique(array_map(fn($key)=>explode('|',$key,2)[1],$keys)));$itemNames=[];
        if($itemIds){$placeholders=implode(',',array_fill(0,count($itemIds),'?'));$itemStmt=$pdo->prepare("SELECT id,code,name FROM items WHERE id IN ($placeholders)");$itemStmt->execute($itemIds);foreach($itemStmt->fetchAll() as $item)$itemNames[(string)$item['id']]=$item;}
        $differences=[];foreach($keys as $key){[$wid,$iid]=explode('|',$key,2);$balance=(int)($actual[$key]??0);$ledgerBalance=(int)($ledger[$key]??0);if($balance===$ledgerBalance)continue;$item=$itemNames[$iid]??[];$differences[]=['warehouseId'=>$wid,'warehouseName'=>$warehouseMap[$wid]['name']??$wid,'itemId'=>$iid,'itemCode'=>$item['code']??'','itemName'=>$item['name']??$iid,'balanceQuantity'=>$balance,'ledgerQuantity'=>$ledgerBalance,'difference'=>$balance-$ledgerBalance];}
        respondSuccess(['checked'=>count($keys),'differences'=>$differences,'isBalanced'=>count($differences)===0]);
    }

    $sql="SELECT m.*,i.name item_name,sw.name source_name,sw.branch_id source_branch_id,dw.name destination_name,dw.branch_id destination_branch_id
          FROM stock_movements m
          JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci
          LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id
          LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id";
    $params=[];
    if($itemId!==''){$sql.=" WHERE m.item_id=?";$params[]=$itemId;}
    else{$sql.=" ORDER BY COALESCE(m.occurred_at,m.created_at) DESC,m.movement_sequence DESC LIMIT 200";}
    if($itemId!=='')$sql.=" ORDER BY COALESCE(m.occurred_at,m.created_at) DESC,m.movement_sequence DESC";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);$allRows=$stmt->fetchAll();
    $isAllowed=fn($row)=>(!empty($row['source_branch_id'])&&isset($allowed[(string)$row['source_branch_id']]))||(!empty($row['destination_branch_id'])&&isset($allowed[(string)$row['destination_branch_id']]));
    $allRows=array_values(array_filter($allRows,$isAllowed));

    $runningBalance=0;
    if($itemId!==''){
        if($warehouseId!==''){$balanceStmt=$pdo->prepare("SELECT COALESCE(quantity,0) FROM warehouse_stocks WHERE item_id=? AND warehouse_id=?");$balanceStmt->execute([$itemId,$warehouseId]);}
        else{$balanceStmt=$pdo->prepare("SELECT COALESCE(SUM(ws.quantity),0) FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id WHERE ws.item_id=? AND w.branch_id IN (".implode(',',array_fill(0,max(1,count($allowed)),'?')).")");$balanceParams=array_merge([$itemId],count($allowed)?array_keys($allowed):['__none__']);$balanceStmt->execute($balanceParams);}
        $runningBalance=(int)$balanceStmt->fetchColumn();
    }
    $rows=[];$needle=strtolower($search);
    foreach($allRows as $row){
        $sourceAllowed=!empty($row['source_branch_id'])&&isset($allowed[(string)$row['source_branch_id']]);
        $destinationAllowed=!empty($row['destination_branch_id'])&&isset($allowed[(string)$row['destination_branch_id']]);
        if($warehouseId!==''){
            $incoming=(string)$row['destination_warehouse_id']===$warehouseId&&$row['movement_type']!=='transfer_send'?(int)$row['quantity']:0;
            $outgoing=(string)$row['source_warehouse_id']===$warehouseId&&$row['movement_type']!=='transfer_receive'?(int)$row['quantity']:0;
        }else{
            $incoming=$destinationAllowed&&$row['movement_type']!=='transfer_send'?(int)$row['quantity']:0;
            $outgoing=$sourceAllowed&&$row['movement_type']!=='transfer_receive'?(int)$row['quantity']:0;
        }
        if($warehouseId!==''&&$incoming===0&&$outgoing===0)continue;
        $effectiveAt=(string)($row['occurred_at']??$row['created_at']);$rowDate=substr($effectiveAt,0,10);$searchable=strtolower(implode(' ',[$row['movement_type'],$row['notes'],$row['source_name'],$row['destination_name']]));
        $row['running_balance']=$runningBalance;$runningBalance-=$incoming-$outgoing;
        if(($dateFrom!==''&&$rowDate<$dateFrom)||($dateTo!==''&&$rowDate>$dateTo)||($needle!==''&&!str_contains($searchable,$needle)))continue;
        $row['incoming']=$incoming;$row['outgoing']=$outgoing;$rows[]=$row;
    }
    foreach($rows as &$r){$r['itemId']=$r['item_id'];$r['itemName']=$r['item_name'];$r['sourceWarehouseId']=$r['source_warehouse_id'];$r['sourceName']=$r['source_name'];$r['destinationWarehouseId']=$r['destination_warehouse_id'];$r['destinationName']=$r['destination_name'];$r['movementType']=$r['movement_type'];$r['referenceType']=$r['reference_type']??null;$r['referenceId']=$r['reference_id']??null;$r['referenceNumber']=$r['reference_number']??null;$r['movementSequence']=(int)($r['movement_sequence']??0);$r['reversalOfId']=$r['reversal_of_id']??null;$r['correctionGroupId']=$r['correction_group_id']??null;$r['unitCost']=$r['unit_cost']!==null?(float)$r['unit_cost']:null;$r['quantity']=(int)$r['quantity'];$r['occurredAt']=$r['occurred_at']??$r['created_at'];$r['recordedAt']=$r['created_at'];$r['createdAt']=$r['occurred_at']??$r['created_at'];$r['incoming']=(int)$r['incoming'];$r['outgoing']=(int)$r['outgoing'];$r['balance']=(int)$r['running_balance'];}
    respondSuccess($rows);
}
if($method!=='POST')respondError('Method not allowed',405);
$d=getInput();
if(($d['action']??'')==='opening_balance_import'){
    $roleStmt=$pdo->prepare("SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1");$roleStmt->execute([$actor['role_id']??'']);$role=$roleStmt->fetch();
    $isAdmin=!empty($actor['is_owner'])||strtoupper((string)($role['code']??''))==='ADM'||strtolower((string)($role['name']??''))==='administrator';
    if(!$isAdmin)respondError('Import saldo awal hanya tersedia untuk Owner dan Administrator',403);
    $rows=is_array($d['rows']??null)?$d['rows']:[];$date=(string)($d['date']??date('Y-m-d'));$batchKey=preg_replace('/[^A-Z0-9_-]/','',strtoupper((string)($d['batchKey']??'')));
    if(!$rows||count($rows)>5000||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)||strlen($batchKey)<8)respondError('Data import saldo awal tidak valid',422);
    $marker='OPENING_BALANCE:'.$batchKey;
    $duplicate=$pdo->prepare("SELECT COUNT(*) FROM stock_movements WHERE notes LIKE ?");$duplicate->execute([$marker.'%']);if((int)$duplicate->fetchColumn()>0)respondError('File/batch saldo awal ini sudah pernah diimport',409);
    $warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id=?");$itemStmt=$pdo->prepare("SELECT id,code,name,type,is_active FROM items WHERE id=?");
    $pdo->beginTransaction();
    try{
        $created=0;
        foreach($rows as $index=>$row){$itemId=(string)($row['itemId']??'');$warehouseId=(string)($row['warehouseId']??'');$quantity=(int)($row['quantity']??0);if($quantity===0)continue;
            $warehouseStmt->execute([$warehouseId]);$warehouse=$warehouseStmt->fetch();if(!$warehouse||!(bool)$warehouse['is_active'])throw new InvalidArgumentException('Gudang baris '.($index+1).' tidak valid');requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);
            $itemStmt->execute([$itemId]);$item=$itemStmt->fetch();if(!$item||$item['type']!=='Persediaan'||!(bool)$item['is_active'])throw new InvalidArgumentException('Barang baris '.($index+1).' tidak valid atau bukan persediaan aktif');
            adjustWarehouseStockAllowNegative($pdo,$warehouseId,(string)$warehouse['branch_id'],$itemId,$quantity);
            $mid='MOV-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);$notes=$marker.' Saldo awal '.$item['code'];
            $pdo->prepare("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_by,created_at) VALUES(?,?,NULL,?,?,'adjustment',?,?,CONCAT(?,' 00:00:00'))")->execute([$mid,$itemId,$warehouseId,$quantity,$notes,$actor['id'],$date]);$created++;
        }
        if($created===0)throw new InvalidArgumentException('Tidak ada kuantitas saldo awal yang dapat diproses');
        $pdo->commit();respondSuccess(['batchKey'=>$batchKey,'created'=>$created],'Saldo awal stok berhasil diimport');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}
$qty=(int)($d['quantity']??0);$source=$d['sourceWarehouseId']??'';$destination=$d['destinationWarehouseId']??'';
if($qty<=0||!$source||!$destination||$source===$destination)respondError('Data mutasi tidak valid',422);
$warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id IN (?,?)");$warehouseStmt->execute([$source,$destination]);$warehouseRows=$warehouseStmt->fetchAll();
if(count($warehouseRows)!==2)respondError('Gudang sumber atau tujuan tidak ditemukan',422);
$warehouseMap=[];foreach($warehouseRows as $warehouse){if(!(bool)$warehouse['is_active'])respondError('Gudang sumber atau tujuan sudah nonaktif',422);$warehouseMap[$warehouse['id']]=$warehouse;requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);}
$itemStmt=$pdo->prepare("SELECT type,is_active FROM items WHERE id=?");$itemStmt->execute([$d['itemId']??'']);$item=$itemStmt->fetch();if(!$item||$item['type']!=='Persediaan'||!(bool)$item['is_active'])respondError('Barang persediaan tidak ditemukan atau nonaktif',422);
$pdo->beginTransaction();
try{
    $stmt=$pdo->prepare("SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE");$stmt->execute([$source,$d['itemId']]);$available=(int)($stmt->fetchColumn()?:0);
    if($available<$qty)throw new Exception("Stok sumber tidak mencukupi (tersedia {$available})");
    $sourceBranch=(string)$warehouseMap[$source]['branch_id'];$destinationBranch=(string)$warehouseMap[$destination]['branch_id'];
    adjustWarehouseStockAllowNegative($pdo,$source,$sourceBranch,(string)$d['itemId'],-$qty);
    adjustWarehouseStockAllowNegative($pdo,$destination,$destinationBranch,(string)$d['itemId'],$qty);
    $mid=recordStockMovement($pdo,(string)$d['itemId'],$source,$destination,$qty,'transfer','manual_transfer',null,null,(string)($d['notes']??''),(string)$actor['id']);
    $pdo->commit();respondSuccess(['id'=>$mid],'Mutasi stok berhasil');
}catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
