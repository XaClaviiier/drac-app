<?php
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
$hasOpnamePermission=static function(PDO $pdo,array $actor,string $permission):bool{
    return !empty($actor['is_owner'])||authenticatedUserHasPermission($pdo,$actor,$permission);
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
$isValidDate=static function(string $value):bool{
    $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$value);
    return $parsed!==false&&$parsed->format('Y-m-d')===$value;
};

$loadItemSnapshots=static function(PDO $pdo,string $warehouseId,string $startDate,string $endDate,?string $categoryId=null,array $itemIds=[]):array{
    $effective="COALESCE(m.occurred_at,m.created_at)";
    $sql="SELECT i.id,i.code,i.name,i.category_name,i.unit,
        COALESCE(ws.stock_version,0) system_version,
        COALESCE(SUM(CASE WHEN $effective>=CONCAT(?,' 00:00:00') AND $effective<=CONCAT(?,' 23:59:59') THEN CASE
          WHEN m.destination_warehouse_id=? AND m.movement_type<>'transfer_send' AND m.quantity>=0 THEN m.quantity
          WHEN m.source_warehouse_id=? AND m.movement_type<>'transfer_receive' AND m.quantity<0 THEN -m.quantity
          ELSE 0 END ELSE 0 END),0) movement_in,
        COALESCE(SUM(CASE WHEN $effective>=CONCAT(?,' 00:00:00') AND $effective<=CONCAT(?,' 23:59:59') THEN CASE
          WHEN m.source_warehouse_id=? AND m.movement_type<>'transfer_receive' AND m.quantity>=0 THEN m.quantity
          WHEN m.destination_warehouse_id=? AND m.movement_type<>'transfer_send' AND m.quantity<0 THEN -m.quantity
          ELSE 0 END ELSE 0 END),0) movement_out,
        (COALESCE(ws.quantity,0)
          - COALESCE(SUM(CASE WHEN m.destination_warehouse_id=? AND m.movement_type<>'transfer_send' AND $effective>CONCAT(?,' 23:59:59') THEN m.quantity ELSE 0 END),0)
          + COALESCE(SUM(CASE WHEN m.source_warehouse_id=? AND m.movement_type<>'transfer_receive' AND $effective>CONCAT(?,' 23:59:59') THEN m.quantity ELSE 0 END),0)) AS system_qty
        FROM items i
        LEFT JOIN warehouse_stocks ws ON ws.item_id=i.id COLLATE utf8mb4_unicode_ci AND ws.warehouse_id=?
        LEFT JOIN stock_movements m ON m.item_id=i.id COLLATE utf8mb4_unicode_ci AND m.is_voided=0 AND (m.source_warehouse_id=? OR m.destination_warehouse_id=?)
        WHERE i.type='Persediaan' AND i.is_active=1";
    $params=[$startDate,$endDate,$warehouseId,$warehouseId,$startDate,$endDate,$warehouseId,$warehouseId,$warehouseId,$endDate,$warehouseId,$endDate,$warehouseId,$warehouseId,$warehouseId];
    if($categoryId!==null&&$categoryId!==''){$sql.=" AND i.category_id=?";$params[]=$categoryId;}
    if($itemIds){$sql.=" AND i.id IN (".implode(',',array_fill(0,count($itemIds),'?')).")";$params=array_merge($params,$itemIds);}
    $sql.=" GROUP BY i.id,i.code,i.name,i.category_name,i.unit,ws.quantity,ws.stock_version";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);
    return array_map(static function(array $item):array{
        $item['movement_in']=parseBoundedDecimalInteger($item['movement_in'],'0','9007199254740991','Total stok masuk');
        $item['movement_out']=parseBoundedDecimalInteger($item['movement_out'],'0','9007199254740991','Total stok keluar');
        $item['system_qty']=parseBoundedDecimalInteger($item['system_qty'],'-2147483648','2147483647','Stok historis');
        $item['system_version']=normalizeBoundedDecimalInteger($item['system_version'],'0','18446744073709551615','Versi stok');
        return $item;
    },$stmt->fetchAll());
};

