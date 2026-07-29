<?php
$actor=requireAuthenticatedUser($pdo);
if($method==='GET'){
    $rows=$pdo->query("SELECT m.*,i.name item_name,sw.name source_name,dw.name destination_name FROM stock_movements m JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id ORDER BY m.created_at DESC LIMIT 200")->fetchAll();
    foreach($rows as &$r){$r['itemId']=$r['item_id'];$r['itemName']=$r['item_name'];$r['sourceWarehouseId']=$r['source_warehouse_id'];$r['sourceName']=$r['source_name'];$r['destinationWarehouseId']=$r['destination_warehouse_id'];$r['destinationName']=$r['destination_name'];$r['movementType']=$r['movement_type'];$r['createdAt']=$r['created_at'];}
    respondSuccess($rows);
}
if($method!=='POST')respondError('Method not allowed',405);
$d=getInput();$qty=(int)($d['quantity']??0);$source=$d['sourceWarehouseId']??'';$destination=$d['destinationWarehouseId']??'';
if($qty<=0||!$source||!$destination||$source===$destination)respondError('Data mutasi tidak valid',422);
$pdo->beginTransaction();
try{
    $stmt=$pdo->prepare("SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE");$stmt->execute([$source,$d['itemId']]);$available=(int)($stmt->fetchColumn()?:0);
    if($available<$qty)throw new Exception("Stok sumber tidak mencukupi (tersedia {$available})");
    $pdo->prepare("UPDATE warehouse_stocks SET quantity=quantity-? WHERE warehouse_id=? AND item_id=?")->execute([$qty,$source,$d['itemId']]);
    $pdo->prepare("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)")->execute([$destination,$d['itemId'],$qty]);
    $mid='MOV-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(3)),0,6);
    $pdo->prepare("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_by) VALUES(?,?,?,?,?,'transfer',?,?)")
        ->execute([$mid,$d['itemId'],$source,$destination,$qty,$d['notes']??'',$actor['id']]);
    $pdo->commit();respondSuccess(['id'=>$mid],'Mutasi stok berhasil');
}catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
