<?php
/** Koreksi nilai persediaan: pasangan keluar/masuk, kuantitas bersih selalu nol. */
function ensureInventoryRevaluationSchema(PDO $pdo): void {
    ensureTableColumn($pdo,'stock_adjustments','valuation_revision','INT NOT NULL DEFAULT 0');
    ensureTableColumn($pdo,'stock_adjustments','valuation_account_id','VARCHAR(64) NULL');
    ensureTableColumn($pdo,'stock_adjustments','valuation_request_hash','CHAR(64) NULL');
    foreach ([
        'unit_cost_before'=>'DECIMAL(16,4) NULL', 'value_change'=>'DECIMAL(18,2) NULL',
        'inventory_account_id'=>'VARCHAR(64) NULL', 'adjustment_account_id'=>'VARCHAR(64) NULL',
        'valuation_out_id'=>'VARCHAR(30) NULL', 'valuation_in_id'=>'VARCHAR(30) NULL',
    ] as $column=>$definition) ensureTableColumn($pdo,'stock_adjustment_items',$column,$definition);
    $column=$pdo->query("SHOW COLUMNS FROM stock_movements LIKE 'unit_cost'")->fetch();
    if ($column && preg_match('/decimal\((\d+),(\d+)\)/i',$column['Type'],$parts) && (int)$parts[2]<4) {
        $pdo->exec('ALTER TABLE stock_movements MODIFY unit_cost DECIMAL(19,4) NULL');
    }
}

function valuationDate($value): string {
    $date=is_string($value)?$value:'';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$date,$m) || !checkdate((int)$m[2],(int)$m[3],(int)$m[1]) || $m[1]<'1000' || $date>date('Y-m-d')) {
        throw new InvalidArgumentException('Tanggal penyesuaian HPP harus valid dan tidak melewati hari ini');
    }
    return $date;
}

function valuationText($value,int $max,string $label,bool $required=false): string {
    if (!is_scalar($value) && $value!==null) throw new InvalidArgumentException($label.' tidak valid');
    $text=trim((string)$value);
    if (($required && $text==='') || strlen($text)>$max) throw new InvalidArgumentException($label.' wajib diisi, maksimal '.$max.' karakter');
    return $text;
}

function valuationCost($value,bool $allowZero=false): float {
    if ((!is_string($value) && !is_int($value) && !is_float($value)) || !preg_match('/^\d{1,12}(\.\d{1,4})?$/D',(string)$value)) {
        throw new InvalidArgumentException('HPP harus berupa angka, maksimal 4 desimal');
    }
    $cost=(float)$value;
    if (!$allowZero && $cost<=0) throw new InvalidArgumentException('HPP baru harus lebih dari nol');
    return $cost;
}

function valuationAmount(float $cost,int $quantity): float {
    $amount=round($cost*$quantity,2);
    if (!is_finite($amount) || abs($amount)>999999999999.99) throw new InvalidArgumentException('Nilai persediaan melebihi batas');
    return $amount;
}

function valuationSnapshot(PDO $pdo,string $itemId,string $warehouseId,string $date,bool $lock=false): array {
    $stock=$pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?'.($lock?' FOR UPDATE':''));
    $stock->execute([$warehouseId,$itemId]);
    $quantity=(int)($stock->fetchColumn() ?: 0);
    if ($quantity<=0) throw new InvalidArgumentException('Penyesuaian HPP memerlukan stok tersedia lebih dari nol');
    // Tanpa rekalkulasi transaksi historis, jangan menyisipkan nilai di depan mutasi yang sudah terjadi.
    $later=$pdo->prepare('SELECT id FROM stock_movements WHERE item_id=? AND (source_warehouse_id=? OR destination_warehouse_id=?) AND is_voided=0 AND occurred_at>? LIMIT 1');
    $cutoff=$date===date('Y-m-d')?date('Y-m-d H:i:s'):$date.' 23:59:59';
    $later->execute([$itemId,$warehouseId,$warehouseId,$cutoff]);
    if ($later->fetchColumn()) throw new DomainException('Ada mutasi setelah tanggal penyesuaian. Gunakan tanggal mutasi terakhir atau hari ini.',409);
    return ['stockBefore'=>$quantity,'unitCostBefore'=>round(estimateInventoryUnitCost($pdo,$itemId,$warehouseId,$date),4)];
}