$loadOrder = static function(PDO $pdo, string $id, array $accessibleBranchIds=[]): ?array {
    if(!$accessibleBranchIds)return null;
    $branchPlaceholders=implode(',',array_fill(0,count($accessibleBranchIds),'?'));
    $stmt=$pdo->prepare("SELECT o.*,w.code warehouse_code,w.name warehouse_name,b.name branch_name,
        r.id result_id,r.result_number,r.result_date,r.status result_status,r.adjustment_id,r.adjustment_number,r.notes result_notes
        FROM stock_count_orders o
        JOIN warehouses w ON w.id=o.warehouse_id
        JOIN branches b ON b.id=o.branch_id
        LEFT JOIN stock_count_results r ON r.order_id=o.id
        WHERE o.id=? AND o.branch_id IN ($branchPlaceholders) LIMIT 1");
    $stmt->execute(array_merge([$id],$accessibleBranchIds)); return $stmt->fetch() ?: null;
};
$lockOrderRoot = static function(PDO $pdo,string $id,array $accessibleBranchIds):bool{
    if(!$accessibleBranchIds)return false;
    $branchPlaceholders=implode(',',array_fill(0,count($accessibleBranchIds),'?'));
    $stmt=$pdo->prepare("SELECT id FROM stock_count_orders WHERE id=? AND branch_id IN ($branchPlaceholders) FOR UPDATE");
    $stmt->execute(array_merge([$id],$accessibleBranchIds));
    return $stmt->fetchColumn()!==false;
};
$lockOrderResult = static function(PDO $pdo,string $orderId):void{
    $stmt=$pdo->prepare("SELECT id FROM stock_count_results WHERE order_id=? FOR UPDATE");
    $stmt->execute([$orderId]);$stmt->fetchAll();
};
$mapOrder = static function(array $row): array {
    return [
        'id'=>(string)$row['id'],'orderNumber'=>(string)$row['order_number'],'orderDate'=>(string)$row['order_date'],
        'startDate'=>(string)$row['start_date'],'endDate'=>(string)$row['end_date'],'warehouseId'=>(string)$row['warehouse_id'],'warehouseCode'=>(string)$row['warehouse_code'],
        'warehouseName'=>(string)$row['warehouse_name'],'branchId'=>(string)$row['branch_id'],'branchName'=>(string)$row['branch_name'],
        'categoryId'=>$row['category_id'] ?: null,'includeZeroUnused'=>(bool)$row['include_zero_unused'],'assignedUserId'=>(string)$row['assigned_user_id'],'assignedUserName'=>(string)$row['assigned_user_name'],
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
        'movementIn'=>(int)$row['movement_in'],'movementOut'=>(int)$row['movement_out'],'isManual'=>(bool)$row['is_manual'],
        'count1'=>$row['count_1']===null?null:(int)$row['count_1'],'count2'=>$row['count_2']===null?null:(int)$row['count_2'],
        'finalQuantity'=>$row['final_quantity']===null?null:(int)$row['final_quantity'],'variance'=>$row['variance']===null?null:(int)$row['variance'],
    ],$storedRows);
};

