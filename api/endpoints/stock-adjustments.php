<?php
$actor = requireAuthenticatedUser($pdo);
$roleStmt = $pdo->prepare("SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1");
$roleStmt->execute([$actor['role_id'] ?? '']);
$role = $roleStmt->fetch();
$isAdmin = !empty($actor['is_owner']) || strtoupper((string)($role['code'] ?? '')) === 'ADM' || strtolower((string)($role['name'] ?? '')) === 'administrator';
if (!$isAdmin) respondError('Penyesuaian stok hanya tersedia untuk Owner dan Administrator', 403);

$mapDocument = function(array $row): array {
    return [
        'id' => $row['id'], 'adjustmentNumber' => $row['adjustment_number'],
        'adjustmentType' => $row['adjustment_type'], 'date' => $row['adjustment_date'],
        'status' => $row['status'], 'notes' => $row['notes'] ?? '',
        'itemCount' => (int)($row['item_count'] ?? 0),
        'totalQuantity' => (int)($row['total_quantity'] ?? 0),
        'cancellationReason' => $row['cancellation_reason'] ?? null,
        'createdAt' => $row['created_at'], 'postedAt' => $row['posted_at'] ?? null,
        'cancelledAt' => $row['cancelled_at'] ?? null,
    ];
};

if ($method === 'GET') {
    if ($id) {
        $stmt = $pdo->prepare("SELECT * FROM stock_adjustments WHERE id=?"); $stmt->execute([$id]);
        $document = $stmt->fetch(); if (!$document) respondError('Penyesuaian stok tidak ditemukan', 404);
        $lineStmt = $pdo->prepare("SELECT sai.*,w.name warehouse_name FROM stock_adjustment_items sai JOIN warehouses w ON w.id=sai.warehouse_id WHERE adjustment_id=? ORDER BY sai.id");
        $lineStmt->execute([$id]); $lines = $lineStmt->fetchAll();
        foreach ($lines as &$line) { $line = ['id'=>$line['id'],'itemId'=>$line['item_id'],'itemCode'=>$line['item_code'],'itemName'=>$line['item_name'],'warehouseId'=>$line['warehouse_id'],'warehouseName'=>$line['warehouse_name'],'quantity'=>(int)$line['quantity'],'unit'=>$line['unit']]; }
        $payload = $mapDocument($document); $payload['rows'] = $lines; respondSuccess($payload);
    }
    $rows = $pdo->query("SELECT sa.*,
        (SELECT COUNT(*) FROM stock_adjustment_items sai WHERE sai.adjustment_id=sa.id) item_count,
        (SELECT COALESCE(SUM(sai.quantity),0) FROM stock_adjustment_items sai WHERE sai.adjustment_id=sa.id) total_quantity
        FROM stock_adjustments sa
        ORDER BY sa.adjustment_date DESC,sa.created_at DESC LIMIT 250")->fetchAll();
    respondSuccess(array_map($mapDocument, $rows));
}

$d = getInput();
if ($method === 'POST') {
    $rows = is_array($d['rows'] ?? null) ? $d['rows'] : []; $date = (string)($d['date'] ?? date('Y-m-d'));
    $batchKey = preg_replace('/[^A-Z0-9_-]/', '', strtoupper((string)($d['batchKey'] ?? '')));
    if (!$rows || count($rows) > 5000 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) respondError('Data penyesuaian stok tidak valid', 422);
    $warehouseStmt = $pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id=?");
    $itemStmt = $pdo->prepare("SELECT id,code,name,unit,type,is_active FROM items WHERE id=?");
    $pdo->beginTransaction();
    try {
        $period = date('ym', strtotime($date));
        $seqStmt = $pdo->prepare("SELECT adjustment_number FROM stock_adjustments WHERE adjustment_number LIKE ? ORDER BY adjustment_number DESC LIMIT 1 FOR UPDATE");
        $seqStmt->execute(['ADJ-'.$period.'-%']); $last = (string)($seqStmt->fetchColumn() ?: '');
        $sequence = preg_match('/(\d{4})$/', $last, $match) ? ((int)$match[1] + 1) : 1;
        $number = 'ADJ-'.$period.'-'.str_pad((string)$sequence, 4, '0', STR_PAD_LEFT);
        $documentId = 'SADJ-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)), 0, 8);
        $pdo->prepare("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,batch_key,notes,created_by) VALUES(?,?,'opening_balance',?,'Draft',?,?,?)")
            ->execute([$documentId,$number,$date,$batchKey ?: null,(string)($d['notes'] ?? ''),$actor['id']]);
        $lineInsert = $pdo->prepare("INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity) VALUES(?,?,?,?,?,?,?)");
        $seen = [];
        foreach ($rows as $index => $input) {
            $itemId=(string)($input['itemId']??''); $warehouseId=(string)($input['warehouseId']??''); $quantity=(int)($input['quantity']??0);
            if ($quantity === 0) continue; $key=$itemId.'|'.$warehouseId; if(isset($seen[$key])) throw new InvalidArgumentException('Barang dan gudang terduplikasi pada baris '.($index+1)); $seen[$key]=true;
            $warehouseStmt->execute([$warehouseId]); $warehouse=$warehouseStmt->fetch(); if(!$warehouse || !(bool)$warehouse['is_active']) throw new InvalidArgumentException('Gudang baris '.($index+1).' tidak valid'); requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);
            $itemStmt->execute([$itemId]); $item=$itemStmt->fetch(); if(!$item || $item['type']!=='Persediaan' || !(bool)$item['is_active']) throw new InvalidArgumentException('Barang baris '.($index+1).' tidak valid');
            $lineInsert->execute([$documentId,$itemId,$warehouseId,$item['code'],$item['name'],$item['unit']??'',$quantity]);
        }
        if (!$seen) throw new InvalidArgumentException('Tidak ada rincian penyesuaian yang dapat disimpan');
        $pdo->commit(); respondSuccess(['id'=>$documentId,'adjustmentNumber'=>$number,'status'=>'Draft'],'Penyesuaian stok disimpan sebagai Draft');
    } catch (Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); $code = str_contains(strtolower($e->getMessage()), 'duplicate') ? 409 : 422; respondError($e->getMessage(),$code); }
}

