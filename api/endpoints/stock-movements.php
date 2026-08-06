<?php
$actor=requireAuthenticatedUser($pdo);
if($method==='GET'){
    $allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);
    $rows=array_values(array_filter($pdo->query("SELECT m.*,i.name item_name,sw.name source_name,sw.branch_id source_branch_id,dw.name destination_name,dw.branch_id destination_branch_id FROM stock_movements m JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id ORDER BY m.created_at DESC LIMIT 200")->fetchAll(),fn($row)=>isset($allowed[(string)$row['source_branch_id']])&&isset($allowed[(string)$row['destination_branch_id']])));
    foreach($rows as &$r){$r['itemId']=$r['item_id'];$r['itemName']=$r['item_name'];$r['sourceWarehouseId']=$r['source_warehouse_id'];$r['sourceName']=$r['source_name'];$r['destinationWarehouseId']=$r['destination_warehouse_id'];$r['destinationName']=$r['destination_name'];$r['movementType']=$r['movement_type'];$r['createdAt']=$r['created_at'];}
    respondSuccess($rows);
}
if($method!=='POST')respondError('Method not allowed',405);
$d=getInput();$qty=(int)($d['quantity']??0);$source=$d['sourceWarehouseId']??'';$destination=$d['destinationWarehouseId']??'';
if($qty<=0||!$source||!$destination||$source===$destination)respondError('Data mutasi tidak valid',422);
$warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id IN (?,?)");$warehouseStmt->execute([$source,$destination]);$warehouseRows=$warehouseStmt->fetchAll();
if(count($warehouseRows)!==2)respondError('Gudang sumber atau tujuan tidak ditemukan',422);
$warehouseMap=[];foreach($warehouseRows as $warehouse){if(!(bool)$warehouse['is_active'])respondError('Gudang sumber atau tujuan sudah nonaktif',422);$warehouseMap[$warehouse['id']]=$warehouse;requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);}
$itemStmt=$pdo->prepare("SELECT type,is_active FROM items WHERE id=?");$itemStmt->execute([$d['itemId']??'']);$item=$itemStmt->fetch();if(!$item||$item['type']!=='Persediaan'||!(bool)$item['is_active'])respondError('Barang persediaan tidak ditemukan atau nonaktif',422);
$pdo->beginTransaction();
try{
    $stmt=$pdo->prepare("SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE");$stmt->execute([$source,$d['itemId']]);$available=(int)($stmt->fetchColumn()?:0);
    if($available<$qty)throw new Exception("Stok sumber tidak mencukupi (tersedia {$available})");
    $pdo->prepare("UPDATE warehouse_stocks SET quantity=quantity-? WHERE warehouse_id=? AND item_id=?")->execute([$qty,$source,$d['itemId']]);
    $pdo->prepare("INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)")->execute([$destination,$d['itemId'],$qty]);
    $sourceBranch=(string)$warehouseMap[$source]['branch_id'];$destinationBranch=(string)$warehouseMap[$destination]['branch_id'];
    if($sourceBranch!==$destinationBranch){
        $branchQtyStmt=$pdo->prepare("SELECT COALESCE(SUM(ws.quantity),0) FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id WHERE w.branch_id=? AND ws.item_id=?");
        $branchUpsert=$pdo->prepare("INSERT INTO branch_item_stocks(branch_id,item_id,stock,sellable_stock) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE stock=VALUES(stock),sellable_stock=VALUES(sellable_stock)");
        foreach([$sourceBranch,$destinationBranch] as $branchId){$branchQtyStmt->execute([$branchId,$d['itemId']]);$branchQty=(int)$branchQtyStmt->fetchColumn();$branchUpsert->execute([$branchId,$d['itemId'],$branchQty,$branchQty]);}
    }
    $mid='MOV-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(3)),0,6);
    $pdo->prepare("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_by) VALUES(?,?,?,?,?,'transfer',?,?)")
        ->execute([$mid,$d['itemId'],$source,$destination,$qty,$d['notes']??'',$actor['id']]);
    $pdo->commit();respondSuccess(['id'=>$mid],'Mutasi stok berhasil');
}catch(Exception $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