function valuationAccount(PDO $pdo,string $id,array $types,string $label): void {
    $stmt=$pdo->prepare('SELECT a.account_type,a.is_active,EXISTS(SELECT 1 FROM chart_of_accounts c WHERE c.parent_id=a.id) has_children FROM chart_of_accounts a WHERE a.id=? FOR UPDATE');
    $stmt->execute([$id]);$account=$stmt->fetch();
    if (!$account || !$account['is_active'] || $account['has_children'] || !in_array($account['account_type'],$types,true)) {
        throw new InvalidArgumentException($label.' harus berupa akun detail aktif yang sesuai');
    }
}

function normalizeValuation(array $input): array {
    $rows=$input['rows'] ?? null;
    if (!is_array($rows) || !$rows || count($rows)>500) throw new InvalidArgumentException('Isi 1–500 barang penyesuaian HPP');
    $clean=[];
    foreach ($rows as $row) {
        if (!is_array($row)) throw new InvalidArgumentException('Rincian penyesuaian HPP tidak valid');
        $item=valuationText($row['itemId']??'',64,'Barang',true);
        $warehouse=valuationText($row['warehouseId']??'',64,'Gudang',true);
        $key=$item.'|'.$warehouse;
        if (isset($clean[$key])) throw new InvalidArgumentException('Barang dan gudang yang sama cukup dimasukkan satu kali');
        $clean[$key]=[
            'itemId'=>$item,'warehouseId'=>$warehouse,
            'stockBefore'=>parseBoundedDecimalInteger($row['stockBefore']??null,'1','2147483647','Stok tetap'),
            'unitCostBefore'=>valuationCost($row['unitCostBefore']??null,true),
            'unitCost'=>valuationCost($row['unitCost']??null),
            'lineNotes'=>valuationText($row['lineNotes']??'',1000,'Keterangan barang'),
        ];
    }
    ksort($clean,SORT_STRING);
    return ['date'=>valuationDate($input['date']??''),'notes'=>valuationText($input['notes']??'',255,'Keterangan',true),
        'accountId'=>valuationText($input['valuationAccountId']??'',64,'Akun penyesuaian',true),'rows'=>array_values($clean)];
}

function saveValuationLines(PDO $pdo,string $id,array $data,array $authorization): void {
    $warehouses=lockActiveInventoryWarehouses($pdo,array_column($data['rows'],'warehouseId'));
    $items=lockActiveInventoryItems($pdo,array_column($data['rows'],'itemId'));
    valuationAccount($pdo,$data['accountId'],['Expense','Equity'],'Akun penyesuaian');
    $pdo->prepare('DELETE FROM stock_adjustment_items WHERE adjustment_id=?')->execute([$id]);
    $insert=$pdo->prepare('INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity,unit_cost,stock_before,unit_cost_before,value_change,line_notes) VALUES(?,?,?,?,?,?,0,?,?,?,?,?)');
    foreach ($data['rows'] as $line) {
        assertLockedInventoryBranchAccess($authorization,(string)$warehouses[$line['warehouseId']]['branch_id']);
        $snapshot=valuationSnapshot($pdo,$line['itemId'],$line['warehouseId'],$data['date'],true);
        if ($snapshot['stockBefore']!==$line['stockBefore'] || abs($snapshot['unitCostBefore']-$line['unitCostBefore'])>0.00001) {
            throw new DomainException('Stok atau HPP berubah. Buka kembali rincian barang sebelum menyimpan.',409);
        }
        $before=valuationAmount($snapshot['unitCostBefore'],$snapshot['stockBefore']);
        $after=valuationAmount($line['unitCost'],$snapshot['stockBefore']);
        $delta=round($after-$before,2);
        if ($delta==0) throw new InvalidArgumentException('HPP baru harus menghasilkan perubahan nilai persediaan');
        $item=$items[$line['itemId']];
        $insert->execute([$id,$item['id'],$line['warehouseId'],$item['code'],$item['name'],$item['unit'],$line['unitCost'],$snapshot['stockBefore'],$snapshot['unitCostBefore'],$delta,$line['lineNotes']]);
    }
}