if ($method === 'PUT' && $id) {
    $requestedAction = (string)($d['action'] ?? '');
    if (!in_array($requestedAction,['save','post','cancel'],true)) respondError('Aksi penyesuaian tidak valid',422);
    $pdo->beginTransaction();
    try {
        $docStmt=$pdo->prepare("SELECT * FROM stock_adjustments WHERE id=? FOR UPDATE"); $docStmt->execute([$id]); $doc=$docStmt->fetch(); if(!$doc) throw new InvalidArgumentException('Penyesuaian stok tidak ditemukan');
        if($requestedAction==='save') {
            if($doc['status']!=='Draft') throw new InvalidArgumentException('Hanya Draft yang dapat diubah');
            $rows=is_array($d['rows']??null)?$d['rows']:[]; $date=(string)($d['date']??$doc['adjustment_date']); if(!$rows||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)) throw new InvalidArgumentException('Data Draft tidak valid');
            $warehouseStmt=$pdo->prepare("SELECT id,branch_id,is_active FROM warehouses WHERE id=?"); $itemStmt=$pdo->prepare("SELECT id,code,name,unit,type,is_active FROM items WHERE id=?");
            $pdo->prepare("DELETE FROM stock_adjustment_items WHERE adjustment_id=?")->execute([$id]); $lineInsert=$pdo->prepare("INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity) VALUES(?,?,?,?,?,?,?)"); $seen=[];
            foreach($rows as $index=>$input){$itemId=(string)($input['itemId']??'');$warehouseId=(string)($input['warehouseId']??'');$quantity=(int)($input['quantity']??0);if($quantity===0)continue;$key=$itemId.'|'.$warehouseId;if(isset($seen[$key]))throw new InvalidArgumentException('Barang dan gudang terduplikasi pada baris '.($index+1));$seen[$key]=true;$warehouseStmt->execute([$warehouseId]);$warehouse=$warehouseStmt->fetch();if(!$warehouse||!(bool)$warehouse['is_active'])throw new InvalidArgumentException('Gudang tidak valid');requireAccessibleBranch($pdo,$actor,(string)$warehouse['branch_id']);$itemStmt->execute([$itemId]);$item=$itemStmt->fetch();if(!$item||$item['type']!=='Persediaan'||!(bool)$item['is_active'])throw new InvalidArgumentException('Barang tidak valid');$lineInsert->execute([$id,$itemId,$warehouseId,$item['code'],$item['name'],$item['unit']??'',$quantity]);}
            if(!$seen)throw new InvalidArgumentException('Rincian Draft tidak boleh kosong');$pdo->prepare("UPDATE stock_adjustments SET adjustment_date=?,notes=? WHERE id=?")->execute([$date,(string)($d['notes']??$doc['notes']),$id]);$pdo->commit();respondSuccess(['status'=>'Draft'],'Draft penyesuaian stok diperbarui');
        }
        if($requestedAction==='post' && $doc['status']!=='Draft') throw new InvalidArgumentException('Hanya Draft yang dapat diposting');
        if($requestedAction==='cancel' && $doc['status']!=='Posted') throw new InvalidArgumentException('Hanya dokumen Diposting yang dapat dibatalkan');
        $reason=trim((string)($d['reason']??'')); if($requestedAction==='cancel' && $reason==='') throw new InvalidArgumentException('Alasan pembatalan wajib diisi');
        $lineStmt=$pdo->prepare("SELECT sai.*,w.branch_id FROM stock_adjustment_items sai JOIN warehouses w ON w.id=sai.warehouse_id WHERE sai.adjustment_id=?"); $lineStmt->execute([$id]); $lines=$lineStmt->fetchAll(); if(!$lines) throw new InvalidArgumentException('Rincian penyesuaian kosong');
        foreach($lines as $line){ requireAccessibleBranch($pdo,$actor,(string)$line['branch_id']); $original=(int)$line['quantity']; $delta=$requestedAction==='post'?$original:-$original; adjustWarehouseStockAllowNegative($pdo,$line['warehouse_id'],$line['branch_id'],$line['item_id'],$delta);
            $source=$delta<0?$line['warehouse_id']:null; $destination=$delta>0?$line['warehouse_id']:null; $movementId='MOV-'.date('ymdHis').'-'.substr(bin2hex(random_bytes(4)),0,8); $note=($requestedAction==='post'?'STOCK_ADJUSTMENT:':'CANCEL_STOCK_ADJUSTMENT:').$doc['adjustment_number'].($reason?' '.$reason:'');
            if($requestedAction==='post') {
                $pdo->prepare("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_by,created_at) VALUES(?,?,?,?,?,'adjustment',?,?,CONCAT(?,' 00:00:00'))")
                    ->execute([$movementId,$line['item_id'],$source,$destination,abs($delta),$note,$actor['id'],$doc['adjustment_date']]);
            } else {
                $pdo->prepare("INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,notes,created_by) VALUES(?,?,?,?,?,'adjustment',?,?)")
                    ->execute([$movementId,$line['item_id'],$source,$destination,abs($delta),$note,$actor['id']]);
            }
        }
        if($requestedAction==='post') $pdo->prepare("UPDATE stock_adjustments SET status='Posted',posted_by=?,posted_at=NOW() WHERE id=?")->execute([$actor['id'],$id]);
        else $pdo->prepare("UPDATE stock_adjustments SET status='Cancelled',cancelled_by=?,cancelled_at=NOW(),cancellation_reason=? WHERE id=?")->execute([$actor['id'],$reason,$id]);
        $pdo->commit(); respondSuccess(['status'=>$requestedAction==='post'?'Posted':'Cancelled'],$requestedAction==='post'?'Penyesuaian stok berhasil diposting':'Penyesuaian stok dibatalkan dan stok telah dibalik');
    } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}

