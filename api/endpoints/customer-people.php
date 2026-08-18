<?php
$allowedRoles = ['Owner','PIC','Supir','Keuangan','Pengelola Kendaraan'];
$loadPerson = static function(PDO $pdo, string $personId): ?array {
    $stmt=$pdo->prepare("SELECT * FROM customer_people WHERE id=?");$stmt->execute([$personId]);$row=$stmt->fetch();
    if(!$row)return null;
    $roles=$pdo->prepare("SELECT role_code FROM customer_person_roles WHERE person_id=? ORDER BY role_code");$roles->execute([$personId]);
    $vehicles=$pdo->prepare("SELECT vehicle_id,assignment_role,is_primary FROM vehicle_people WHERE person_id=? ORDER BY vehicle_id,assignment_role");$vehicles->execute([$personId]);
    $row['customerId']=$row['customer_id'];$row['relationshipLabel']=$row['relationship_label'];$row['isActive']=(bool)$row['is_active'];
    $row['roles']=array_column($roles->fetchAll(),'role_code');$row['vehicleAssignments']=array_map(static fn($item)=>['vehicleId'=>$item['vehicle_id'],'role'=>$item['assignment_role'],'isPrimary'=>(bool)$item['is_primary']],$vehicles->fetchAll());
    $customer=$pdo->prepare("SELECT primary_contact_id,billing_contact_id FROM customers WHERE id=?");$customer->execute([$row['customer_id']]);$links=$customer->fetch()?:[];
    $row['isPrimaryPic']=($links['primary_contact_id']??'')===$personId;$row['isBillingContact']=($links['billing_contact_id']??'')===$personId;
    return $row;
};
$saveRelations = static function(PDO $pdo,string $personId,string $customerId,array $data) use($allowedRoles): void {
    $pdo->prepare("DELETE FROM customer_person_roles WHERE person_id=?")->execute([$personId]);
    $roleStmt=$pdo->prepare("INSERT INTO customer_person_roles(person_id,role_code) VALUES(?,?)");
    foreach(array_values(array_unique(array_map('strval',$data['roles']??[]))) as $role){if(in_array($role,$allowedRoles,true))$roleStmt->execute([$personId,$role]);}
    $pdo->prepare("DELETE FROM vehicle_people WHERE person_id=?")->execute([$personId]);
    $vehicleCheck=$pdo->prepare("SELECT COUNT(*) FROM vehicles WHERE id=? AND customer_id=?");
    $vehicleStmt=$pdo->prepare("INSERT INTO vehicle_people(vehicle_id,person_id,assignment_role,is_primary) VALUES(?,?,?,?)");
    foreach(($data['vehicleAssignments']??[]) as $assignment){$vehicleId=(string)($assignment['vehicleId']??'');$role=(string)($assignment['role']??'Supir');if(!in_array($role,['Owner','Supir'],true))continue;$vehicleCheck->execute([$vehicleId,$customerId]);if((int)$vehicleCheck->fetchColumn()>0)$vehicleStmt->execute([$vehicleId,$personId,$role,!empty($assignment['isPrimary'])?1:0]);}
    if(!empty($data['isPrimaryPic']))$pdo->prepare("UPDATE customers SET primary_contact_id=? WHERE id=?")->execute([$personId,$customerId]);
    else $pdo->prepare("UPDATE customers SET primary_contact_id=NULL WHERE id=? AND primary_contact_id=?")->execute([$customerId,$personId]);
    if(!empty($data['isBillingContact']))$pdo->prepare("UPDATE customers SET billing_contact_id=? WHERE id=?")->execute([$personId,$customerId]);
    else $pdo->prepare("UPDATE customers SET billing_contact_id=NULL WHERE id=? AND billing_contact_id=?")->execute([$customerId,$personId]);
};
$auditPerson = static function(PDO $pdo,string $entityId,string $action,$before,$after,array $actor): void {
    $pdo->prepare("INSERT INTO customer_master_audit_logs(entity_type,entity_id,action_type,before_json,after_json,user_id,user_name) VALUES('customer_person',?,?,?,?,?,?)")
        ->execute([$entityId,$action,$before?json_encode($before,JSON_UNESCAPED_UNICODE):null,$after?json_encode($after,JSON_UNESCAPED_UNICODE):null,$actor['id']??null,$actor['name']??null]);
};