function valuationAudit(PDO $pdo,array $actor,array $doc,string $action,string $reason,array $snapshot): void {
    preg_match('/^.{0,255}/us',$reason,$short);
    $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('stock_adjustment',?,?,?,?,?,?,?)")
        ->execute([$doc['id'],$doc['adjustment_number'],$action,$short[0]??'',json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$actor['id'],$actor['name']??'']);
}

function postValuation(PDO $pdo,array $doc,array $lines,array $authorization): void {
    valuationDate($doc['adjustment_date']);
    $warehouses=lockActiveInventoryWarehouses($pdo,array_column($lines,'warehouse_id'));
    lockActiveInventoryItems($pdo,array_column($lines,'item_id'));
    valuationAccount($pdo,$doc['valuation_account_id'],['Expense','Equity'],'Akun penyesuaian');
    $groups=[];
    // Semua validasi sebelum ledger dan jurnal ditulis; seluruh proses berada dalam satu transaksi.
    foreach ($lines as $line) {
        $branch=(string)$warehouses[$line['warehouse_id']]['branch_id'];
        assertLockedInventoryBranchAccess($authorization,$branch);
        $snapshot=valuationSnapshot($pdo,$line['item_id'],$line['warehouse_id'],$doc['adjustment_date'],true);
        if ($snapshot['stockBefore']!==(int)$line['stock_before'] || abs($snapshot['unitCostBefore']-(float)$line['unit_cost_before'])>0.00001) {
            throw new DomainException('Stok atau HPP berubah sejak Draft dibuat. Ubah Draft dan muat ulang rincian barang.',409);
        }
        $inventory=resolveDefaultCoaId($pdo,getDefaultAccountSettings($pdo,$branch),'inventoryCoaId','110401');
        valuationAccount($pdo,$inventory,['Asset'],'Akun persediaan');
        if ($inventory===$doc['valuation_account_id']) throw new InvalidArgumentException('Akun penyesuaian harus berbeda dari akun persediaan');
        $groups[$branch][]=[$line,$inventory];
    }
    $occurred=$doc['adjustment_date']===date('Y-m-d')?date('Y-m-d H:i:s'):$doc['adjustment_date'].' 23:59:59';
    $actor=$authorization['actor'];
    foreach ($groups as $branch=>$entries) {
        $journal=[];
        foreach ($entries as [$line,$inventory]) {
            $qty=(int)$line['stock_before'];$wid=$line['warehouse_id'];$iid=$line['item_id'];
            $out=recordStockMovement($pdo,$iid,$wid,null,$qty,'cost_adjustment','stock_adjustment',$doc['id'],$doc['adjustment_number'],'Penyesuaian HPP: nilai lama',$actor['id'],$occurred,null,$doc['id'],'HPP:'.$line['id'].':OUT',(float)$line['unit_cost_before']);
            $in=recordStockMovement($pdo,$iid,null,$wid,$qty,'cost_adjustment','stock_adjustment',$doc['id'],$doc['adjustment_number'],'Penyesuaian HPP: nilai baru',$actor['id'],$occurred,null,$doc['id'],'HPP:'.$line['id'].':IN',(float)$line['unit_cost']);
            $delta=(float)$line['value_change'];$amount=abs($delta);$account=$doc['valuation_account_id'];
            $journal[]=[$inventory,$delta>0?$amount:0,$delta<0?$amount:0,'Koreksi HPP '.$line['item_code']];
            $journal[]=[$account,$delta<0?$amount:0,$delta>0?$amount:0,'Selisih HPP '.$line['item_code']];
            $pdo->prepare('UPDATE stock_adjustment_items SET inventory_account_id=?,adjustment_account_id=?,valuation_out_id=?,valuation_in_id=? WHERE id=?')->execute([$inventory,$account,$out,$in,$line['id']]);
        }
        postOperationalJournal($pdo,$doc['adjustment_date'],'Penyesuaian HPP '.$doc['adjustment_number'],(string)$branch,'stock_adjustment',$doc['id'],'HPP-'.substr(hash('sha256',(string)$branch),0,20),$journal,$actor['id']);
    }
    $pdo->prepare("UPDATE stock_adjustments SET status='Posted',valuation_revision=valuation_revision+1,posted_by=?,posted_at=NOW() WHERE id=?")->execute([$actor['id'],$doc['id']]);
    valuationAudit($pdo,$actor,$doc,'post',$doc['notes'],['document'=>$doc,'rows'=>$lines]);
}

