<?php
ensureTableColumn($pdo,'goods_receipts','warehouse_id','VARCHAR(20) NULL AFTER branch_id');
ensureTableColumn($pdo,'goods_receipts','received_by_id','VARCHAR(64) NULL AFTER received_by');
ensureTableColumn($pdo,'goods_receipts','delivery_method',"VARCHAR(40) NOT NULL DEFAULT 'Diantar Supplier' AFTER do_number");
ensureTableColumn($pdo,'goods_receipts','delivery_other','VARCHAR(100) NULL AFTER delivery_method');
ensureTableColumn($pdo,'goods_receipts','shipping_notes','VARCHAR(500) NULL AFTER delivery_other');
ensureTableColumn($pdo,'goods_receipts','source_type',"VARCHAR(30) NOT NULL DEFAULT 'Supplier' AFTER shipping_notes");
ensureTableColumn($pdo,'goods_receipts','source_warehouse_id','VARCHAR(20) NULL AFTER source_type');
ensureTableColumn($pdo,'goods_receipts','source_branch_id','VARCHAR(20) NULL AFTER source_warehouse_id');
ensureTableColumn($pdo,'goods_receipts','transfer_number','VARCHAR(40) NULL AFTER source_branch_id');
ensureTableColumn($pdo,'goods_receipt_items','unit_price','DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER qty_invoiced');
ensureTableColumn($pdo,'goods_receipt_items','discount_percent','DECIMAL(8,4) NOT NULL DEFAULT 0 AFTER unit_price');
ensureTableColumn($pdo,'goods_receipt_items','discount_amount','DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER discount_percent');
ensureTableColumn($pdo,'goods_receipt_items','subtotal','DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER discount_amount');
ensureTableColumn($pdo,'goods_receipt_items','technician_id','VARCHAR(64) NULL AFTER subtotal');
ensureTableColumn($pdo,'goods_receipt_items','technician_name','VARCHAR(160) NULL AFTER technician_id');
ensureTableColumn($pdo,'goods_receipt_items','line_notes','VARCHAR(500) NULL AFTER technician_name');
ensureTableColumn($pdo,'goods_receipt_items','is_deferred','TINYINT(1) NOT NULL DEFAULT 0 AFTER line_notes');
ensureTableColumn($pdo,'goods_receipt_items','defer_reason','VARCHAR(255) NULL AFTER is_deferred');
ensureTableColumn($pdo,'goods_receipt_items','defer_until','DATE NULL AFTER defer_reason');
function nextManualTransferNumber(PDO $pdo,string $sourceBranchId,string $destinationBranchId,string $date):string{
    $stmt=$pdo->prepare("SELECT code FROM branches WHERE id=?");$stmt->execute([$sourceBranchId]);$sourceCode=(string)$stmt->fetchColumn();$stmt->execute([$destinationBranchId]);$destinationCode=(string)$stmt->fetchColumn();
    $sourceLetter=substr(preg_replace('/[^A-Z0-9]/','',strtoupper($sourceCode)),0,1)?:'X';$destinationLetter=substr(preg_replace('/[^A-Z0-9]/','',strtoupper($destinationCode)),0,1)?:'X';
    $prefix='TRF-'.$sourceLetter.'-'.$destinationLetter.'-'.date('ymd',strtotime($date)).'-';$seq=$pdo->prepare("SELECT transfer_number FROM goods_receipts WHERE transfer_number LIKE ? ORDER BY transfer_number DESC LIMIT 1 FOR UPDATE");$seq->execute([$prefix.'%']);$last=(string)$seq->fetchColumn();$number=$last?(int)substr($last,-4)+1:1;return $prefix.str_pad((string)$number,4,'0',STR_PAD_LEFT);
}
function canSeeReceiptSupplier(PDO $pdo,array $actor):bool{
    if(!empty($actor['is_owner']))return true;
    $stmt=$pdo->prepare('SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1');$stmt->execute([(string)($actor['role_id']??'')]);$role=$stmt->fetch()?:[];
    return strtoupper(trim((string)($role['code']??'')))==='ADM'||strtolower(trim((string)($role['name']??'')))==='administrator';
}
function normalizeGoodsReceiptDelivery(array $data,string $fallbackMethod='Diantar Supplier',string $fallbackOther=''):array{
    $method=trim((string)($data['deliveryMethod']??$fallbackMethod));
    $other=trim((string)($data['deliveryOther']??$fallbackOther));
    if($method==='Lainnya'&&$other==='')throw new InvalidArgumentException('Tuliskan cara pengiriman lainnya');
    if(mb_strlen($other)>100)throw new InvalidArgumentException('Cara pengiriman lainnya maksimal 100 karakter');
    return[$method,$other];
}
$journalReceipt = static function(PDO $pdo,array $row,string $itemId,int $qty,bool $reverse,array $actor,?string $correctionGroupId=null,?string $reversalOfId=null,?string $idempotencyKey=null,?float $unitCost=null):string{
    $warehouseId=(string)($row['warehouse_id']??'');
    if($warehouseId===''&&!empty($row['branch_id']))$warehouseId=defaultWarehouseId($pdo,(string)$row['branch_id']);
    $isTransfer=(string)($row['source_type']??'Supplier')==='Transfer Gudang'&&!empty($row['source_warehouse_id']);
    $source=$isTransfer?(string)$row['source_warehouse_id']:null;
    $destination=$warehouseId;
    if($reverse){[$source,$destination]=[$destination,$source];}
    return recordStockMovement(
        $pdo,$itemId,$source,$destination,abs($qty),$reverse?'reversal':($isTransfer?'transfer':'receipt'),
        'goods_receipt',(string)$row['id'],(string)$row['receipt_number'],
        ($reverse?'Pembalik ':'').($isTransfer?'Transfer penerimaan ':'Penerimaan ').$row['receipt_number'],
        (string)($actor['id']??''),((string)($row['date']??date('Y-m-d'))).' 12:00:00',
        $reversalOfId,$correctionGroupId,$idempotencyKey,$unitCost
    );
};
switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $canSeeSuppliers=canSeeReceiptSupplier($pdo,$actor);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = array_values(array_filter(
            $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC, receipt_number DESC")->fetchAll(),
            fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])
        ));
        foreach ($rows as &$r) {
            $r['receiptNumber'] = $r['receipt_number'];
            $r['supplierId'] = $canSeeSuppliers ? $r['supplier_id'] : '';
            $r['supplierName'] = $canSeeSuppliers ? $r['supplier_name'] : '';
            $r['doNumber'] = $r['do_number'];
            $r['deliveryMethod'] = $r['delivery_method'] ?? 'Diantar Supplier';
            $r['deliveryOther'] = $r['delivery_other'] ?? '';
            $r['shippingNotes'] = $r['shipping_notes'] ?? '';
            $r['sourceType'] = $r['source_type'] ?? 'Supplier';
            $r['sourceWarehouseId'] = $r['source_warehouse_id'] ?? null;
            $r['sourceBranchId'] = $r['source_branch_id'] ?? null;
            $r['transferNumber'] = $r['transfer_number'] ?? null;
            $r['branchId'] = $r['branch_id'];
            $r['warehouseId'] = $r['warehouse_id'];
            $r['receivedBy'] = $r['received_by'];
            $r['receivedById'] = $r['received_by_id'];
            $r['createdAt'] = $r['created_at'];
            // Load items
            $stmt = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $stmt->execute([$r['id']]);
            $items = $stmt->fetchAll();
            $r['items'] = array_map(function($i) {
                return [
                    'id' => (string)$i['id'],
                    'itemId' => $i['item_id'],
                    'itemCode' => $i['item_code'],
                    'itemName' => $i['item_name'],
                    'qty' => (int)$i['qty'],
                    'unit' => $i['unit'],
                    'qtyInvoiced' => (int)$i['qty_invoiced'],
                    'unitPrice' => (float)($i['unit_price'] ?? 0),
                    'discountPercent' => (float)($i['discount_percent'] ?? 0),
                    'discountAmount' => (float)($i['discount_amount'] ?? 0),
                    'subtotal' => (float)($i['subtotal'] ?? 0),
                    'technicianId' => $i['technician_id'] ?? '',
                    'technicianName' => $i['technician_name'] ?? '',
                    'lineNotes' => $i['line_notes'] ?? '',
                    'isDeferred' => (bool)($i['is_deferred'] ?? false),
                    'deferReason' => $i['defer_reason'] ?? '',
                    'deferUntil' => $i['defer_until'] ?? '',
                ];
            }, $items);
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $branchId = (string)($d['branchId'] ?? '');
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        requireAccessibleBranch($pdo, $actor, $branchId);
        assertActiveBranch($pdo, $branchId);
        $warehouseId = (string)($d['warehouseId'] ?? '');
        if ($warehouseId === '') respondError('Gudang tujuan wajib dipilih', 422);
        $warehouseCheck=$pdo->prepare("SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=1");$warehouseCheck->execute([$warehouseId,$branchId]);
        if(!$warehouseCheck->fetch())respondError('Gudang tujuan tidak valid',422);
        $sourceType=(string)($d['sourceType']??'Supplier');
        if(!in_array($sourceType,['Supplier','Transfer Gudang'],true))respondError('Sumber barang tidak valid',422);
        $sourceWarehouseId=null;$sourceBranchId=null;
        if($sourceType==='Transfer Gudang'){
            $sourceWarehouseId=(string)($d['sourceWarehouseId']??'');if($sourceWarehouseId===''||$sourceWarehouseId===$warehouseId)respondError('Gudang asal transfer wajib dipilih dan berbeda dari gudang tujuan',422);
            $sourceCheck=$pdo->prepare("SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=1");$sourceCheck->execute([$sourceWarehouseId]);$sourceWarehouse=$sourceCheck->fetch();if(!$sourceWarehouse)respondError('Gudang asal tidak valid',422);$sourceBranchId=(string)$sourceWarehouse['branch_id'];requireAccessibleBranch($pdo,$actor,$sourceBranchId);
        }
        $supplier = null;
        if (canSeeReceiptSupplier($pdo,$actor) && !empty($d['supplierId'])) {
            $supplierCheck = $pdo->prepare("SELECT id,name FROM suppliers WHERE id=? AND is_active=1");
            $supplierCheck->execute([$d['supplierId']]);$supplier=$supplierCheck->fetch();
            if (!$supplier) respondError('Supplier tidak ditemukan atau nonaktif', 422);
        }
        if (empty($d['items']) || !is_array($d['items'])) respondError('Tambahkan minimal satu barang', 422);
        $receiverId=(string)($d['receivedById']??($actor['id']??''));$receiverStmt=$pdo->prepare("SELECT id,name,branch_id,is_active,is_owner FROM users WHERE id=? LIMIT 1");$receiverStmt->execute([$receiverId]);$receiver=$receiverStmt->fetch();if(!$receiver||!(bool)$receiver['is_active'])respondError('Petugas penerima tidak valid',422);
        $receiverBranches=getUserBranchIds($pdo,$receiverId);if(!empty($receiver['branch_id']))$receiverBranches[]=(string)$receiver['branch_id'];$receiverBranches=array_values(array_unique($receiverBranches));if(!in_array($branchId,$receiverBranches,true)&&empty($receiver['is_owner']))respondError('Petugas penerima tidak bertugas di cabang tujuan',422);
        $newStatus = (string)($d['status'] ?? 'Draft');
        if (!in_array($newStatus, ['Draft', 'Diterima'], true)) respondError('Status awal penerimaan tidak valid', 422);
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $delegatedUserIds=array_merge([$receiverId],array_column($d['items'],'technicianId'));
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'receipt:create',$delegatedUserIds);
            $actor=$authorization['actor'];
            $lockedWarehouseMap=lockActiveInventoryWarehouses($pdo,array_filter([$warehouseId,$sourceWarehouseId]));
            if((string)$lockedWarehouseMap[$warehouseId]['branch_id']!==$branchId)throw new InvalidArgumentException('Gudang tujuan tidak lagi berada di cabang yang dipilih');
            assertLockedInventoryBranchAccess($authorization,$branchId);
            if($sourceType==='Transfer Gudang'){
                $sourceBranchId=(string)$lockedWarehouseMap[$sourceWarehouseId]['branch_id'];
                assertLockedInventoryBranchAccess($authorization,$sourceBranchId);
            }
            $receiver=lockedInventoryDelegatedUserForBranch($authorization,$receiverId,$branchId,'Petugas penerima');
            $lockedItems=lockActiveInventoryItems($pdo,array_column($d['items'],'itemId'));
            [$deliveryMethod,$deliveryOther]=normalizeGoodsReceiptDelivery($d);
            $rId = $d['id'] ?? generateId();
            // Nomor dari browser hanya pratinjau. Nomor final wajib diambil dari
            // antrian server supaya dua HP atau data yang belum tersinkron tidak
            // pernah membuat receipt_number yang sama.
            $receiptNumber = nextGoodsReceiptNumber($pdo, $branchId, (string)($d['date'] ?? ''));
            $transferNumber=$sourceType==='Transfer Gudang'?nextManualTransferNumber($pdo,$sourceBranchId,$branchId,(string)$d['date']):null;
            $stmt = $pdo->prepare("INSERT INTO goods_receipts (id,receipt_number,date,supplier_id,supplier_name,do_number,delivery_method,delivery_other,shipping_notes,source_type,source_warehouse_id,source_branch_id,transfer_number,status,notes,branch_id,warehouse_id,received_by,received_by_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([
                $rId, $receiptNumber, $d['date'],
                $sourceType==='Supplier'?($supplier['id'] ?? null):null, $sourceType==='Supplier'?($supplier['name'] ?? ''):'', $d['doNumber'] ?? '', $deliveryMethod, $deliveryOther, $d['shippingNotes'] ?? '', $sourceType,$sourceWarehouseId,$sourceBranchId,$transferNumber,
                $newStatus, $d['notes'] ?? '',
                $branchId,$warehouseId,$receiver['name'],$receiver['id']
            ]);

            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id,item_id,item_code,item_name,qty,unit,qty_invoiced,unit_price,discount_percent,discount_amount,subtotal,technician_id,technician_name,line_notes,is_deferred,defer_reason,defer_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
                $seenItems = [];
                foreach ($d['items'] as $lineIndex=>$i) {
                    $item = $lockedItems[(string)($i['itemId'] ?? '')]??null;
                    $qty=parseBoundedDecimalInteger($i['qty']??null,'1','2147483647','Kuantitas penerimaan baris '.($lineIndex+1));
                    $d['items'][$lineIndex]['qty']=$qty;
                    if (!$item || $item['type'] !== 'Persediaan' || $qty <= 0) throw new InvalidArgumentException('Penerimaan hanya boleh berisi barang persediaan aktif dengan qty lebih dari 0');
                    if (isset($seenItems[(string)$i['itemId']])) throw new InvalidArgumentException('Barang yang sama tidak boleh diduplikasi dalam satu penerimaan');
                    $seenItems[(string)$i['itemId']] = true;
                    $unitPrice=max(0,(float)($i['unitPrice']??0));$discountPercent=min(100,max(0,(float)($i['discountPercent']??0)));$gross=$qty*$unitPrice;$discountAmount=min($gross,max(0,(float)($i['discountAmount']??($gross*$discountPercent/100))));$subtotal=max(0,$gross-$discountAmount);
                    $technicianId=trim((string)($i['technicianId']??''));$technicianName='';if($technicianId!==''){$technician=lockedInventoryDelegatedUser($authorization,$technicianId,'Petugas/teknisi rincian');$technicianName=(string)$technician['name'];}
                    $isDeferred=!empty($i['isDeferred']);$deferReason=trim((string)($i['deferReason']??''));$deferUntil=trim((string)($i['deferUntil']??''))?:null;if($isDeferred&&$deferReason==='')throw new InvalidArgumentException('Alasan penangguhan wajib diisi');
                    $iStmt->execute([$rId,$i['itemId'],$item['code'],$item['name'],$qty,$item['unit'],0,$unitPrice,$discountPercent,$discountAmount,$subtotal,$technicianId?:null,$technicianName?:null,trim((string)($i['lineNotes']??'')),$isDeferred?1:0,$isDeferred?$deferReason:null,$isDeferred?$deferUntil:null]);
                }
            }

            // Auto-increment stock jika status Diterima
            if ($newStatus === 'Diterima' && !empty($d['items'])) {
                foreach ($d['items'] as $i) {
                    if($sourceType==='Transfer Gudang')adjustWarehouseStock($pdo,$sourceWarehouseId,$sourceBranchId,$i['itemId'],-$i['qty']);
                    adjustWarehouseStockAllowNegative($pdo,$warehouseId,$branchId,$i['itemId'],$i['qty']);
                    $journalReceipt($pdo,['id'=>$rId,'receipt_number'=>$receiptNumber,'date'=>$d['date'],'warehouse_id'=>$warehouseId,'source_type'=>$sourceType,'source_warehouse_id'=>$sourceWarehouseId],(string)$i['itemId'],$i['qty'],false,$actor,'POST-'.$rId,null,'goods_receipt:'.$rId.':'.$i['itemId'].':post',max(0,(float)($i['unitPrice']??0)));
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $rId, 'receiptNumber' => $receiptNumber], 'Penerimaan disimpan');
        } catch (InvalidArgumentException | DomainException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), transactionExceptionStatus($e, 422));
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $isDuplicate = (string)$e->getCode() === '23000' || (int)($e->errorInfo[1] ?? 0) === 1062;
            if ($isDuplicate && stripos($e->getMessage(), 'receipt_number') !== false) {
                respondError('Nomor antrian penerimaan baru saja dipakai perangkat lain. Tekan Simpan kembali.', 409);
            }
            $errorReference=substr(hash('sha256',uniqid('',true)),0,10);
            error_log("[goods receipt create {$errorReference}] ".$e->getMessage());
            respondError('Gagal simpan penerimaan. Referensi: '.$errorReference, 500);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $errorReference=substr(hash('sha256',uniqid('',true)),0,10);
            error_log("[goods receipt create {$errorReference}] ".$e->getMessage());
            respondError('Gagal simpan penerimaan. Referensi: '.$errorReference, 500);
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        if (empty($d['items']) || !is_array($d['items'])) respondError('Tambahkan minimal satu barang', 422);
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $preflightBranchIds=getAccessibleBranchIds($pdo,$actor);
        if(!$preflightBranchIds)respondError('Penerimaan tidak ditemukan',404);
        $preflightMarks=implode(',',array_fill(0,count($preflightBranchIds),'?'));
        $receiverPreflightStmt=$pdo->prepare("SELECT received_by_id FROM goods_receipts WHERE id=? AND branch_id IN ($preflightMarks)");
        $receiverPreflightStmt->execute(array_merge([$id],$preflightBranchIds));$receiverPreflightId=$receiverPreflightStmt->fetchColumn();
        if($receiverPreflightId===false)respondError('Penerimaan tidak ditemukan',404);
        $receiverId=(string)($d['receivedById']??($receiverPreflightId?:($actor['id']??'')));
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $delegatedUserIds=array_merge([$receiverId],array_column($d['items'],'technicianId'));
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'receipt:edit',$delegatedUserIds);
            $actor=$authorization['actor'];
            // Get old status untuk logic stock
            $oldRowStmt = $pdo->prepare("SELECT * FROM goods_receipts WHERE id=? FOR UPDATE");
            $oldRowStmt->execute([$id]);
            $oldRow = $oldRowStmt->fetch();
            if (!$oldRow) throw new InvalidArgumentException('Penerimaan tidak ditemukan');
            if(!array_key_exists('receivedById',$d)&&(string)($oldRow['received_by_id']??'')!==(string)$receiverPreflightId)throw new DomainException('Petugas penerima berubah, silakan ulangi',409);
            [$deliveryMethod,$deliveryOther]=normalizeGoodsReceiptDelivery($d,(string)($oldRow['delivery_method']??'Diantar Supplier'),(string)($oldRow['delivery_other']??''));
            $oldStatus = $oldRow['status'] ?? '';
            $oldBranchId = $oldRow['branch_id'] ?? ($d['branchId'] ?? 'BR-001');
            $newBranchId = (string)($d['branchId'] ?? $oldBranchId);
            $oldWarehouseId=(string)($oldRow['warehouse_id']??defaultWarehouseId($pdo,(string)$oldBranchId));
            $newWarehouseId=(string)($d['warehouseId']??$oldWarehouseId);
            $lockedWarehouseMap=lockActiveInventoryWarehouses($pdo,array_filter([$oldWarehouseId,$newWarehouseId,$oldRow['source_warehouse_id']??null]));
            if((string)$lockedWarehouseMap[$oldWarehouseId]['branch_id']!==(string)$oldBranchId||(string)$lockedWarehouseMap[$newWarehouseId]['branch_id']!==$newBranchId)throw new InvalidArgumentException('Gudang penerimaan tidak lagi sesuai dengan cabang');
            assertLockedInventoryBranchAccess($authorization,(string)$oldBranchId);
            assertLockedInventoryBranchAccess($authorization,$newBranchId);
            if(($oldRow['source_type']??'Supplier')==='Transfer Gudang'&&!empty($oldRow['source_warehouse_id'])){
                $lockedSourceBranchId=(string)$lockedWarehouseMap[(string)$oldRow['source_warehouse_id']]['branch_id'];
                if($lockedSourceBranchId!==(string)($oldRow['source_branch_id']??''))throw new InvalidArgumentException('Gudang asal tidak lagi sesuai dengan cabang');
                assertLockedInventoryBranchAccess($authorization,$lockedSourceBranchId);
            }
            $newStatus = (string)($d['status'] ?? 'Draft');
            if (!in_array($newStatus, ['Draft', 'Diterima', 'Batal'], true)) throw new InvalidArgumentException('Status penerimaan hanya boleh Draft, Diterima, atau Batal');
            $oldItems = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $oldItems->execute([$id]);
            $oldItemsList = $oldItems->fetchAll();
            foreach ($oldItemsList as $oldItem) {
                if ((int)$oldItem['qty_invoiced'] > 0) throw new DomainException('Penerimaan yang sudah difakturkan tidak boleh diubah. Koreksi atau hapus faktur pembelian terlebih dahulu.');
            }
            $supplier=null;
            if(canSeeReceiptSupplier($pdo,$actor)&&!empty($d['supplierId'])){$supplierCheck=$pdo->prepare("SELECT id,name FROM suppliers WHERE id=? AND is_active=1");$supplierCheck->execute([$d['supplierId']]);$supplier=$supplierCheck->fetch();if(!$supplier)throw new InvalidArgumentException('Supplier tidak ditemukan atau nonaktif');}
            if(!canSeeReceiptSupplier($pdo,$actor)&&!empty($oldRow['supplier_id']))$supplier=['id'=>$oldRow['supplier_id'],'name'=>$oldRow['supplier_name']];
            $receiver=lockedInventoryDelegatedUserForBranch($authorization,$receiverId,$newBranchId,'Petugas penerima');

            $stmt=$pdo->prepare("UPDATE goods_receipts SET receipt_number=?,date=?,supplier_id=?,supplier_name=?,do_number=?,delivery_method=?,delivery_other=?,shipping_notes=?,status=?,notes=?,branch_id=?,warehouse_id=?,received_by=?,received_by_id=? WHERE id=?");
            $stmt->execute([
                $d['receiptNumber'], $d['date'],
                $supplier['id']??null,$supplier['name']??'', $d['doNumber'] ?? '', $deliveryMethod, $deliveryOther, $d['shippingNotes'] ?? ($oldRow['shipping_notes']??''),
                $newStatus, $d['notes'] ?? '',
                $newBranchId,$newWarehouseId,$receiver['name'],$receiver['id'],
                $id
            ]);

            $pdo->prepare("DELETE FROM goods_receipt_items WHERE receipt_id = ?")->execute([$id]);
            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id,item_id,item_code,item_name,qty,unit,qty_invoiced,unit_price,discount_percent,discount_amount,subtotal,technician_id,technician_name,line_notes,is_deferred,defer_reason,defer_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
                $itemCheck = $pdo->prepare("SELECT code,name,unit,type FROM items WHERE id=? AND is_active=1");
                $technicianCheck = $pdo->prepare("SELECT id,name,is_active FROM users WHERE id=? LIMIT 1");
                $seenItems = [];
                foreach ($d['items'] as $lineIndex=>$i) {
                    $itemCheck->execute([$i['itemId'] ?? '']);
                    $item = $itemCheck->fetch();
                    $qty=parseBoundedDecimalInteger($i['qty']??null,'1','2147483647','Kuantitas penerimaan baris '.($lineIndex+1));
                    $d['items'][$lineIndex]['qty']=$qty;
                    if (!$item || $item['type'] !== 'Persediaan' || $qty <= 0) throw new InvalidArgumentException('Penerimaan hanya boleh berisi barang persediaan aktif dengan qty lebih dari 0');
                    if (isset($seenItems[(string)$i['itemId']])) throw new InvalidArgumentException('Barang yang sama tidak boleh diduplikasi dalam satu penerimaan');
                    $seenItems[(string)$i['itemId']] = true;
                    $unitPrice=max(0,(float)($i['unitPrice']??0));$discountPercent=min(100,max(0,(float)($i['discountPercent']??0)));$gross=$qty*$unitPrice;$discountAmount=min($gross,max(0,(float)($i['discountAmount']??($gross*$discountPercent/100))));$subtotal=max(0,$gross-$discountAmount);
                    $technicianId=trim((string)($i['technicianId']??''));$technicianName='';if($technicianId!==''){$technicianCheck->execute([$technicianId]);$technician=$technicianCheck->fetch();if(!$technician||!(bool)$technician['is_active'])throw new InvalidArgumentException('Petugas/teknisi rincian tidak valid');$technicianName=(string)$technician['name'];}
                    $isDeferred=!empty($i['isDeferred']);$deferReason=trim((string)($i['deferReason']??''));$deferUntil=trim((string)($i['deferUntil']??''))?:null;if($isDeferred&&$deferReason==='')throw new InvalidArgumentException('Alasan penangguhan wajib diisi');
                    $iStmt->execute([$id,$i['itemId'],$item['code'],$item['name'],$qty,$item['unit'],0,$unitPrice,$discountPercent,$discountAmount,$subtotal,$technicianId?:null,$technicianName?:null,trim((string)($i['lineNotes']??'')),$isDeferred?1:0,$isDeferred?$deferReason:null,$isDeferred?$deferUntil:null]);
                }
            }

            // Stock logic
            $wasReceived = in_array($oldStatus, ['Diterima', 'Difakturkan', 'Sebagian']);
            $isReceived = in_array($newStatus, ['Diterima', 'Difakturkan', 'Sebagian']);
            $oldStockLines=[];foreach($oldItemsList as $line){$key=(string)$line['item_id'];$oldStockLines[$key]=($oldStockLines[$key]??0)+(int)$line['qty'];}ksort($oldStockLines);
            $newStockLines=[];foreach($d['items'] as $line){$key=(string)$line['itemId'];$newStockLines[$key]=($newStockLines[$key]??0)+$line['qty'];}ksort($newStockLines);
            $stockImpactChanged=$wasReceived!==$isReceived
                ||($wasReceived&&$isReceived&&(
                    $oldStockLines!==$newStockLines
                    ||$oldWarehouseId!==$newWarehouseId
                    ||(string)$oldBranchId!==$newBranchId
                ));
            $movementDateChanged=(string)$oldRow['date']!==(string)$d['date'];
            $movementMetadataChanged=$movementDateChanged
                ||(string)$oldRow['receipt_number']!==(string)$d['receiptNumber'];
            $correctionGroupId=$stockImpactChanged?'CORR-GR-'.date('YmdHis').'-'.substr(bin2hex(random_bytes(4)),0,8):null;

            // Tanggal, keterangan, petugas, dan header lain tidak mengubah saldo.
            // Tanggal/nomor hanya memperbarui referensi mutasi aktif yang sama.
            // Koreksi barang, kuantitas, gudang, cabang, atau status mengganti mutasi aktif.
            // Versi lama tetap tersedia hanya melalui Log Aktivitas.
            if ($stockImpactChanged && $wasReceived) {
                foreach ($oldItemsList as $i) {
                    adjustWarehouseStock($pdo,$oldWarehouseId,$oldBranchId,$i['item_id'],-(int)$i['qty']);
                    if(($oldRow['source_type']??'Supplier')==='Transfer Gudang'&&!empty($oldRow['source_warehouse_id'])&&!empty($oldRow['source_branch_id']))adjustWarehouseStockAllowNegative($pdo,(string)$oldRow['source_warehouse_id'],(string)$oldRow['source_branch_id'],$i['item_id'],(int)$i['qty']);
                }
            }
            if($stockImpactChanged)$pdo->prepare("UPDATE stock_movements SET is_voided=1,voided_at=NOW(),voided_by=?,void_reason='Penerimaan diedit' WHERE reference_type='goods_receipt' AND reference_id=? AND is_voided=0")->execute([$actor['id']??null,$id]);
            if ($stockImpactChanged && $isReceived) {
                foreach ($d['items'] as $lineIndex=>$i) {
                    if(($oldRow['source_type']??'Supplier')==='Transfer Gudang'&&!empty($oldRow['source_warehouse_id'])&&!empty($oldRow['source_branch_id']))adjustWarehouseStock($pdo,(string)$oldRow['source_warehouse_id'],(string)$oldRow['source_branch_id'],$i['itemId'],-$i['qty']);
                    adjustWarehouseStockAllowNegative($pdo,$newWarehouseId,$newBranchId,$i['itemId'],$i['qty']);
                    $journalReceipt($pdo,['id'=>$id,'receipt_number'=>$d['receiptNumber'],'date'=>$d['date'],'warehouse_id'=>$newWarehouseId,'source_type'=>$oldRow['source_type']??'Supplier','source_warehouse_id'=>$oldRow['source_warehouse_id']??null],(string)$i['itemId'],$i['qty'],false,$actor,$correctionGroupId,null,$correctionGroupId.':'.$i['itemId'].':'.$lineIndex.':apply',max(0,(float)($i['unitPrice']??0)));
                }
            }
            if(!$stockImpactChanged&&$movementDateChanged)bumpStockVersionsForMovementReference($pdo,'goods_receipt',$id);
            if(!$stockImpactChanged&&$movementMetadataChanged)$pdo->prepare("UPDATE stock_movements SET reference_number=?,occurred_at=CONCAT(?,' 12:00:00') WHERE reference_type='goods_receipt' AND reference_id=? AND is_voided=0")
                ->execute([$d['receiptNumber'],$d['date'],$id]);
            $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('goods_receipt',?,?,'update',?,?,?,?)")
                ->execute([$id,$d['receiptNumber'],$stockImpactChanged?'Perubahan berdampak stok':($movementMetadataChanged?'Perubahan tanggal/referensi tanpa perubahan saldo':'Perubahan non-stok'),json_encode(['before'=>['document'=>$oldRow,'items'=>$oldItemsList],'after'=>$d],JSON_UNESCAPED_UNICODE),$actor['id']??null,$actor['name']??$actor['username']??null]);

            $pdo->commit();
            respondSuccess(null, $stockImpactChanged?'Penerimaan dan stok berhasil diperbarui':'Penerimaan berhasil diperbarui tanpa mengubah saldo stok');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), transactionExceptionStatus($e, 422));
        } catch (Throwable $e) {
            $pdo->rollBack();
            respondError('Gagal update penerimaan', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $deleteInput=getInput();
        $deleteReason=trim((string)($deleteInput['reason']??''))?:'Dihapus oleh pengguna';
        $actor=$requestUser ?? requireAuthenticatedUser($pdo);
        $pdo->beginTransaction();
        try {
            lockInventoryMutation($pdo);
            $authorization=lockInventoryMutationAuthorization($pdo,$actor,'receipt:delete');
            $actor=$authorization['actor'];
            $rowStmt=$pdo->prepare("SELECT * FROM goods_receipts WHERE id=? FOR UPDATE");
            $rowStmt->execute([$id]);
            $row = $rowStmt->fetch();
            if (!$row) throw new InvalidArgumentException('Penerimaan tidak ditemukan');
            $deleteActor=$actor;
            $deleteWarehouseId=(string)($row['warehouse_id']?:defaultWarehouseId($pdo,(string)$row['branch_id']));
            $lockedWarehouseMap=lockActiveInventoryWarehouses($pdo,array_filter([$deleteWarehouseId,$row['source_warehouse_id']??null]));
            if((string)$lockedWarehouseMap[$deleteWarehouseId]['branch_id']!==(string)$row['branch_id'])throw new InvalidArgumentException('Gudang penerimaan tidak lagi sesuai dengan cabang');
            assertLockedInventoryBranchAccess($authorization,(string)$row['branch_id']);
            if(($row['source_type']??'Supplier')==='Transfer Gudang'&&!empty($row['source_warehouse_id'])){
                $lockedSourceBranchId=(string)$lockedWarehouseMap[(string)$row['source_warehouse_id']]['branch_id'];
                if($lockedSourceBranchId!==(string)($row['source_branch_id']??''))throw new InvalidArgumentException('Gudang asal tidak lagi sesuai dengan cabang');
                assertLockedInventoryBranchAccess($authorization,$lockedSourceBranchId);
            }
            $linked = $pdo->prepare("SELECT COUNT(*) FROM purchase_invoice_items WHERE receipt_id=?");
            $linked->execute([$id]);
            if ((int)$linked->fetchColumn() > 0) throw new DomainException('Penerimaan sudah dipakai pada faktur pembelian dan tidak dapat dihapus');
            $items = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $items->execute([$id]);
            $receiptItems=$items->fetchAll();
            if ($row && in_array($row['status'], ['Diterima', 'Difakturkan', 'Sebagian'])) {
                foreach ($receiptItems as $i) {
                    if (!empty($i['item_id'])) {
                        adjustWarehouseStock($pdo,(string)($row['warehouse_id']?:defaultWarehouseId($pdo,(string)$row['branch_id'])),(string)$row['branch_id'],$i['item_id'],-(int)$i['qty']);
                        if(($row['source_type']??'Supplier')==='Transfer Gudang'&&!empty($row['source_warehouse_id'])&&!empty($row['source_branch_id']))adjustWarehouseStockAllowNegative($pdo,(string)$row['source_warehouse_id'],(string)$row['source_branch_id'],$i['item_id'],(int)$i['qty']);
                    }
                }
            }
            $snapshot=['document'=>$row,'items'=>$receiptItems];
            $pdo->prepare("INSERT INTO transaction_activity_logs(entity_type,entity_id,entity_number,action_type,reason,snapshot_json,user_id,user_name) VALUES('goods_receipt',?,?,'delete',?,?,?,?)")
                ->execute([$id,$row['receipt_number'],substr($deleteReason,0,255),json_encode($snapshot,JSON_UNESCAPED_UNICODE),$deleteActor['id']??null,$deleteActor['name']??$deleteActor['username']??null]);
            $pdo->prepare("UPDATE stock_movements SET is_voided=1,voided_at=NOW(),voided_by=?,void_reason=? WHERE reference_type='goods_receipt' AND reference_id=? AND is_voided=0")
                ->execute([$deleteActor['id']??null,substr($deleteReason,0,255),$id]);
            $pdo->prepare("DELETE FROM goods_receipts WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(['status'=>'Deleted'], 'Penerimaan dihapus, stok dikembalikan, dan jejak tersimpan di Log Aktivitas');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), transactionExceptionStatus($e, 409));
        } catch (Throwable $e) {
            $pdo->rollBack();
            respondError('Gagal menghapus penerimaan', 500, $e->getMessage());
        }
        break;

    default: respondError('Method not allowed', 405);
}