if($method==='GET') {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:view'))respondError('Akun tidak memiliki izin melihat Stok Opname',403);
    $accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);
    if($id) {
        $row=$loadOrder($pdo,$id,$accessibleBranchIds); if(!$row)respondError('Perintah Stok Opname tidak ditemukan',404);
        $payload=$mapOrder($row);
        if($row['result_id'])$payload['rows']=$orderRows($pdo,(string)$row['result_id']); else $payload['rows']=[];
        respondSuccess($payload);
    }
    if(!$accessibleBranchIds)respondSuccess([]);
    $branchPlaceholders=implode(',',array_fill(0,count($accessibleBranchIds),'?'));
    $listStmt=$pdo->prepare("SELECT o.*,w.code warehouse_code,w.name warehouse_name,b.name branch_name,
        r.id result_id,r.result_number,r.result_date,r.status result_status,r.adjustment_id,r.adjustment_number,r.notes result_notes
        FROM stock_count_orders o JOIN warehouses w ON w.id=o.warehouse_id JOIN branches b ON b.id=o.branch_id
        LEFT JOIN stock_count_results r ON r.order_id=o.id
        WHERE o.branch_id IN ($branchPlaceholders) ORDER BY o.start_date DESC,o.created_at DESC LIMIT 250");
    $listStmt->execute($accessibleBranchIds);
    respondSuccess(array_map($mapOrder,$listStmt->fetchAll()));
}

$d=getInput();
if($method==='POST') {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:create'))respondError('Akun tidak memiliki izin membuat Perintah Stok Opname',403);
    $startDate=trim((string)($d['startDate']??''));$endDate=trim((string)($d['endDate']??''));$warehouseId=trim((string)($d['warehouseId']??''));$assignedId=trim((string)($d['assignedUserId']??''));
    if(!$isValidDate($startDate)||!$isValidDate($endDate)||$startDate>$endDate||$endDate>date('Y-m-d'))respondError('Periode Stok Opname tidak valid atau melewati hari ini',422);
    $includeZeroUnused=array_key_exists('includeZeroUnused',$d)?(bool)$d['includeZeroUnused']:true;
    $categoryId=trim((string)($d['categoryId']??''));
    $pdo->beginTransaction();try{
        lockInventoryMutation($pdo);
        $authorization=lockInventoryMutationAuthorization($pdo,$actor,'stock_opname:create',[$assignedId]);$actor=$authorization['actor'];
        $warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active,is_system FROM warehouses WHERE id=? FOR UPDATE");$warehouseStmt->execute([$warehouseId]);$warehouse=$warehouseStmt->fetch();
        $lockedBranchIds=getAccessibleBranchIds($pdo,$actor);
        if(!$warehouse||!in_array((string)$warehouse['branch_id'],$lockedBranchIds,true))throw new DomainException('Gudang tidak tersedia untuk akun ini',403);
        if(!(bool)$warehouse['is_active']||(bool)$warehouse['is_system'])throw new InvalidArgumentException('Gudang tidak valid atau nonaktif');
        $branchStmt=$pdo->prepare("SELECT id,is_active FROM branches WHERE id=? FOR UPDATE");$branchStmt->execute([$warehouse['branch_id']]);$lockedBranch=$branchStmt->fetch();
        if(!$lockedBranch||!(bool)$lockedBranch['is_active'])throw new InvalidArgumentException('Cabang gudang sudah nonaktif');
        if($categoryId!==''){
            $categoryStmt=$pdo->prepare("SELECT id,is_active FROM item_categories WHERE id=? FOR UPDATE");$categoryStmt->execute([$categoryId]);$category=$categoryStmt->fetch();
            if(!$category||(bool)$category['is_active']!==true)throw new InvalidArgumentException('Kategori barang tidak valid atau nonaktif');
        }
        $assigned=lockedInventoryDelegatedUserForBranch($authorization,$assignedId,(string)$warehouse['branch_id'],'Petugas');
        $period=date('ym',strtotime($endDate));$seq=$pdo->prepare("SELECT order_number FROM stock_count_orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['SO-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;
        $number='SO-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$newId='SC-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
        $pdo->prepare("INSERT INTO stock_count_orders(id,order_number,order_date,start_date,end_date,warehouse_id,branch_id,category_id,include_zero_unused,assigned_user_id,assigned_user_name,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            ->execute([$newId,$number,date('Y-m-d'),$startDate,$endDate,$warehouseId,$warehouse['branch_id'],$categoryId?:null,$includeZeroUnused?1:0,$assignedId,$assigned['name']?:$assigned['username'],trim((string)($d['notes']??'')),$actor['id']]);
        $pdo->commit();respondSuccess(['id'=>$newId,'orderNumber'=>$number,'status'=>'Menunggu Eksekusi'],'Perintah Stok Opname disimpan');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),$e->getCode()===403?403:422);}
}