function cancelValuation(PDO $pdo,array $doc,array $lines,array $authorization,string $reason): void {
    $warehouses=lockActiveInventoryWarehouses($pdo,array_column($lines,'warehouse_id'));
    $actor=$authorization['actor'];$groups=[];
    foreach ($lines as $line) {
        $branch=(string)$warehouses[$line['warehouse_id']]['branch_id'];
        assertLockedInventoryBranchAccess($authorization,$branch);
        $original=$pdo->prepare('SELECT id FROM stock_movements WHERE id=? AND is_voided=0');$original->execute([$line['valuation_in_id']]);
        if (!$original->fetchColumn()) throw new DomainException('Mutasi HPP asli tidak tersedia untuk pembatalan.',409);
        $later=$pdo->prepare('SELECT id FROM stock_movements WHERE item_id=? AND (source_warehouse_id=? OR destination_warehouse_id=?) AND is_voided=0 AND movement_sequence>(SELECT movement_sequence FROM stock_movements WHERE id=?) LIMIT 1');
        $later->execute([$line['item_id'],$line['warehouse_id'],$line['warehouse_id'],$line['valuation_in_id']]);
        if (!$line['valuation_in_id'] || $later->fetchColumn()) throw new DomainException('HPP sudah diikuti transaksi lain. Buat penyesuaian HPP baru untuk mengoreksinya.',409);
        $stock=$pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE item_id=? AND warehouse_id=? FOR UPDATE');
        $stock->execute([$line['item_id'],$line['warehouse_id']]);
        if ((int)$stock->fetchColumn()!==(int)$line['stock_before']) throw new DomainException('Stok telah berubah. Buat penyesuaian HPP baru.',409);
        $groups[$branch][]=$line;
    }
    foreach ($groups as $branch=>$entries) {
        $journal=[];
        foreach ($entries as $line) {
            $qty=(int)$line['stock_before'];$wid=$line['warehouse_id'];$iid=$line['item_id'];
            recordStockMovement($pdo,$iid,$wid,null,$qty,'cost_adjustment_reversal','stock_adjustment',$doc['id'],$doc['adjustment_number'],'Pembatalan penyesuaian HPP',$actor['id'],null,$line['valuation_in_id'],$doc['id'],'HPP:'.$line['id'].':CANCEL_OUT',(float)$line['unit_cost']);
            recordStockMovement($pdo,$iid,null,$wid,$qty,'cost_adjustment_reversal','stock_adjustment',$doc['id'],$doc['adjustment_number'],'Pemulihan HPP sebelumnya',$actor['id'],null,$line['valuation_out_id'],$doc['id'],'HPP:'.$line['id'].':CANCEL_IN',(float)$line['unit_cost_before']);
            $delta=(float)$line['value_change'];$amount=abs($delta);
            $journal[]=[$line['inventory_account_id'],$delta<0?$amount:0,$delta>0?$amount:0,'Pembatalan HPP '.$line['item_code']];
            $journal[]=[$line['adjustment_account_id'],$delta>0?$amount:0,$delta<0?$amount:0,'Pembatalan selisih HPP '.$line['item_code']];
        }
        $key='HPP-'.substr(hash('sha256',(string)$branch),0,20);
        $reversal=postOperationalJournal($pdo,date('Y-m-d'),'Pembatalan HPP '.$doc['adjustment_number'],(string)$branch,'stock_adjustment',$doc['id'],$key.'-REVERSAL',$journal,$actor['id']);
        $original=$pdo->prepare('SELECT journal_id FROM journal_postings WHERE source_type=? AND source_id=? AND posting_key=?');$original->execute(['stock_adjustment',$doc['id'],$key]);
        $pdo->prepare('UPDATE journal_entries SET reversal_of_id=? WHERE id=?')->execute([$original->fetchColumn(),$reversal]);
    }
    $pdo->prepare("UPDATE stock_adjustments SET status='Cancelled',valuation_revision=valuation_revision+1,cancelled_by=?,cancelled_at=NOW(),cancellation_reason=? WHERE id=?")->execute([$actor['id'],$reason,$doc['id']]);
    valuationAudit($pdo,$actor,$doc,'cancel',$reason,['document'=>$doc,'rows'=>$lines]);
}

