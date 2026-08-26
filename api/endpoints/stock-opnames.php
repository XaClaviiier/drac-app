<?php
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
$hasOpnamePermission=static function(PDO $pdo,array $actor,string $permission,string $fallback):bool{
    return !empty($actor['is_owner'])||authenticatedUserHasPermission($pdo,$actor,$permission)||authenticatedUserHasPermission($pdo,$actor,$fallback);
};
$loadCategoryUsage=static function(PDO $pdo):array{
    $usage=[];
    $rows=$pdo->query("SELECT COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori') category_name,
        COALESCE(SUM(ABS(d.qty)),0) usage_count
        FROM sales_invoice_items d JOIN items i ON i.id=d.item_id COLLATE utf8mb4_unicode_ci
        WHERE i.type='Persediaan'
        GROUP BY COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori')")->fetchAll();
    foreach($rows as $row)$usage[(string)$row['category_name']]=(int)$row['usage_count'];
    return $usage;
};
$sortByCategoryUsage=static function(array &$rows,array $usage):void{
    usort($rows,static function(array $left,array $right)use($usage):int{
        $leftCategory=(string)(($left['category_name']??'')?:'Tanpa Kategori');
        $rightCategory=(string)(($right['category_name']??'')?:'Tanpa Kategori');
        return (($usage[$rightCategory]??0)<=>($usage[$leftCategory]??0))
            ?:strcasecmp($leftCategory,$rightCategory)
            ?:strcasecmp((string)($left['item_name']??$left['name']??''),(string)($right['item_name']??$right['name']??''))
            ?:strcasecmp((string)($left['item_code']??$left['code']??''),(string)($right['item_code']??$right['code']??''));
    });
};

$loadOrder = static function(PDO $pdo, string $id): ?array {
    $stmt=$pdo->prepare("SELECT o.*,w.code warehouse_code,w.name warehouse_name,b.name branch_name,
        r.id result_id,r.result_number,r.result_date,r.status result_status,r.adjustment_id,r.adjustment_number,r.notes result_notes
        FROM stock_count_orders o
        JOIN warehouses w ON w.id=o.warehouse_id
        JOIN branches b ON b.id=o.branch_id
        LEFT JOIN stock_count_results r ON r.order_id=o.id
        WHERE o.id=? LIMIT 1");
    $stmt->execute([$id]); return $stmt->fetch() ?: null;
};
$mapOrder = static function(array $row): array {
    return [
        'id'=>(string)$row['id'],'orderNumber'=>(string)$row['order_number'],'orderDate'=>(string)$row['order_date'],
        'startDate'=>(string)$row['start_date'],'warehouseId'=>(string)$row['warehouse_id'],'warehouseCode'=>(string)$row['warehouse_code'],
        'warehouseName'=>(string)$row['warehouse_name'],'branchId'=>(string)$row['branch_id'],'branchName'=>(string)$row['branch_name'],
        'categoryId'=>$row['category_id'] ?: null,'assignedUserId'=>(string)$row['assigned_user_id'],'assignedUserName'=>(string)$row['assigned_user_name'],
        'status'=>(string)$row['status'],'notes'=>(string)($row['notes']??''),'createdAt'=>(string)$row['created_at'],
        'result'=>$row['result_id'] ? ['id'=>(string)$row['result_id'],'resultNumber'=>(string)$row['result_number'],'date'=>(string)$row['result_date'],
            'status'=>(string)$row['result_status'],'adjustmentId'=>$row['adjustment_id']?:null,'adjustmentNumber'=>$row['adjustment_number']?:null,'notes'=>(string)($row['result_notes']??'')] : null,
    ];
};
$orderRows = static function(PDO $pdo, string $resultId) use ($loadCategoryUsage,$sortByCategoryUsage): array {
    $stmt=$pdo->prepare("SELECT * FROM stock_count_result_items WHERE result_id=?");
    $stmt->execute([$resultId]);
    $storedRows=$stmt->fetchAll();$usage=$loadCategoryUsage($pdo);$sortByCategoryUsage($storedRows,$usage);
    return array_map(static fn($row)=>[
        'id'=>(int)$row['id'],'itemId'=>(string)$row['item_id'],'code'=>(string)$row['item_code'],'name'=>(string)$row['item_name'],
        'categoryName'=>(string)($row['category_name']?:'Tanpa Kategori'),'categoryUsageCount'=>(int)($usage[(string)($row['category_name']?:'Tanpa Kategori')]??0),'unit'=>(string)$row['unit'],'systemQuantity'=>(int)$row['system_quantity'],
        'count1'=>$row['count_1']===null?null:(int)$row['count_1'],'count2'=>$row['count_2']===null?null:(int)$row['count_2'],
        'finalQuantity'=>$row['final_quantity']===null?null:(int)$row['final_quantity'],'variance'=>$row['variance']===null?null:(int)$row['variance'],
    ],$storedRows);
};

if($method==='GET') {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:view','item:view'))respondError('Akun tidak memiliki izin melihat Stok Opname',403);
    if($id) {
        $row=$loadOrder($pdo,$id); if(!$row)respondError('Perintah Stok Opname tidak ditemukan',404);
        requireAccessibleBranch($pdo,$actor,(string)$row['branch_id']); $payload=$mapOrder($row);
        if($row['result_id'])$payload['rows']=$orderRows($pdo,(string)$row['result_id']); else $payload['rows']=[];
        respondSuccess($payload);
    }
    $rows=$pdo->query("SELECT o.*,w.code warehouse_code,w.name warehouse_name,b.name branch_name,
        r.id result_id,r.result_number,r.result_date,r.status result_status,r.adjustment_id,r.adjustment_number,r.notes result_notes
        FROM stock_count_orders o JOIN warehouses w ON w.id=o.warehouse_id JOIN branches b ON b.id=o.branch_id
        LEFT JOIN stock_count_results r ON r.order_id=o.id ORDER BY o.start_date DESC,o.created_at DESC LIMIT 250")->fetchAll();
    $visible=[]; foreach($rows as $row){try{requireAccessibleBranch($pdo,$actor,(string)$row['branch_id']);$visible[]=$mapOrder($row);}catch(Throwable $ignored){}}
    respondSuccess($visible);
}

$d=getInput();
if($method==='POST') {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:create','item:create'))respondError('Akun tidak memiliki izin membuat Perintah Stok Opname',403);
    $startDate=trim((string)($d['startDate']??'')); $warehouseId=trim((string)($d['warehouseId']??'')); $assignedId=trim((string)($d['assignedUserId']??''));
    if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$startDate)||$startDate<date('Y-m-d'))respondError('Tanggal mulai tidak boleh mundur',422);
    $warehouseStmt=$pdo->prepare("SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=1 AND is_system=0");$warehouseStmt->execute([$warehouseId]);$warehouse=$warehouseStmt->fetch();if(!$warehouse)respondError('Gudang tidak valid',422);
    requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);
    $userStmt=$pdo->prepare("SELECT id,name,username,is_active,is_owner,branch_id FROM users WHERE id=?");$userStmt->execute([$assignedId]);$assigned=$userStmt->fetch();if(!$assigned||!(bool)$assigned['is_active'])respondError('Petugas stok opname tidak valid',422);
    if(empty($assigned['is_owner']) && (string)$assigned['branch_id'] !== (string)$warehouse['branch_id']) {
        $access=$pdo->prepare("SELECT COUNT(*) FROM user_branch_access WHERE user_id=? AND branch_id=?");$access->execute([$assignedId,$warehouse['branch_id']]);
        if(!(int)$access->fetchColumn())respondError('Petugas tidak memiliki akses ke cabang gudang',422);
    }
    $pdo->beginTransaction();try{
        $period=date('ym',strtotime($startDate));$seq=$pdo->prepare("SELECT order_number FROM stock_count_orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['SO-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;
        $number='SO-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$newId='SC-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
        $pdo->prepare("INSERT INTO stock_count_orders(id,order_number,order_date,start_date,warehouse_id,branch_id,category_id,assigned_user_id,assigned_user_name,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            ->execute([$newId,$number,date('Y-m-d'),$startDate,$warehouseId,$warehouse['branch_id'],($d['categoryId']??'')?:null,$assignedId,$assigned['name']?:$assigned['username'],trim((string)($d['notes']??'')),$actor['id']]);
        $pdo->commit();respondSuccess(['id'=>$newId,'orderNumber'=>$number,'status'=>'Menunggu Eksekusi'],'Perintah Stok Opname disimpan');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}

if($method==='PUT'&&$id) {
    $action=(string)($d['action']??''); if(!in_array($action,['start','save-result','post-result'],true))respondError('Aksi Stok Opname tidak valid',422);
    if($action==='post-result'&&!$hasOpnamePermission($pdo,$actor,'stock_opname:post','__no_fallback__'))respondError('Posting hasil hanya boleh dilakukan Owner atau Supervisor yang diberi izin Posting Stok Opname',403);
    if($action!=='post-result'&&!$hasOpnamePermission($pdo,$actor,'stock_opname:count','item:view'))respondError('Akun tidak memiliki izin melakukan penghitungan stok',403);
    $pdo->beginTransaction();try{
        $row=$loadOrder($pdo,$id);if(!$row)throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');requireAccessibleBranch($pdo,$actor,(string)$row['branch_id']);
        if($action==='start') {
            if($row['status']!=='Menunggu Eksekusi'||$row['result_id'])throw new InvalidArgumentException('Perintah sudah mulai dihitung');
            if($row['start_date']>date('Y-m-d'))throw new InvalidArgumentException('Hasil belum dapat dibuat sebelum Tanggal Mulai');
            if((string)$row['assigned_user_id']!==(string)$actor['id']&&empty($actor['is_owner']))throw new InvalidArgumentException('Hanya petugas yang ditunjuk atau Owner dapat memulai penghitungan');
            $period=date('ym');$seq=$pdo->prepare("SELECT result_number FROM stock_count_results WHERE result_number LIKE ? ORDER BY result_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['HSO-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;$resultNumber='HSO-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$resultId='SCR-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
            $pdo->prepare("INSERT INTO stock_count_results(id,result_number,order_id,result_date,status,created_by) VALUES(?,?,?,?, 'Draft',?)")->execute([$resultId,$resultNumber,$id,date('Y-m-d'),$actor['id']]);
            $sql="SELECT i.id,i.code,i.name,i.category_name,i.unit,COALESCE(s.quantity,0) system_qty,COALESCE(s.stock_version,0) system_version FROM items i LEFT JOIN warehouse_stocks s ON s.item_id=i.id COLLATE utf8mb4_unicode_ci AND s.warehouse_id=? WHERE i.type='Persediaan' AND i.is_active=1";
            $params=[$row['warehouse_id']];if($row['category_id']){$sql.=" AND i.category_id=?";$params[]=$row['category_id'];}$items=$pdo->prepare($sql);$items->execute($params);$itemRows=$items->fetchAll();$sortByCategoryUsage($itemRows,$loadCategoryUsage($pdo));$insert=$pdo->prepare("INSERT INTO stock_count_result_items(result_id,item_id,item_code,item_name,category_name,unit,system_quantity,system_version) VALUES(?,?,?,?,?,?,?,?)");$count=0;foreach($itemRows as$item){$insert->execute([$resultId,$item['id'],$item['code'],$item['name'],$item['category_name']?:'Tanpa Kategori',$item['unit']??'',(int)$item['system_qty'],(int)$item['system_version']]);$count++;}if(!$count)throw new InvalidArgumentException('Tidak ada barang untuk dihitung');
            $pdo->prepare("UPDATE stock_count_orders SET status='Dalam Penghitungan' WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(['resultId'=>$resultId,'resultNumber'=>$resultNumber],'Hasil Stok Opname dibuat');
        }
        if(!$row['result_id']||$row['result_status']!=='Draft')throw new InvalidArgumentException('Hasil Stok Opname tidak dapat diubah');
        if($action==='save-result'&&(string)$row['assigned_user_id']!==(string)$actor['id']&&empty($actor['is_owner'])&&!authenticatedUserHasPermission($pdo,$actor,'stock_opname:post'))throw new InvalidArgumentException('Hanya petugas yang ditunjuk atau Supervisor dapat menyimpan hasil penghitungan');
        $inputRows=is_array($d['rows']??null)?$d['rows']:[];
        $byId=[];foreach($inputRows as $input)$byId[(int)($input['id']??0)]=$input;
        $stored=$pdo->prepare("SELECT * FROM stock_count_result_items WHERE result_id=? FOR UPDATE");$stored->execute([$row['result_id']]);$storedRows=$stored->fetchAll();
        $update=$pdo->prepare("UPDATE stock_count_result_items SET count_1=?,count_2=?,final_quantity=?,variance=? WHERE id=? AND result_id=?");
        $complete=true;$differences=[];
        foreach($storedRows as $item){
            $input=$byId[(int)$item['id']]??[];
            $c1=($input['count1']??'')===''?null:(int)$input['count1'];
            $c2=($input['count2']??'')===''?null:(int)$input['count2'];
            if($c1===null)$complete=false;
            $final=$c2??$c1;
            $variance=$final===null?null:$final-(int)$item['system_quantity'];
            $update->execute([$c1,$c2,$final,$variance,$item['id'],$row['result_id']]);
            if($variance!==null&&$variance!==0)$differences[]=['item'=>$item,'variance'=>$variance];
        }
        if($action==='save-result'){$pdo->prepare("UPDATE stock_count_results SET notes=? WHERE id=?")->execute([trim((string)($d['notes']??'')),$row['result_id']]);$pdo->commit();respondSuccess(null,'Hasil hitung disimpan sebagai Draft');}
        if(!$complete)throw new InvalidArgumentException('Hitung #1 wajib diisi untuk seluruh barang sebelum diposting');
        // Optimistic warehouse lock: setiap perubahan stok menaikkan versi.
        // Hasil tidak boleh diposting bila ada penerimaan/penjualan/transfer/
        // penyesuaian sejak lembar hitung dibuat, walaupun saldo akhirnya sama.
        $versionStmt=$pdo->prepare("SELECT stock_version FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE");
        $changed=[];
        foreach($storedRows as $item){$versionStmt->execute([$row['warehouse_id'],$item['item_id']]);$currentVersion=$versionStmt->fetchColumn();$currentVersion=$currentVersion===false?0:(int)$currentVersion;if($currentVersion!==(int)$item['system_version'])$changed[]=$item['item_code'].' '.$item['item_name'];}
        if($changed)throw new DomainException('Posting ditolak karena ada mutasi stok setelah penghitungan dimulai: '.implode(', ',array_slice($changed,0,5)).(count($changed)>5?' dan lainnya':'').'. Buat ulang Hasil Stok Opname agar saldo acuan diperbarui.');
        $adjustmentId=null;$adjustmentNumber=null;
        if($differences){
            $period=date('ym');$seq=$pdo->prepare("SELECT adjustment_number FROM stock_adjustments WHERE adjustment_number LIKE ? ORDER BY adjustment_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['ADJ-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;
            $adjustmentNumber='ADJ-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$adjustmentId='SADJ-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
            $pdo->prepare("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,notes,created_by,posted_by,posted_at) VALUES(?,?,'stock_opname',?,'Posted',?,?,?,NOW())")->execute([$adjustmentId,$adjustmentNumber,date('Y-m-d'),'Otomatis dari '.$row['result_number'],$actor['id'],$actor['id']]);
            $lineInsert=$pdo->prepare("INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity) VALUES(?,?,?,?,?,?,?)");
            foreach($differences as $difference){
                $item=$difference['item'];$variance=(int)$difference['variance'];
                $lineInsert->execute([$adjustmentId,$item['item_id'],$row['warehouse_id'],$item['item_code'],$item['item_name'],$item['unit'],$variance]);
                adjustWarehouseStockAllowNegative($pdo,$row['warehouse_id'],$row['branch_id'],$item['item_id'],$variance);
                $source=$variance<0?$row['warehouse_id']:null;$dest=$variance>0?$row['warehouse_id']:null;
                recordStockMovement($pdo,(string)$item['item_id'],$source,$dest,abs($variance),'adjustment','stock_opname',(string)$row['result_id'],(string)$row['result_number'],'Penyesuaian '.$adjustmentNumber.' dari '.$row['order_number'],(string)$actor['id']);
            }
        }
        $pdo->prepare("UPDATE stock_count_results SET status='Posted',adjustment_id=?,adjustment_number=?,notes=?,posted_by=?,posted_at=NOW() WHERE id=?")->execute([$adjustmentId,$adjustmentNumber,trim((string)($d['notes']??'')),$actor['id'],$row['result_id']]);$pdo->prepare("UPDATE stock_count_orders SET status='Selesai',completed_at=NOW() WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(['adjustmentId'=>$adjustmentId,'adjustmentNumber'=>$adjustmentNumber],'Hasil Stok Opname diposting dan selisih stok disesuaikan');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}

if($method==='DELETE'&&$id) {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:delete','item:delete'))respondError('Akun tidak memiliki izin menghapus dokumen Stok Opname',403);
    $target=(string)($d['target']??'order');$pdo->beginTransaction();try{$row=$loadOrder($pdo,$id);if(!$row)throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');requireAccessibleBranch($pdo,$actor,(string)$row['branch_id']);
        if($target==='result'){if(!$row['result_id'])throw new InvalidArgumentException('Hasil Stok Opname belum tersedia');if($row['adjustment_id'])throw new InvalidArgumentException('Hapus Penyesuaian Stok '.$row['adjustment_number'].' terlebih dahulu');$pdo->prepare("DELETE FROM stock_count_result_items WHERE result_id=?")->execute([$row['result_id']]);$pdo->prepare("DELETE FROM stock_count_results WHERE id=?")->execute([$row['result_id']]);$pdo->prepare("UPDATE stock_count_orders SET status='Menunggu Eksekusi',completed_at=NULL WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(null,'Hasil Stok Opname dihapus');}
        if($row['result_id'])throw new InvalidArgumentException('Hapus Hasil Stok Opname terlebih dahulu');$pdo->prepare("DELETE FROM stock_count_orders WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(null,'Perintah Stok Opname dihapus');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}
respondError('Method not allowed',405);