if ($method === 'DELETE' && $id) {
    $pdo->beginTransaction();
    try {
        $stmt=$pdo->prepare("SELECT * FROM stock_adjustments WHERE id=? FOR UPDATE");
        $stmt->execute([$id]); $doc=$stmt->fetch();
        if(!$doc) throw new InvalidArgumentException('Penyesuaian stok tidak ditemukan');

        $reason=trim((string)($d['reason']??''));

        $lineStmt=$pdo->prepare("SELECT sai.*,w.branch_id,w.name warehouse_name FROM stock_adjustment_items sai JOIN warehouses w ON w.id=sai.warehouse_id WHERE sai.adjustment_id=? ORDER BY sai.id");
        $lineStmt->execute([$id]); $lines=$lineStmt->fetchAll();
        foreach($lines as $line) requireAccessibleBranch($pdo,$actor,(string)$line['branch_id']);

        // Dokumen Posted masih memengaruhi stok sehingga harus dibalik satu kali.
        // Dokumen Cancelled sudah pernah dibalik oleh proses pembatalan.
        if($doc['status']==='Posted') {
            foreach($lines as $line) {
                adjustWarehouseStockAllowNegative($pdo,$line['warehouse_id'],$line['branch_id'],$line['item_id'],-(int)$line['quantity']);
            }
        }

        $markers=['STOCK_ADJUSTMENT:'.$doc['adjustment_number'],'CANCEL_STOCK_ADJUSTMENT:'.$doc['adjustment_number']];
        if(!empty($doc['batch_key'])) $markers[]='OPENING_BALANCE:'.$doc['batch_key'];
        $movementRows=[];
        foreach($markers as $marker) {
            $movementStmt=$pdo->prepare("SELECT * FROM stock_movements WHERE notes=? OR notes LIKE CONCAT(?,' %') FOR UPDATE");
            $movementStmt->execute([$marker,$marker]);
            $movementRows=array_merge($movementRows,$movementStmt->fetchAll());
        }
        $snapshot=json_encode(['document'=>$doc,'items'=>$lines,'movements'=>$movementRows],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $pdo->prepare("INSERT INTO stock_adjustment_maintenance_logs(adjustment_id,adjustment_number,previous_status,reason,snapshot_json,deleted_by,deleted_by_name) VALUES(?,?,?,?,?,?,?)")
            ->execute([$id,$doc['adjustment_number'],$doc['status'],$reason?:'Dihapus oleh pengguna',$snapshot?:null,$actor['id']??null,$actor['name']??$actor['username']??null]);
        foreach($markers as $marker) {
            $pdo->prepare("DELETE FROM stock_movements WHERE notes=? OR notes LIKE CONCAT(?,' %')")->execute([$marker,$marker]);
        }
        $pdo->prepare("DELETE FROM stock_adjustment_items WHERE adjustment_id=?")->execute([$id]);
        $pdo->prepare("DELETE FROM stock_adjustments WHERE id=?")->execute([$id]);
        $pdo->commit();
        respondSuccess(null,$doc['status']==='Draft'?'Draft penyesuaian stok dihapus':'Penyesuaian stok dihapus dan dampak stok dikoreksi otomatis.');
    } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError($e->getMessage(),422);}
}
respondError('Method not allowed',405);