function handleValuationMutation(PDO $pdo,array $actor,string $method,?string $id,array $input): void {
    $action=$method==='POST'?'create':($method==='DELETE'?'delete':(string)($input['action']??''));
    if (!in_array($action,['create','save','post','cancel','delete'],true)) respondError('Aksi penyesuaian HPP tidak valid',422);
    $pdo->beginTransaction();
    try {
        lockInventoryMutation($pdo);
        $authorization=lockInventoryMutationAuthorization($pdo,$actor,'item:'.($action==='create'?'create':($action==='delete'?'delete':'edit')));
        assertLockedInventoryOwnerOrAdministrator($authorization);$actor=$authorization['actor'];
        if ($action==='create') {
            $data=normalizeValuation($input);
            $request=valuationText($input['requestKey']??'',50,'Identitas permintaan',true);
            if (!preg_match('/^[a-zA-Z0-9_-]{16,50}$/D',$request)) throw new InvalidArgumentException('Identitas permintaan tidak valid');
            $key='HPP-'.strtoupper($request);$hash=hash('sha256',json_encode($data,JSON_THROW_ON_ERROR));
            $existing=$pdo->prepare('SELECT * FROM stock_adjustments WHERE batch_key=? FOR UPDATE');$existing->execute([$key]);$doc=$existing->fetch();
            if ($doc) {
                if ($doc['created_by']!==$actor['id'] || !hash_equals((string)$doc['valuation_request_hash'],$hash)) throw new DomainException('Identitas permintaan sudah dipakai untuk data berbeda',409);
                $lineStmt=$pdo->prepare('SELECT warehouse_id FROM stock_adjustment_items WHERE adjustment_id=?');$lineStmt->execute([$doc['id']]);
                lockInventoryWarehousesForAuthorization($pdo,$authorization,array_column($lineStmt->fetchAll(),'warehouse_id'),'Penyesuaian tidak ditemukan',404);
                $pdo->commit();respondSuccess(['id'=>$doc['id'],'adjustmentNumber'=>$doc['adjustment_number'],'status'=>$doc['status'],'valuationRevision'=>(int)$doc['valuation_revision']],'Draft sudah tersimpan');
            }
            $prefix='ADJ-'.date('ym',strtotime($data['date'])).'-';
            $seq=$pdo->prepare('SELECT adjustment_number FROM stock_adjustments WHERE adjustment_number LIKE ? ORDER BY adjustment_number DESC LIMIT 1 FOR UPDATE');$seq->execute([$prefix.'%']);
            $last=(string)($seq->fetchColumn()?:'');$next=$last===''?1:(int)substr($last,-4)+1;
            if ($next>9999) throw new DomainException('Nomor penyesuaian bulan ini telah penuh',409);
            $number=$prefix.str_pad((string)$next,4,'0',STR_PAD_LEFT);$id='SADJ-'.bin2hex(random_bytes(12));
            $pdo->prepare("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,batch_key,notes,created_by,valuation_account_id,valuation_request_hash) VALUES(?,?,'cost_adjustment',?,'Draft',?,?,?,?,?)")
                ->execute([$id,$number,$data['date'],$key,$data['notes'],$actor['id'],$data['accountId'],$hash]);
            saveValuationLines($pdo,$id,$data,$authorization);
            valuationAudit($pdo,$actor,['id'=>$id,'adjustment_number'=>$number],'create',$data['notes'],$data);
        } else {
            $stmt=$pdo->prepare('SELECT * FROM stock_adjustments WHERE id=? FOR UPDATE');$stmt->execute([$id]);$doc=$stmt->fetch();
            if (!$doc || $doc['adjustment_type']!=='cost_adjustment') throw new DomainException('Penyesuaian HPP tidak ditemukan',404);
            $stmt=$pdo->prepare('SELECT * FROM stock_adjustment_items WHERE adjustment_id=? ORDER BY id FOR UPDATE');$stmt->execute([$id]);$lines=$stmt->fetchAll();
            lockInventoryWarehousesForAuthorization($pdo,$authorization,array_column($lines,'warehouse_id'),'Penyesuaian HPP tidak ditemukan',404);
            if (lockStockOpnameResultForAdjustment($pdo,$id)) throw new DomainException('Dokumen terhubung ke stok opname',409);
            if (!(($action==='post' && $doc['status']==='Posted') || ($action==='cancel' && $doc['status']==='Cancelled'))) {
                $revision=parseBoundedDecimalInteger($input['valuationRevision']??null,'0','2147483646','Versi dokumen');
                if ($revision!==(int)$doc['valuation_revision']) throw new DomainException('Dokumen berubah. Muat ulang sebelum melanjutkan.',409);
                if ($action==='save') {
                    if ($doc['status']!=='Draft') throw new DomainException('Hanya Draft yang dapat diubah',409);
                    $data=normalizeValuation($input);saveValuationLines($pdo,$id,$data,$authorization);
                    $pdo->prepare('UPDATE stock_adjustments SET adjustment_date=?,notes=?,valuation_account_id=?,valuation_revision=valuation_revision+1 WHERE id=?')->execute([$data['date'],$data['notes'],$data['accountId'],$id]);
                    valuationAudit($pdo,$actor,$doc,'edit',$data['notes'],['before'=>$doc,'after'=>$data]);
                } elseif ($action==='delete') {
                    if ($doc['status']!=='Draft') throw new DomainException('Penyesuaian HPP terposting tidak dapat dihapus. Gunakan pembatalan dengan alasan.',409);
                    valuationAudit($pdo,$actor,$doc,'delete','Hapus Draft HPP',['document'=>$doc,'rows'=>$lines]);
                    $pdo->prepare('DELETE FROM stock_adjustment_items WHERE adjustment_id=?')->execute([$id]);
                    $pdo->prepare('DELETE FROM stock_adjustments WHERE id=?')->execute([$id]);
                    $pdo->commit();respondSuccess(null,'Draft penyesuaian HPP dihapus');
                } elseif ($action==='post') {
                    if ($doc['status']!=='Draft' || !$lines) throw new DomainException('Hanya Draft berisi barang yang dapat diposting',409);
                    postValuation($pdo,$doc,$lines,$authorization);
                } else {
                    if ($doc['status']!=='Posted') throw new DomainException('Hanya penyesuaian terposting yang dapat dibatalkan',409);
                    cancelValuation($pdo,$doc,$lines,$authorization,valuationText($input['reason']??'',255,'Alasan pembatalan',true));
                }
            }
        }
        $stmt=$pdo->prepare('SELECT * FROM stock_adjustments WHERE id=?');$stmt->execute([$id]);$result=$stmt->fetch();
        $pdo->commit();
        respondSuccess(['id'=>$id,'adjustmentNumber'=>$result['adjustment_number'],'status'=>$result['status'],'valuationRevision'=>(int)$result['valuation_revision']],$action==='post'?'HPP diperbarui; jumlah stok tetap':($action==='cancel'?'Penyesuaian HPP dibatalkan; jumlah stok tetap':'Draft penyesuaian HPP disimpan'));
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack();respondError($error->getMessage(),transactionExceptionStatus($error,422)); }
}
