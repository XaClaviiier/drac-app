<?php
// Included after the shared opname loaders. All stock/document writes commit together.
$simpleInput=$method==='GET'?[]:getInput();
$simplePreview=$method==='GET'&&!$id&&($_GET['preview']??'')==='1';
$simpleSave=in_array($method,['POST','PUT'],true)&&($simpleInput['action']??'')==='save-simple';
$simpleDelete=$method==='DELETE'&&$id&&($simpleInput['target']??'')==='simple';
if(!$simplePreview&&!$simpleSave&&!$simpleDelete)return;

$simpleStockVersion=static function(PDO $pdo,string $warehouse,string $item):string{
    $stmt=$pdo->prepare('SELECT stock_version FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE');
    $stmt->execute([$warehouse,$item]);$value=$stmt->fetchColumn();
    return normalizeBoundedDecimalInteger($value===false?'0':$value,'0','18446744073709551615','Versi stok');
};
$simpleNumber=static function(PDO $pdo,string $table,string $column,string $prefix):string{
    $stmt=$pdo->prepare("SELECT $column FROM $table WHERE $column LIKE ? ORDER BY $column DESC LIMIT 1 FOR UPDATE");
    $stmt->execute([$prefix.'%']);$last=(string)($stmt->fetchColumn()?:'');
    $next=preg_match('/(\d+)$/',$last,$match)?(int)$match[1]+1:1;
    if($next>9999)throw new InvalidArgumentException('Nomor dokumen periode ini telah penuh');
    return $prefix.str_pad((string)$next,4,'0',STR_PAD_LEFT);
};
$simpleAudit=static function(PDO $pdo,string $id,string $number,string $actorId,string $action,array $snapshot):void{
    $pdo->prepare('INSERT INTO stock_opname_audit(order_id,order_number,actor_id,action,snapshot) VALUES(?,?,?,?,?)')
        ->execute([$id,$number,$actorId,$action,json_encode($snapshot,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);
};

$pdo->beginTransaction();
try{
    lockInventoryMutation($pdo);
    $permission=$simplePreview?'stock_opname:view':($simpleDelete?'stock_opname:delete':'stock_opname:post');
    $authorization=lockInventoryMutationAuthorization($pdo,$actor,$permission);$actor=$authorization['actor'];
    if($simpleSave){
        assertLockedInventoryPermission($authorization,'stock_opname:count');
        if($method==='POST')assertLockedInventoryPermission($authorization,'stock_opname:create');
    }
    $branches=getAccessibleBranchIds($pdo,$actor);$existing=null;$oldRows=[];
    if($id){
        if(!$lockOrderRoot($pdo,$id,$branches))throw new DomainException('Stok Opname tidak ditemukan',404);
        $lockOrderResult($pdo,$id);$existing=$loadOrder($pdo,$id,$branches);
        if(!$existing||($existing['entry_mode']??'legacy')!=='simple')throw new InvalidArgumentException('Dokumen lama dibuka melalui Dokumen Lama');
        if((int)($simpleInput['revision']??-1)!==(int)$existing['revision'])throw new DomainException('Opname telah diubah pengguna lain. Buka ulang sebelum menyimpan.',409);
        $stmt=$pdo->prepare('SELECT * FROM stock_count_result_items WHERE result_id=? FOR UPDATE');
        $stmt->execute([$existing['result_id']]);foreach($stmt->fetchAll() as $line)$oldRows[(string)$line['item_id']]=$line;
    }elseif($method==='PUT'||$simpleDelete)throw new InvalidArgumentException('Nomor opname wajib dipilih');

    $warehouseId=$existing?(string)$existing['warehouse_id']:trim((string)($simplePreview?($_GET['warehouseId']??''):($simpleInput['warehouseId']??'')));
    $date=$existing?(string)$existing['end_date']:trim((string)($simplePreview?($_GET['date']??''):($simpleInput['date']??'')));
    if(!$isValidDate($date)||$date>date('Y-m-d'))throw new InvalidArgumentException('Tanggal opname tidak valid atau melewati hari ini');
    if($existing&&$simpleSave&&(($simpleInput['warehouseId']??'')!==$warehouseId||($simpleInput['date']??'')!==$date))throw new InvalidArgumentException('Tanggal dan gudang dokumen tersimpan tidak dapat diganti');
    if(!$existing&&$simpleSave){
        $retryKey=(string)($simpleInput['requestKey']??'');
        if(!preg_match('/^[a-f0-9]{24}$/D',$retryKey))throw new InvalidArgumentException('Kunci penyimpanan tidak valid');
        $retryId='SC-'.$retryKey;$duplicate=$loadOrder($pdo,$retryId,$branches);
        if($duplicate){
            $audit=$pdo->prepare("SELECT snapshot FROM stock_opname_audit WHERE order_id=? AND action='create' ORDER BY id LIMIT 1");$audit->execute([$retryId]);
            $saved=json_decode((string)$audit->fetchColumn(),true);
            if(($saved['requestHash']??'')!==hash('sha256',json_encode($simpleInput))||(string)$duplicate['created_by']!==(string)$actor['id'])throw new DomainException('Permintaan sudah digunakan. Buka ulang dokumen.',409);
            $pdo->commit();respondSuccess(['id'=>$retryId],'Opname sudah tersimpan');
        }
    }
    $warehouses=lockInventoryWarehousesForAuthorization($pdo,$authorization,[$warehouseId],'Gudang tidak tersedia untuk akun ini',403);
    lockActiveInventoryWarehouses($pdo,[$warehouseId]);
    $warehouse=$warehouses[$warehouseId]??null;
    if(!$warehouse||!empty($warehouse['is_system']))throw new InvalidArgumentException('Pilih gudang aktif');
    $branchId=(string)$warehouse['branch_id'];
    if($existing&&(string)$existing['branch_id']!==$branchId)throw new DomainException('Cabang gudang berubah',409);

    if($simplePreview){
        $items=$loadItemSnapshots($pdo,$warehouseId,$date,$date);
        $sortByCategoryUsage($items,$loadCategoryUsage($pdo));
        $rows=array_map(static fn($item)=>['itemId'=>(string)$item['id'],'code'=>$item['code'],'name'=>$item['name'],
            'unit'=>$item['unit'],'categoryName'=>$item['category_name']?:'Tanpa Kategori','systemQuantity'=>(int)$item['system_qty'],
            'editVersion'=>(string)$item['system_version'],'finalQuantity'=>null,'variance'=>null],$items);
        $pdo->commit();respondSuccess(['rows'=>$rows]);
    }

    $notes=trim((string)($simpleInput['notes']??''));if(strlen($notes)>255)throw new InvalidArgumentException('Keterangan maksimal 255 byte');
    $newRows=[];$hasCount=false;
    if($simpleSave){
        if(!is_array($simpleInput['rows']??null)||!count($simpleInput['rows'])||count($simpleInput['rows'])>20000)throw new InvalidArgumentException('Daftar barang tidak valid');
        $snapshots=[];
        foreach($loadItemSnapshots($pdo,$warehouseId,$date,$date) as $line)$snapshots[(string)$line['id']]=$line;
        foreach($simpleInput['rows'] as $input){
            if(!is_array($input))throw new InvalidArgumentException('Baris opname tidak valid');
            $itemId=(string)($input['itemId']??'');
            if($itemId===''||isset($newRows[$itemId]))throw new InvalidArgumentException('Barang kosong atau duplikat');
            $storedItem=isset($oldRows[$itemId]);$base=$oldRows[$itemId]??$snapshots[$itemId]??null;
            if(!$base)throw new InvalidArgumentException('Barang tidak tersedia pada lembar opname');
            $system=(int)($storedItem?$base['system_quantity']:$base['system_qty']);
            $physical=$input['finalQuantity']??null;
            if($physical==='')$physical=null;
            if($physical!==null){
                $physical=parseBoundedDecimalInteger($physical,'0','2147483647','Hitung fisik');$hasCount=true;
            }
            $variance=$physical===null?null:$physical-$system;
            if($variance!==null)parseBoundedDecimalInteger($variance,'-2147483647','2147483647','Selisih');
            $currentVersion=$simpleStockVersion($pdo,$warehouseId,$itemId);
            // Blank rows do not participate in stock changes; previously counted rows do.
            if($physical!==null||($storedItem&&$base['final_quantity']!==null)){
                if((string)($input['editVersion']??'')!==$currentVersion)throw new DomainException('Stok '.$base[$storedItem?'item_code':'code'].' berubah saat penghitungan. Muat ulang stok dan periksa hasil hitung sebelum menyimpan.',409);
                if(!$storedItem&&(int)($input['systemQuantity']??PHP_INT_MIN)!==$system)throw new DomainException('Stok acuan berubah. Muat ulang stok sebelum menyimpan.',409);
            }
            $newRows[$itemId]=['item_id'=>$itemId,'item_code'=>$base[$storedItem?'item_code':'code'],'item_name'=>$base[$storedItem?'item_name':'name'],
                'category_name'=>$base['category_name']??'','unit'=>$base['unit']??'','system_quantity'=>$system,'system_version'=>$currentVersion,
                'final_quantity'=>$physical,'variance'=>$variance];
        }
        if(!$hasCount)throw new InvalidArgumentException('Isi hasil hitung minimal satu barang');
        if($existing&&array_diff_key($oldRows,$newRows))throw new InvalidArgumentException('Daftar barang tidak lengkap. Kosongkan hitung fisik untuk menandai belum diperiksa.');
    }

    // A client-generated request key prevents duplicate creation after a lost response.
    if(!$existing){
        $requestKey=(string)($simpleInput['requestKey']??'');
        if(!preg_match('/^[a-f0-9]{24}$/D',$requestKey))throw new InvalidArgumentException('Kunci penyimpanan tidak valid');
        $id='SC-'.$requestKey;
        $duplicate=$loadOrder($pdo,$id,$branches);
        if($duplicate){
            $audit=$pdo->prepare("SELECT snapshot FROM stock_opname_audit WHERE order_id=? AND action='create' ORDER BY id LIMIT 1");$audit->execute([$id]);
            $saved=json_decode((string)$audit->fetchColumn(),true);
            if(($saved['requestHash']??'')!==hash('sha256',json_encode($simpleInput))||(string)$duplicate['created_by']!==(string)$actor['id'])throw new DomainException('Permintaan sudah digunakan. Buka ulang dokumen.',409);
            $pdo->commit();respondSuccess(['id'=>$id],'Opname sudah tersimpan');
        }
    }

    $before=$existing?['document'=>$existing,'rows'=>array_values($oldRows)]:null;
    $adjustmentId=$existing['adjustment_id']??null;$adjustmentNumber=$existing['adjustment_number']??null;
    // Check the linked ledger before replacing it; never remove unrelated movements.
    if($existing){
        $movement=$pdo->prepare("SELECT * FROM stock_movements WHERE reference_type='stock_opname' AND reference_id=? FOR UPDATE");
        $movement->execute([$existing['result_id']]);$oldMovements=$movement->fetchAll();$ledger=[];
        foreach($oldMovements as $move){
            if(!empty($move['is_voided'])||$move['movement_type']!=='adjustment'||!empty($move['reversal_of_id']))throw new DomainException('Mutasi opname tidak konsisten; periksa dokumen terkait.',409);
            $delta=($move['destination_warehouse_id']===$warehouseId?(int)$move['quantity']:0)-($move['source_warehouse_id']===$warehouseId?(int)$move['quantity']:0);
            $ledger[$move['item_id']]=($ledger[$move['item_id']]??0)+$delta;
        }
        foreach($oldRows as $itemId=>$old){if(($ledger[$itemId]??0)!==(int)($old['variance']??0))throw new DomainException('Mutasi opname tidak sesuai hasil tersimpan.',409);unset($ledger[$itemId]);}
        if($ledger)throw new DomainException('Ada mutasi opname yang tidak dikenal.',409);
        if($adjustmentId){
            $adjustment=$pdo->prepare('SELECT * FROM stock_adjustments WHERE id=? FOR UPDATE');$adjustment->execute([$adjustmentId]);$oldAdjustment=$adjustment->fetch();
            if(!$oldAdjustment||$oldAdjustment['status']!=='Posted'||$oldAdjustment['adjustment_type']!=='stock_opname')throw new DomainException('Penyesuaian terhubung tidak konsisten.',409);
            $before['adjustment']=$oldAdjustment;
            $pdo->prepare('DELETE FROM stock_adjustment_items WHERE adjustment_id=?')->execute([$adjustmentId]);
        }
        $before['movements']=$oldMovements;
        $pdo->prepare("DELETE FROM stock_movements WHERE reference_type='stock_opname' AND reference_id=?")->execute([$existing['result_id']]);
    }

    $allIds=array_unique(array_merge(array_keys($oldRows),array_keys($newRows)));
    foreach($allIds as $itemId){
        $delta=(int)($newRows[$itemId]['variance']??0)-(int)($oldRows[$itemId]['variance']??0);
        if($delta!==0){
            $itemType=$pdo->prepare('SELECT type FROM items WHERE id=? FOR UPDATE');$itemType->execute([$itemId]);
            if($itemType->fetchColumn()!=='Persediaan')throw new DomainException('Jenis barang berubah; koreksi stok tidak dapat diterapkan.',409);
            if($existing){
                $later=$pdo->prepare("SELECT o.order_number FROM stock_count_orders o JOIN stock_count_results r ON r.order_id=o.id JOIN stock_count_result_items i ON i.result_id=r.id
                    WHERE o.warehouse_id=? AND o.id<>? AND r.status='Posted' AND i.item_id=? AND i.final_quantity IS NOT NULL
                    AND (o.end_date>? OR (o.end_date=? AND (o.created_at>? OR (o.created_at=? AND o.order_number>?)))) LIMIT 1");
                $later->execute([$warehouseId,$id,$itemId,$date,$date,$existing['created_at'],$existing['created_at'],$existing['order_number']]);
                $laterNumber=$later->fetchColumn();
                if($laterNumber!==false)throw new DomainException('Barang sudah dihitung pada opname lebih baru '.$laterNumber.'. Koreksi opname terbaru terlebih dahulu.',409);
            }
            $stock=$pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=? FOR UPDATE');$stock->execute([$warehouseId,$itemId]);
            parseBoundedDecimalInteger((int)$stock->fetchColumn()+$delta,'-2147483648','2147483647','Stok setelah koreksi');
            adjustWarehouseStockAllowNegative($pdo,$warehouseId,$branchId,$itemId,$delta);
        }
    }
    if($simpleDelete){
        $simpleAudit($pdo,$id,$existing['order_number'],(string)$actor['id'],'delete',['before'=>$before]);
        $pdo->prepare('DELETE FROM stock_count_result_items WHERE result_id=?')->execute([$existing['result_id']]);
        $pdo->prepare('DELETE FROM stock_count_results WHERE id=?')->execute([$existing['result_id']]);
        if($adjustmentId)$pdo->prepare('DELETE FROM stock_adjustments WHERE id=?')->execute([$adjustmentId]);
        $pdo->prepare('DELETE FROM stock_count_orders WHERE id=?')->execute([$id]);
        $pdo->commit();respondSuccess(null,'Opname dan penyesuaian terkait dihapus; dampak stok dikembalikan');
    }

    $period=date('ym',strtotime($date));
    $number=$existing['order_number']??$simpleNumber($pdo,'stock_count_orders','order_number','SO-'.$period.'-');
    $resultId=$existing['result_id']??('SCR-'.substr(bin2hex(random_bytes(12)),0,24));
    $resultNumber=$existing['result_number']??$simpleNumber($pdo,'stock_count_results','result_number','HSO-'.$period.'-');
    if(!$existing){
        $pdo->prepare("INSERT INTO stock_count_orders(id,order_number,order_date,start_date,end_date,warehouse_id,branch_id,include_zero_unused,assigned_user_id,assigned_user_name,status,notes,created_by,completed_at,entry_mode,revision) VALUES(?,?,?,?,?,?,?,1,?,?,'Selesai',?,?,NOW(),'simple',1)")
            ->execute([$id,$number,$date,$date,$date,$warehouseId,$branchId,$actor['id'],$actor['name']??$actor['username']??'',$notes,$actor['id']]);
        $pdo->prepare("INSERT INTO stock_count_results(id,result_number,order_id,result_date,status,created_by) VALUES(?,?,?,?,'Posted',?)")->execute([$resultId,$resultNumber,$id,$date,$actor['id']]);
    }else{
        $pdo->prepare('UPDATE stock_count_orders SET notes=?,revision=revision+1 WHERE id=?')->execute([$notes,$id]);
        $pdo->prepare('DELETE FROM stock_count_result_items WHERE result_id=?')->execute([$resultId]);
    }
    $different=array_filter($newRows,static fn($line)=>($line['variance']??0)!==0);
    if($different){
        if(!$adjustmentId){
            $adjustmentId='SADJ-'.substr(bin2hex(random_bytes(12)),0,24);
            $adjustmentNumber=$simpleNumber($pdo,'stock_adjustments','adjustment_number','ADJ-'.$period.'-');
            $pdo->prepare("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,notes,created_by,posted_by,posted_at) VALUES(?,?,'stock_opname',?,'Posted',?,?,?,NOW())")
                ->execute([$adjustmentId,$adjustmentNumber,$date,'Otomatis dari '.$number,$actor['id'],$actor['id']]);
        }else $pdo->prepare('UPDATE stock_adjustments SET posted_by=?,posted_at=NOW() WHERE id=?')->execute([$actor['id'],$adjustmentId]);
        foreach($different as $line){
            $variance=$line['variance'];
            $pdo->prepare('INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity,target_quantity,stock_before) VALUES(?,?,?,?,?,?,?,?,?)')
                ->execute([$adjustmentId,$line['item_id'],$warehouseId,$line['item_code'],$line['item_name'],$line['unit'],$variance,$line['final_quantity'],$line['system_quantity']]);
            recordStockMovement($pdo,$line['item_id'],$variance<0?$warehouseId:null,$variance>0?$warehouseId:null,abs($variance),'adjustment','stock_opname',$resultId,$resultNumber,'Penyesuaian '.$adjustmentNumber.' dari '.$number,(string)$actor['id'],$date.' 23:59:59');
        }
    }else{
        $pdo->prepare('UPDATE stock_count_results SET adjustment_id=NULL,adjustment_number=NULL WHERE id=?')->execute([$resultId]);
        if($adjustmentId)$pdo->prepare('DELETE FROM stock_adjustments WHERE id=?')->execute([$adjustmentId]);
        $adjustmentId=null;$adjustmentNumber=null;
    }
    $insert=$pdo->prepare('INSERT INTO stock_count_result_items(result_id,item_id,item_code,item_name,category_name,unit,system_quantity,system_version,count_1,final_quantity,variance) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    foreach($newRows as $line)$insert->execute([$resultId,$line['item_id'],$line['item_code'],$line['item_name'],$line['category_name'],$line['unit'],$line['system_quantity'],$line['system_version'],$line['final_quantity'],$line['final_quantity'],$line['variance']]);
    $pdo->prepare("UPDATE stock_count_results SET adjustment_id=?,adjustment_number=?,notes=?,posted_by=?,posted_at=NOW() WHERE id=?")->execute([$adjustmentId,$adjustmentNumber,$notes,$actor['id'],$resultId]);
    $simpleAudit($pdo,$id,$number,(string)$actor['id'],$existing?'update':'create',['before'=>$before,'rows'=>array_values($newRows),'notes'=>$notes,'adjustmentId'=>$adjustmentId,'adjustmentNumber'=>$adjustmentNumber,'requestHash'=>hash('sha256',json_encode($simpleInput))]);
    $pdo->commit();respondSuccess(['id'=>$id,'adjustmentId'=>$adjustmentId,'adjustmentNumber'=>$adjustmentNumber],$different?'Opname disimpan dan penyesuaian diperbarui':'Opname disimpan tanpa selisih stok');
}catch(Throwable $e){
    if($pdo->inTransaction())$pdo->rollBack();
    respondError($e->getMessage(),in_array($e->getCode(),[403,404,409],true)?$e->getCode():422);
}
