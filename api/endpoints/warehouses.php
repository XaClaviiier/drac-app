<?php
requireAuthenticatedUser($pdo);

switch ($method) {
    case 'GET':
        $rows=$pdo->query("SELECT w.*,b.name branch_name FROM warehouses w LEFT JOIN branches b ON b.id=w.branch_id ORDER BY b.name,w.is_default DESC,w.name")->fetchAll();
        foreach($rows as &$r){$r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['isDefault']=(bool)$r['is_default'];$r['isSellable']=(bool)$r['is_sellable'];$r['isActive']=(bool)$r['is_active'];}
        respondSuccess($rows);
        break;
    case 'POST':
        requireOwner($pdo); $d=getInput(); $wid=$d['id']??generateId();
        $pdo->prepare("INSERT INTO warehouses(id,code,name,branch_id,is_default,is_sellable,is_active) VALUES(?,?,?,?,0,?,?)")
            ->execute([$wid,$d['code'],$d['name'],$d['branchId'],$d['isSellable']??1,$d['isActive']??1]);
        respondSuccess(null,'Gudang ditambahkan'); break;
    case 'PUT':
        requireOwner($pdo); if(!$id)respondError('ID required'); $d=getInput();
        $pdo->prepare("UPDATE warehouses SET code=?,name=?,branch_id=?,is_sellable=?,is_active=? WHERE id=?")
            ->execute([$d['code'],$d['name'],$d['branchId'],$d['isSellable']??1,$d['isActive']??1,$id]);
        respondSuccess(null,'Gudang diperbarui'); break;
    case 'DELETE':
        requireOwner($pdo); if(!$id)respondError('ID required');
        $stmt=$pdo->prepare("SELECT is_default FROM warehouses WHERE id=?");$stmt->execute([$id]);
        if($stmt->fetchColumn())respondError('Gudang utama tidak dapat dihapus',403);
        $pdo->prepare("UPDATE warehouses SET is_active=0 WHERE id=?")->execute([$id]);
        respondSuccess(null,'Gudang dinonaktifkan'); break;
    default: respondError('Method not allowed',405);
}