if($method==='PUT'&&$id) {
    $action=(string)($d['action']??''); if(!in_array($action,['start','save-result','post-result','add-item','remove-item'],true))respondError('Aksi Stok Opname tidak valid',422);
    if($action==='post-result'&&!$hasOpnamePermission($pdo,$actor,'stock_opname:post'))respondError('Posting hasil hanya boleh dilakukan Owner atau Supervisor yang diberi izin Posting Stok Opname',403);
    if($action!=='post-result'&&!$hasOpnamePermission($pdo,$actor,'stock_opname:count'))respondError('Akun tidak memiliki izin melakukan penghitungan stok',403);
    $accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);$preflight=$loadOrder($pdo,$id,$accessibleBranchIds);if(!$preflight)respondError('Perintah Stok Opname tidak ditemukan',404);
    $requiredPermission=$action==='post-result'?'stock_opname:post':'stock_opname:count';
    $pdo->beginTransaction();try{
        lockInventoryMutation($pdo);
        $authorization=lockInventoryMutationAuthorization($pdo,$actor,$requiredPermission,[(string)($preflight['assigned_user_id']??'')]);$actor=$authorization['actor'];
        $accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);
        if(!$lockOrderRoot($pdo,$id,$accessibleBranchIds))throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');
        $lockOrderResult($pdo,$id);
        $row=$loadOrder($pdo,$id,$accessibleBranchIds);if(!$row)throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');
        if((string)$row['assigned_user_id']!==(string)$preflight['assigned_user_id'])throw new DomainException('Petugas Perintah Stok Opname berubah, silakan ulangi');

        if(!in_array((string)$row['branch_id'],getAccessibleBranchIds($pdo,$actor),true))throw new DomainException('Akun tidak memiliki akses ke cabang tersebut',403);
        if((string)$row['branch_id']!==(string)$preflight['branch_id'])throw new DomainException('Cabang Perintah Stok Opname berubah, silakan ulangi');
        if($action==='start') {
            if($row['status']!=='Menunggu Eksekusi'||$row['result_id'])throw new InvalidArgumentException('Perintah sudah mulai dihitung');
            if((string)$row['end_date']>date('Y-m-d'))throw new InvalidArgumentException('Tanggal akhir Stok Opname belum tercapai');
            $warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active,is_system FROM warehouses WHERE id=? FOR UPDATE");$warehouseStmt->execute([$row['warehouse_id']]);$startWarehouse=$warehouseStmt->fetch();
            if(!$startWarehouse||(string)$startWarehouse['branch_id']!==(string)$row['branch_id'])throw new DomainException('Gudang Perintah tidak lagi tersedia untuk cabang ini',403);
            if(!(bool)$startWarehouse['is_active']||(bool)$startWarehouse['is_system'])throw new InvalidArgumentException('Gudang Perintah sudah nonaktif atau tidak dapat digunakan');
            $branchStmt=$pdo->prepare("SELECT id,is_active FROM branches WHERE id=? FOR UPDATE");$branchStmt->execute([$row['branch_id']]);$startBranch=$branchStmt->fetch();
            if(!$startBranch||!(bool)$startBranch['is_active'])throw new InvalidArgumentException('Cabang Perintah sudah nonaktif');
            if(!empty($row['category_id'])){
                $categoryStmt=$pdo->prepare("SELECT id,is_active FROM item_categories WHERE id=? FOR UPDATE");$categoryStmt->execute([$row['category_id']]);$startCategory=$categoryStmt->fetch();
                if(!$startCategory||!(bool)$startCategory['is_active'])throw new InvalidArgumentException('Kategori Perintah tidak lagi tersedia');
            }
            $startAssigned=lockedInventoryDelegatedUserForBranch($authorization,(string)$row['assigned_user_id'],(string)$row['branch_id'],'Petugas Perintah');
            if((string)$row['assigned_user_id']!==(string)$actor['id']&&empty($actor['is_owner']))throw new InvalidArgumentException('Hanya petugas yang ditunjuk atau Owner dapat memulai penghitungan');
            $period=date('ym',strtotime((string)$row['end_date']));$seq=$pdo->prepare("SELECT result_number FROM stock_count_results WHERE result_number LIKE ? ORDER BY result_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['HSO-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;$resultNumber='HSO-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$resultId='SCR-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
            $pdo->prepare("INSERT INTO stock_count_results(id,result_number,order_id,result_date,status,created_by) VALUES(?,?,?,?, 'Draft',?)")->execute([$resultId,$resultNumber,$id,$row['end_date'],$actor['id']]);
            $itemRows=$loadItemSnapshots($pdo,(string)$row['warehouse_id'],(string)$row['start_date'],(string)$row['end_date'],$row['category_id']?:null);
            if(!(bool)$row['include_zero_unused'])$itemRows=array_values(array_filter($itemRows,static fn(array $item):bool=>(int)$item['system_qty']!==0||(int)$item['movement_in']!==0||(int)$item['movement_out']!==0));
            $sortByCategoryUsage($itemRows,$loadCategoryUsage($pdo));$insert=$pdo->prepare("INSERT INTO stock_count_result_items(result_id,item_id,item_code,item_name,category_name,unit,system_quantity,system_version,movement_in,movement_out) VALUES(?,?,?,?,?,?,?,?,?,?)");$count=0;foreach($itemRows as$item){$insert->execute([$resultId,$item['id'],$item['code'],$item['name'],$item['category_name']?:'Tanpa Kategori',$item['unit']??'',$item['system_qty'],$item['system_version'],$item['movement_in'],$item['movement_out']]);$count++;}if(!$count)throw new InvalidArgumentException('Tidak ada barang untuk dihitung');
            $pdo->prepare("UPDATE stock_count_orders SET status='Dalam Penghitungan' WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(['resultId'=>$resultId,'resultNumber'=>$resultNumber],'Hasil Stok Opname dibuat');
        }
        if(!$row['result_id']||$row['result_status']!=='Draft')throw new InvalidArgumentException('Hasil Stok Opname tidak dapat diubah');
        if(in_array($action,['save-result','add-item','remove-item'],true)&&(string)$row['assigned_user_id']!==(string)$actor['id']&&empty($actor['is_owner'])&&!in_array('stock_opname:post',$authorization['permissions'],true))throw new InvalidArgumentException('Hanya petugas yang ditunjuk atau Supervisor dapat mengubah hasil penghitungan');
        if($action==='add-item'){
            $itemId=trim((string)($d['itemId']??''));if($itemId==='')throw new InvalidArgumentException('Barang wajib dipilih');
            $duplicate=$pdo->prepare("SELECT id FROM stock_count_result_items WHERE result_id=? AND item_id=? FOR UPDATE");$duplicate->execute([$row['result_id'],$itemId]);if($duplicate->fetchColumn()!==false)throw new InvalidArgumentException('Barang sudah ada dalam Hasil Stok Opname');
            $items=$loadItemSnapshots($pdo,(string)$row['warehouse_id'],(string)$row['start_date'],(string)$row['end_date'],null,[$itemId]);if(!$items)throw new InvalidArgumentException('Barang persediaan aktif tidak ditemukan');$item=$items[0];
            try{
                $pdo->prepare("INSERT INTO stock_count_result_items(result_id,item_id,item_code,item_name,category_name,unit,system_quantity,system_version,movement_in,movement_out,is_manual,added_by,added_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,NOW())")
                    ->execute([$row['result_id'],$item['id'],$item['code'],$item['name'],$item['category_name']?:'Tanpa Kategori',$item['unit']??'',$item['system_qty'],$item['system_version'],$item['movement_in'],$item['movement_out'],$actor['id']]);
            }catch(PDOException $e){
                if((string)$e->getCode()==='23000')throw new InvalidArgumentException('Barang sudah ada dalam Hasil Stok Opname');
                throw $e;
            }
            $resultItemId=(int)$pdo->lastInsertId();$usage=$loadCategoryUsage($pdo);$categoryName=(string)($item['category_name']?:'Tanpa Kategori');
            $addedRow=['id'=>$resultItemId,'itemId'=>(string)$item['id'],'code'=>(string)$item['code'],'name'=>(string)$item['name'],
                'categoryName'=>$categoryName,'categoryUsageCount'=>(int)($usage[$categoryName]??0),'unit'=>(string)($item['unit']??''),
                'systemQuantity'=>(int)$item['system_qty'],'movementIn'=>(int)$item['movement_in'],'movementOut'=>(int)$item['movement_out'],
                'isManual'=>true,'count1'=>null,'count2'=>null,'finalQuantity'=>null,'variance'=>null];
            $pdo->commit();respondSuccess($addedRow,'Barang ditambahkan ke Hasil Stok Opname');
        }
        if($action==='remove-item'){
            $resultItemId=(int)($d['resultItemId']??0);$manual=$pdo->prepare("SELECT id FROM stock_count_result_items WHERE id=? AND result_id=? AND is_manual=1 FOR UPDATE");$manual->execute([$resultItemId,$row['result_id']]);if($manual->fetchColumn()===false)throw new InvalidArgumentException('Hanya barang tambahan manual yang dapat dihapus');
            $pdo->prepare("DELETE FROM stock_count_result_items WHERE id=? AND result_id=? AND is_manual=1")->execute([$resultItemId,$row['result_id']]);$pdo->commit();respondSuccess(null,'Barang manual dihapus dari Hasil Stok Opname');
        }
        if(!is_array($d['rows']??null))throw new InvalidArgumentException('Daftar barang hasil penghitungan tidak lengkap');
        $inputRows=$d['rows'];
        $byId=[];foreach($inputRows as $input)$byId[(int)($input['id']??0)]=$input;
        $stored=$pdo->prepare("SELECT * FROM stock_count_result_items WHERE result_id=? FOR UPDATE");$stored->execute([$row['result_id']]);$storedRows=$stored->fetchAll();
        $update=$pdo->prepare("UPDATE stock_count_result_items SET count_1=?,count_2=?,final_quantity=?,variance=? WHERE id=? AND result_id=?");
        $parseCount=static function($value):?int{if($value===null||$value==='')return null;return (int)parseBoundedDecimalInteger($value,'0','2147483647','Kuantitas fisik');};
        $complete=true;$differences=[];
        foreach($storedRows as $item){
            if(!array_key_exists((int)$item['id'],$byId))throw new InvalidArgumentException('Daftar barang hasil penghitungan tidak lengkap');
            $input=$byId[(int)$item['id']];
            if(!array_key_exists('count1',$input))throw new InvalidArgumentException('Daftar barang hasil penghitungan tidak lengkap');
            $c1=$parseCount($input['count1']);
            $c2=$parseCount($input['count2']??null);
            if($c1===null)$complete=false;
            $final=$c2??$c1;
            $variance=$final===null?null:$final-(int)$item['system_quantity'];
            if($variance!==null&&($variance < -2147483648||$variance > 2147483647))throw new InvalidArgumentException('Selisih Opname berada di luar batas penyimpanan');
            $update->execute([$c1,$c2,$final,$variance,$item['id'],$row['result_id']]);
            if($variance!==null&&$variance!==0)$differences[]=['item'=>$item,'variance'=>$variance];
        }
        if($action==='save-result'){$pdo->prepare("UPDATE stock_count_results SET notes=? WHERE id=?")->execute([trim((string)($d['notes']??'')),$row['result_id']]);$pdo->commit();respondSuccess(null,'Hasil hitung disimpan sebagai Draft');}
        if(!$complete)throw new InvalidArgumentException('Hitung #1 wajib diisi untuk seluruh barang sebelum diposting');
        $postingWarehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active,is_system FROM warehouses WHERE id=? FOR UPDATE");$postingWarehouseStmt->execute([$row['warehouse_id']]);$postingWarehouse=$postingWarehouseStmt->fetch();
        if(!$postingWarehouse||(string)$postingWarehouse['branch_id']!==(string)$row['branch_id'])throw new DomainException('Gudang Perintah tidak lagi tersedia untuk cabang ini',403);
        if(!(bool)$postingWarehouse['is_active']||(bool)$postingWarehouse['is_system'])throw new InvalidArgumentException('Gudang Perintah sudah nonaktif atau tidak dapat digunakan');
        $postingBranchStmt=$pdo->prepare("SELECT id,is_active FROM branches WHERE id=? FOR UPDATE");$postingBranchStmt->execute([$row['branch_id']]);$postingBranch=$postingBranchStmt->fetch();
        if(!$postingBranch||!(bool)$postingBranch['is_active'])throw new InvalidArgumentException('Cabang Perintah sudah nonaktif');
        // Optimistic warehouse lock: setiap perubahan stok menaikkan versi.
        // Hasil tidak boleh diposting bila ada penerimaan/penjualan/transfer/
        // penyesuaian sejak lembar hitung dibuat, walaupun saldo akhirnya sama.
        $versionStmt=$pdo->prepare("SELECT stock_version FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE");
        $changed=[];
        foreach($storedRows as $item){$versionStmt->execute([$row['warehouse_id'],$item['item_id']]);$currentVersion=$versionStmt->fetchColumn();$currentVersion=normalizeBoundedDecimalInteger($currentVersion===false?'0':$currentVersion,'0','18446744073709551615','Versi stok saat ini');$snapshotVersion=normalizeBoundedDecimalInteger($item['system_version'],'0','18446744073709551615','Versi snapshot');if($currentVersion!==$snapshotVersion)$changed[]=$item['item_code'].' '.$item['item_name'];}
        if($changed)throw new DomainException('Posting ditolak karena ada mutasi stok setelah penghitungan dimulai: '.implode(', ',array_slice($changed,0,5)).(count($changed)>5?' dan lainnya':'').'. Buat ulang Hasil Stok Opname agar saldo acuan diperbarui.');
        $adjustmentId=null;$adjustmentNumber=null;
        if($differences){
            $period=date('ym',strtotime((string)$row['end_date']));$seq=$pdo->prepare("SELECT adjustment_number FROM stock_adjustments WHERE adjustment_number LIKE ? ORDER BY adjustment_number DESC LIMIT 1 FOR UPDATE");$seq->execute(['ADJ-'.$period.'-%']);$last=(string)($seq->fetchColumn()?:'');$next=preg_match('/(\d{4})$/',$last,$m)?(int)$m[1]+1:1;
            $adjustmentNumber='ADJ-'.$period.'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT);$adjustmentId='SADJ-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
            $pdo->prepare("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,notes,created_by,posted_by,posted_at) VALUES(?,?,'stock_opname',?,'Posted',?,?,?,NOW())")->execute([$adjustmentId,$adjustmentNumber,$row['end_date'],'Otomatis dari '.$row['result_number'],$actor['id'],$actor['id']]);
            $lineInsert=$pdo->prepare("INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity) VALUES(?,?,?,?,?,?,?)");
            foreach($differences as $difference){
                $item=$difference['item'];$variance=(int)$difference['variance'];
                $lineInsert->execute([$adjustmentId,$item['item_id'],$row['warehouse_id'],$item['item_code'],$item['item_name'],$item['unit'],$variance]);
                adjustWarehouseStockAllowNegative($pdo,$row['warehouse_id'],$row['branch_id'],$item['item_id'],$variance);
                $source=$variance<0?$row['warehouse_id']:null;$dest=$variance>0?$row['warehouse_id']:null;
                recordStockMovement($pdo,(string)$item['item_id'],$source,$dest,abs($variance),'adjustment','stock_opname',(string)$row['result_id'],(string)$row['result_number'],'Penyesuaian '.$adjustmentNumber.' dari '.$row['order_number'],(string)$actor['id'],$row['end_date'].' 23:59:59');
            }
        }
        $pdo->prepare("UPDATE stock_count_results SET status='Posted',adjustment_id=?,adjustment_number=?,notes=?,posted_by=?,posted_at=NOW() WHERE id=?")->execute([$adjustmentId,$adjustmentNumber,trim((string)($d['notes']??'')),$actor['id'],$row['result_id']]);$pdo->prepare("UPDATE stock_count_orders SET status='Selesai',completed_at=NOW() WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(['adjustmentId'=>$adjustmentId,'adjustmentNumber'=>$adjustmentNumber],'Hasil Stok Opname diposting dan selisih stok disesuaikan');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),$e->getCode()===403?403:422);}
}

if($method==='DELETE'&&$id) {
    if(!$hasOpnamePermission($pdo,$actor,'stock_opname:delete'))respondError('Akun tidak memiliki izin menghapus dokumen Stok Opname',403);
    $accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);$preflight=$loadOrder($pdo,$id,$accessibleBranchIds);if(!$preflight)respondError('Perintah Stok Opname tidak ditemukan',404);
    $target=(string)($d['target']??'order');$pdo->beginTransaction();try{
        lockInventoryMutation($pdo);
        $authorization=lockInventoryMutationAuthorization($pdo,$actor,'stock_opname:delete',[(string)($preflight['assigned_user_id']??'')]);$actor=$authorization['actor'];
        $accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);
        if(!$lockOrderRoot($pdo,$id,$accessibleBranchIds))throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');
        $lockOrderResult($pdo,$id);
        $row=$loadOrder($pdo,$id,$accessibleBranchIds);if(!$row)throw new InvalidArgumentException('Perintah Stok Opname tidak ditemukan');
        if((string)$row['assigned_user_id']!==(string)$preflight['assigned_user_id'])throw new DomainException('Petugas Perintah Stok Opname berubah, silakan ulangi');

        if(!in_array((string)$row['branch_id'],getAccessibleBranchIds($pdo,$actor),true))throw new DomainException('Akun tidak memiliki akses ke cabang tersebut',403);
        if((string)$row['branch_id']!==(string)$preflight['branch_id'])throw new DomainException('Cabang Perintah Stok Opname berubah, silakan ulangi');
        if($target==='result'){if(!$row['result_id'])throw new InvalidArgumentException('Hasil Stok Opname belum tersedia');if($row['result_status']==='Posted')throw new InvalidArgumentException('Hasil Stok Opname yang sudah diposting tidak dapat dihapus');$pdo->prepare("DELETE FROM stock_count_result_items WHERE result_id=?")->execute([$row['result_id']]);$pdo->prepare("DELETE FROM stock_count_results WHERE id=?")->execute([$row['result_id']]);$pdo->prepare("UPDATE stock_count_orders SET status='Menunggu Eksekusi',completed_at=NULL WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(null,'Hasil Stok Opname dihapus');}
        if($row['result_id'])throw new InvalidArgumentException('Hapus Hasil Stok Opname terlebih dahulu');$pdo->prepare("DELETE FROM stock_count_orders WHERE id=?")->execute([$id]);$pdo->commit();respondSuccess(null,'Perintah Stok Opname dihapus');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),$e->getCode()===403?403:422);}
}
respondError('Method not allowed',405);
