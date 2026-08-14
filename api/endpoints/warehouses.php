<?php
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
$pdo->exec("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL AFTER name");
$pdo->exec("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER is_sellable");

switch ($method) {
    case 'GET':
        $allowed = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows=array_values(array_filter($pdo->query("SELECT w.*,b.name branch_name FROM warehouses w LEFT JOIN branches b ON b.id=w.branch_id COLLATE utf8mb4_unicode_ci ORDER BY b.name,w.is_default DESC,w.name")->fetchAll(),fn($row)=>isset($allowed[(string)$row['branch_id']])));
        foreach($rows as &$r){$r['branchId']=$r['branch_id'];$r['branchName']=$r['branch_name'];$r['isDefault']=(bool)$r['is_default'];$r['isSellable']=(bool)$r['is_sellable'];$r['isSystem']=(bool)$r['is_system'];$r['isActive']=(bool)$r['is_active'];}
        respondSuccess($rows);
        break;
    case 'POST':
        $d=getInput(); requireAccessibleBranch($pdo,$actor,(string)($d['branchId']??'')); $wid=$d['id']??generateId();
        if(empty($d['code'])||empty($d['name']))respondError('Kode dan nama gudang wajib diisi',422);
        $pdo->prepare("INSERT INTO warehouses(id,code,name,address,branch_id,is_default,is_sellable,is_system,is_active) VALUES(?,?,?,?,?,0,?,0,?)")
            ->execute([$wid,strtoupper(trim($d['code'])),trim($d['name']),trim($d['address']??''),$d['branchId'],$d['isSellable']??1,$d['isActive']??1]);
        respondSuccess(null,'Gudang ditambahkan'); break;
    case 'PUT':
        if(!$id)respondError('ID required'); $d=getInput();
        $current=$pdo->prepare("SELECT branch_id,is_default,is_system FROM warehouses WHERE id=?");$current->execute([$id]);$currentRow=$current->fetch();
        if(!$currentRow)respondError('Gudang tidak ditemukan',404);
        if((int)$currentRow['is_system']===1)respondError('Gudang sistem tidak dapat diubah',403);
        requireAccessibleBranch($pdo,$actor,(string)$currentRow['branch_id']);requireAccessibleBranch($pdo,$actor,(string)($d['branchId']??''));
        if((int)$currentRow['is_default']===1&&(string)$currentRow['branch_id']!==(string)$d['branchId'])respondError('Gudang utama tidak boleh dipindahkan ke cabang lain',409);
        $pdo->prepare("UPDATE warehouses SET code=?,name=?,address=?,branch_id=?,is_sellable=?,is_active=? WHERE id=?")
            ->execute([strtoupper(trim($d['code'])),trim($d['name']),trim($d['address']??''),$d['branchId'],$d['isSellable']??1,$d['isActive']??1,$id]);
        respondSuccess(null,'Gudang diperbarui'); break;
    case 'DELETE':
        if(!$id)respondError('ID required');
        $stmt=$pdo->prepare("SELECT branch_id,is_default,is_system FROM warehouses WHERE id=?");$stmt->execute([$id]);$warehouse=$stmt->fetch();
        if(!$warehouse)respondError('Gudang tidak ditemukan',404);requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);
        if($warehouse['is_default']||$warehouse['is_system'])respondError('Gudang utama/sistem tidak dapat dinonaktifkan',403);
        $pdo->prepare("UPDATE warehouses SET is_active=0 WHERE id=?")->execute([$id]);
        respondSuccess(null,'Gudang dinonaktifkan'); break;
    default: respondError('Method not allowed',405);
}