switch($method){
case 'GET':
    $actor=requireUserPermission($pdo,'customer:view');$customerId=(string)($id??($_GET['customerId']??''));
    $where='';$params=[];if($customerId!==''){$where=' WHERE customer_id=?';$params[]=$customerId;}
    $stmt=$pdo->prepare("SELECT id FROM customer_people{$where} ORDER BY name");$stmt->execute($params);
    $rows=[];foreach($stmt->fetchAll() as $personRow){$loaded=$loadPerson($pdo,(string)$personRow['id']);if($loaded)$rows[]=$loaded;}
    respondSuccess($rows);break;
case 'POST':
    $actor=requireUserPermission($pdo,'customer:edit');$d=getInput();$customerId=(string)($d['customerId']??'');
    $customerStmt=$pdo->prepare("SELECT id FROM customers WHERE id=?");$customerStmt->execute([$customerId]);$customer=$customerStmt->fetch();if(!$customer)respondError('Akun pelanggan tidak ditemukan',404);
    $name=trim((string)($d['name']??''));if($name==='')respondError('Nama kontak wajib diisi',422);$personId=(string)($d['id']??generateId());
    $pdo->beginTransaction();try{$pdo->prepare("INSERT INTO customer_people(id,customer_id,name,phone,email,relationship_label,is_active) VALUES(?,?,?,?,?,?,?)")->execute([$personId,$customerId,$name,trim((string)($d['phone']??'')),trim((string)($d['email']??'')),trim((string)($d['relationshipLabel']??'')),array_key_exists('isActive',$d)?(!empty($d['isActive'])?1:0):1]);$saveRelations($pdo,$personId,$customerId,$d);$after=$loadPerson($pdo,$personId);$auditPerson($pdo,$personId,'create',null,$after,$actor);$pdo->commit();respondSuccess($after,'Kontak ditambahkan');}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}break;
case 'PUT':
    if(!$id)respondError('ID required',422);$actor=requireUserPermission($pdo,'customer:edit');$d=getInput();$before=$loadPerson($pdo,(string)$id);if(!$before)respondError('Kontak tidak ditemukan',404);$name=trim((string)($d['name']??''));if($name==='')respondError('Nama kontak wajib diisi',422);
    $pdo->beginTransaction();try{$pdo->prepare("UPDATE customer_people SET name=?,phone=?,email=?,relationship_label=?,is_active=? WHERE id=?")->execute([$name,trim((string)($d['phone']??'')),trim((string)($d['email']??'')),trim((string)($d['relationshipLabel']??'')),!empty($d['isActive'])?1:0,$id]);$saveRelations($pdo,(string)$id,(string)$before['customerId'],$d);$after=$loadPerson($pdo,(string)$id);$auditPerson($pdo,(string)$id,'update',$before,$after,$actor);$pdo->commit();respondSuccess($after,'Kontak diperbarui');}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}break;
case 'DELETE':
    if(!$id)respondError('ID required',422);$actor=requireUserPermission($pdo,'customer:edit');$before=$loadPerson($pdo,(string)$id);if(!$before)respondError('Kontak tidak ditemukan',404);$used=$pdo->prepare("SELECT COUNT(*) FROM work_orders WHERE driver_contact_id=? OR approval_contact_id=? OR billing_contact_id=?");$used->execute([$id,$id,$id]);if((int)$used->fetchColumn()>0)respondError('Kontak sudah digunakan pada WO. Nonaktifkan kontak agar histori tetap tersimpan.',409);$pdo->beginTransaction();try{$pdo->prepare("UPDATE customers SET primary_contact_id=NULL WHERE primary_contact_id=?")->execute([$id]);$pdo->prepare("UPDATE customers SET billing_contact_id=NULL WHERE billing_contact_id=?")->execute([$id]);$pdo->prepare("DELETE FROM vehicle_people WHERE person_id=?")->execute([$id]);$pdo->prepare("DELETE FROM customer_person_roles WHERE person_id=?")->execute([$id]);$pdo->prepare("DELETE FROM customer_people WHERE id=?")->execute([$id]);$auditPerson($pdo,(string)$id,'delete',$before,null,$actor);$pdo->commit();respondSuccess(null,'Kontak dihapus');}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}break;
default:respondError('Method not allowed',405);
}
