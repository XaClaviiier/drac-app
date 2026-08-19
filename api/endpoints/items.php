<?php
$pdo->exec("ALTER TABLE vehicle_brands ADD COLUMN IF NOT EXISTS item_code CHAR(2) NULL AFTER name");
$brandCodeMap=['UNIVERSAL'=>'01','TOYOTA'=>'02','DAIHATSU'=>'03','HONDA'=>'04','MITSUBISHI'=>'05','SUZUKI'=>'06','WULING'=>'07','NISSAN'=>'08','DATSUN'=>'09','ISUZU'=>'10','MAZDA'=>'11','FORD'=>'12','CHEVROLET'=>'13','KIA'=>'14','HYUNDAI'=>'15'];
$brandCodeUpdate=$pdo->prepare("UPDATE vehicle_brands SET item_code=? WHERE UPPER(name)=?");foreach($brandCodeMap as $brandName=>$brandCode){$brandCodeUpdate->execute([$brandCode,$brandName]);}
$universalId='VB-'.substr(sha1('universal'),0,16);$pdo->prepare("INSERT IGNORE INTO vehicle_brands(id,name,item_code,is_active,sort_order) VALUES (?,'Universal','01',1,0)")->execute([$universalId]);
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS vehicle_brand_id VARCHAR(64) NULL AFTER brand");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS vehicle_brand_name VARCHAR(100) NULL AFTER vehicle_brand_id");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS item_brand_id VARCHAR(64) NULL AFTER brand");
$pdo->exec("CREATE TABLE IF NOT EXISTS item_vehicle_brands(item_id VARCHAR(64) NOT NULL,vehicle_brand_id VARCHAR(64) NOT NULL,sort_order INT NOT NULL DEFAULT 0,PRIMARY KEY(item_id,vehicle_brand_id),INDEX idx_ivb_brand(vehicle_brand_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'Verified' AFTER is_active");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) NULL AFTER verification_status");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS verified_by VARCHAR(64) NULL AFTER created_by");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS merged_into_item_id VARCHAR(64) NULL AFTER verified_by");
$pdo->exec("CREATE TABLE IF NOT EXISTS item_verification_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY,item_id VARCHAR(64) NOT NULL,action VARCHAR(30) NOT NULL,target_item_id VARCHAR(64) NULL,user_id VARCHAR(64) NULL,user_name VARCHAR(150) NULL,detail TEXT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_item_verify(item_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
function itemCodeSegment(string $value, string $fallback): string {
    $normalized = strtoupper(trim((string)preg_replace('/[^A-Z0-9]+/i', ' ', $value)));
    $digits = preg_replace('/\D/', '', $normalized);
    if ($digits !== '') return str_pad(substr($digits, -2), 2, '0', STR_PAD_LEFT);
    $words = array_values(array_filter(preg_split('/\s+/', $normalized) ?: []));
    $code = count($words) > 1 ? substr($words[0],0,1).substr($words[1],0,1) : substr($words[0] ?? $fallback,0,2);
    return str_pad($code, 2, 'X');
}

function nextAutomaticItemCode(PDO $pdo, string $categoryCode, string $categoryName, string $brandCode, string $type): string {
    $categoryPart = itemCodeSegment($categoryCode !== '' ? $categoryCode : $categoryName, '00');
    $fallback = '01';
    $brandPart = itemCodeSegment($brandCode, $fallback);
    $prefix = $categoryPart.$brandPart;
    $stmt = $pdo->prepare("SELECT code FROM items WHERE code LIKE ? FOR UPDATE");
    $stmt->execute([$prefix.'-%']);
    $max = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $code) {
        if (preg_match('/^'.preg_quote($prefix,'/').'-(\d{4})$/', strtoupper((string)$code), $match)) $max=max($max,(int)$match[1]);
    }
    if ($max >= 9999) throw new InvalidArgumentException("Urutan kode {$prefix} sudah mencapai batas 9999");
    return $prefix.'-'.str_pad((string)($max+1),4,'0',STR_PAD_LEFT);
}

switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
        $stockTable = $pdo->query("SHOW TABLES LIKE 'branch_item_stocks'")->fetch();
        $stockRows = $stockTable
            ? $pdo->query("SELECT branch_id, item_id, stock, sellable_stock FROM branch_item_stocks")->fetchAll()
            : [];
        $stocksByItem = [];
        foreach ($stockRows as $stockRow) {
            if (!isset($allowedBranchMap[(string)$stockRow['branch_id']])) continue;
            $stocksByItem[$stockRow['item_id']][$stockRow['branch_id']] = [
                'stock' => (int)$stockRow['stock'],
                'sellableStock' => (int)$stockRow['sellable_stock'],
            ];
        }
        foreach ($rows as &$r) {
            $r['categoryId'] = $r['category_id'];
            $r['categoryName'] = $r['category_name'];
            $r['sellableStock'] = (int)$r['sellable_stock'];
            $r['purchasePrice'] = (float)$r['purchase_price'];
            $r['sellingPrice'] = (float)$r['selling_price'];
            $r['isActive'] = (bool)$r['is_active'];
            $r['vehicleBrandId'] = $r['vehicle_brand_id'] ?? null;
            $r['vehicleBrandName'] = $r['vehicle_brand_name'] ?? '';
            $r['itemBrandId'] = $r['item_brand_id'] ?? null;
            $brandLinks=$pdo->prepare("SELECT ivb.vehicle_brand_id,b.name FROM item_vehicle_brands ivb JOIN vehicle_brands b ON b.id=ivb.vehicle_brand_id WHERE ivb.item_id=? ORDER BY ivb.sort_order,b.name");
            $brandLinks->execute([$r['id']]);$linked=$brandLinks->fetchAll();
            if(!$linked && !empty($r['vehicle_brand_id']))$linked=[['vehicle_brand_id'=>$r['vehicle_brand_id'],'name'=>$r['vehicle_brand_name']]];
            $r['vehicleBrandIds']=array_values(array_column($linked,'vehicle_brand_id'));
            $r['vehicleBrandNames']=array_values(array_column($linked,'name'));
            $r['verificationStatus'] = $r['verification_status'] ?? 'Verified';
            $r['createdBy'] = $r['created_by'] ?? null;
            $r['verifiedBy'] = $r['verified_by'] ?? null;
            $r['mergedIntoItemId'] = $r['merged_into_item_id'] ?? null;
            $r['isQuickService'] = (bool)$r['is_quick_service'];
            $r['receiptDescription'] = $r['receipt_description'] ?? '';
            $r['branchId'] = $r['branch_id'];
            $r['branchStocks'] = $stocksByItem[$r['id']] ?? [];
            // Load group members
            if ($r['type'] === 'Group') {
                $stmt = $pdo->prepare("SELECT * FROM item_group_members WHERE group_item_id = ?");
                $stmt->execute([$r['id']]);
                $members = $stmt->fetchAll();
                $r['groupMembers'] = array_map(function($m) {
                    return [
                        'itemId' => $m['member_item_id'],
                        'itemCode' => $m['member_code'],
                        'itemName' => $m['member_name'],
                        'itemType' => $m['member_type'],
                        'qty' => (int)$m['qty'],
                        'unitPrice' => (float)$m['unit_price'],
                    ];
                }, $members);
            }
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        if (!authenticatedUserHasPermission($pdo,$actor,'item:create') && empty($d['provisional'])) respondError('Hak penerimaan hanya boleh membuat barang sementara',403);
        $branchId = (string)($d['branchId'] ?? '');
        requireAccessibleBranch($pdo, $actor, $branchId);
        $type = (string)($d['type'] ?? '');
        if (!in_array($type, ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'], true)) respondError('Jenis barang/jasa tidak valid', 422);
        if (trim((string)($d['name'] ?? '')) === '') respondError('Nama wajib diisi', 422);
        $barcode = trim((string)($d['barcode'] ?? ''));
        if ($barcode !== '') {
            $check = $pdo->prepare("SELECT id, name FROM items WHERE barcode = ? LIMIT 1");
            $check->execute([$barcode]);
            if ($duplicate = $check->fetch()) respondError("Barcode sudah dipakai oleh {$duplicate['name']}", 409);
        }
        $pdo->beginTransaction();
        try {
            $categoryStmt=$pdo->prepare("SELECT id,code,name,is_active FROM item_categories WHERE id=? FOR UPDATE");
            $categoryStmt->execute([(string)($d['categoryId']??'')]);$category=$categoryStmt->fetch();
            if(!$category||!(bool)$category['is_active'])throw new InvalidArgumentException('Kategori wajib dipilih dari kategori aktif');
            $name=strtoupper(trim((string)$d['name']));$brand=in_array($type,['Jasa','Group'],true)?'':strtoupper(trim((string)($d['brand']??'')));
            $vehicleBrandIds=array_values(array_unique(array_filter(array_map('strval',(array)($d['vehicleBrandIds']??[])))));$vehicleBrandId=(string)($vehicleBrandIds[0]??($d['vehicleBrandId']??''));
            $vehicleBrandStmt=$pdo->prepare("SELECT id,name,item_code FROM vehicle_brands WHERE id=? AND is_active=1");
            if($vehicleBrandId!==''){$vehicleBrandStmt->execute([$vehicleBrandId]);$vehicleBrand=$vehicleBrandStmt->fetch();}else{$vehicleBrand=$pdo->query("SELECT id,name,item_code FROM vehicle_brands WHERE UPPER(name)='UNIVERSAL' AND is_active=1 LIMIT 1")->fetch();}
            if(!$vehicleBrand)throw new InvalidArgumentException('Merek kendaraan untuk kode barang wajib dipilih');
            $unit=$type==='Jasa'?'JASA':($type==='Group'?'PAKET':strtoupper(trim((string)($d['unit']??'PCS'))));
            $quickService=in_array($type,['Jasa','Group'],true)?(int)!empty($d['isQuickService']):0;
            $normalizedBarcode=in_array($type,['Jasa','Group'],true)?null:($barcode!==''?$barcode:null);
            $nameCheck=$pdo->prepare("SELECT id FROM items WHERE UPPER(TRIM(name))=? LIMIT 1");$nameCheck->execute([$name]);
            if($nameCheck->fetch())throw new InvalidArgumentException("Nama {$name} sudah digunakan");
            $code=!empty($d['autoCode'])?nextAutomaticItemCode($pdo,(string)$category['code'],(string)$category['name'],(string)($vehicleBrand['item_code']??'01'),$type):strtoupper(trim((string)($d['code']??'')));
            if($code==='')throw new InvalidArgumentException('Kode barang/jasa wajib diisi');
            $codeCheck=$pdo->prepare("SELECT id FROM items WHERE code=? LIMIT 1");$codeCheck->execute([$code]);
            if($codeCheck->fetch())throw new InvalidArgumentException("Kode {$code} sudah digunakan");
            if($type==='Group'&&empty($d['groupMembers']))throw new InvalidArgumentException('Group/Paket wajib memiliki minimal satu komponen');
            $itemId = $d['id'] ?? generateId();
            $isProvisional=!empty($d['provisional']);
            $stmt = $pdo->prepare("INSERT INTO items (id, code, name, category_id, category_name, type, brand, item_brand_id, vehicle_brand_id, vehicle_brand_name, unit, stock, sellable_stock, purchase_price, selling_price, is_active, verification_status, created_by, verified_by, is_quick_service, description, receipt_description, barcode, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $itemId, $code, $name,
                $category['id'], $category['name'],
                $type, $brand, $d['itemBrandId']??null, $vehicleBrand['id'], $vehicleBrand['name'], $unit,
                0, 0,
                0, max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $isProvisional?'Pending':'Verified', $actor['id']??null, $isProvisional?null:($actor['id']??null), $quickService,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                $normalizedBarcode,
                $branchId
            ]);
            if(!$vehicleBrandIds)$vehicleBrandIds=[$vehicleBrand['id']];$link=$pdo->prepare("INSERT IGNORE INTO item_vehicle_brands(item_id,vehicle_brand_id,sort_order) VALUES(?,?,?)");foreach($vehicleBrandIds as $position=>$linkedBrandId){$vehicleBrandStmt->execute([$linkedBrandId]);if(!$vehicleBrandStmt->fetch())throw new InvalidArgumentException('Merek kendaraan tidak valid');$link->execute([$itemId,$linkedBrandId,$position]);}

            $stockStmt = $pdo->prepare("
                INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE stock = VALUES(stock), sellable_stock = VALUES(sellable_stock)
            ");
            $stockStmt->execute([
                $branchId, $itemId, 0, 0,
            ]);
            $warehouseStock = $pdo->prepare("
                INSERT INTO warehouse_stocks (warehouse_id,item_id,quantity,reserved_quantity)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),reserved_quantity=VALUES(reserved_quantity)
            ");
            $warehouseStock->execute([defaultWarehouseId($pdo,$branchId),$itemId,0,0]);

            // Insert group members
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $memberCheck = $pdo->prepare("SELECT code,name,type,selling_price FROM items WHERE id=? AND is_active=1");
                $seenMembers = [];
                foreach ($d['groupMembers'] as $m) {
                    $memberId = (string)($m['itemId'] ?? '');
                    if ($memberId === '' || $memberId === $itemId || isset($seenMembers[$memberId])) throw new InvalidArgumentException('Komponen paket tidak valid atau duplikat');
                    $memberCheck->execute([$memberId]);
                    $member = $memberCheck->fetch();
                    if (!$member || $member['type'] === 'Group') throw new InvalidArgumentException('Komponen paket harus barang/jasa aktif dan bukan paket lain');
                    $qty = max(1, (int)($m['qty'] ?? 1));
                    $memStmt->execute([$itemId, $memberId, $member['code'], $member['name'], $member['type'], $qty, max(0, (float)$member['selling_price'])]);
                    $seenMembers[$memberId] = true;
                }
            }
            $pdo->commit();
            respondSuccess(['id' => $itemId, 'code'=>$code], 'Barang/Jasa ditambahkan');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menambah item', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        if (in_array((string)($d['action']??''), ['verify','merge'], true)) {
            $roleStmt=$pdo->prepare("SELECT code,name FROM roles WHERE id=? LIMIT 1");$roleStmt->execute([$actor['role_id']??'']);$role=$roleStmt->fetch();
            $isAdmin=!empty($actor['is_owner'])||strtoupper((string)($role['code']??''))==='ADM'||strtolower((string)($role['name']??''))==='administrator';
            if(!$isAdmin)respondError('Verifikasi barang hanya untuk Owner atau Administrator',403);
            if($d['action']==='verify'){
                $pdo->prepare("UPDATE items SET verification_status='Verified',verified_by=? WHERE id=? AND verification_status='Pending'")->execute([$actor['id']??null,$id]);
                $pdo->prepare("INSERT INTO item_verification_audit(item_id,action,user_id,user_name) VALUES (?,'Verified',?,?)")->execute([$id,$actor['id']??null,$actor['name']??'']);
                respondSuccess(null,'Barang berhasil diverifikasi');
            }
            $targetId=(string)($d['targetItemId']??'');
            if($targetId===''||$targetId===$id)respondError('Barang tujuan penggabungan tidak valid',422);
            $pdo->beginTransaction();
            try{
                $sourceStmt=$pdo->prepare("SELECT * FROM items WHERE id=? AND verification_status='Pending' FOR UPDATE");$sourceStmt->execute([$id]);$source=$sourceStmt->fetch();
                $targetStmt=$pdo->prepare("SELECT * FROM items WHERE id=? AND is_active=1 AND verification_status='Verified' FOR UPDATE");$targetStmt->execute([$targetId]);$target=$targetStmt->fetch();
                if(!$source||!$target)throw new InvalidArgumentException('Barang asal Pending atau barang tujuan terverifikasi tidak ditemukan');
                foreach(['warehouse_stocks'=>['warehouse_id','quantity','reserved_quantity'],'branch_item_stocks'=>['branch_id','stock','sellable_stock']] as $table=>$cols){
                    [$scope,$qty,$reserved]=$cols;$rows=$pdo->prepare("SELECT * FROM {$table} WHERE item_id=?");$rows->execute([$id]);
                    foreach($rows->fetchAll() as $row){$up=$pdo->prepare("INSERT INTO {$table} ({$scope},item_id,{$qty},{$reserved}) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE {$qty}={$qty}+VALUES({$qty}),{$reserved}={$reserved}+VALUES({$reserved})");$up->execute([$row[$scope],$targetId,$row[$qty],$row[$reserved]]);}
                    $pdo->prepare("DELETE FROM {$table} WHERE item_id=?")->execute([$id]);
                }
                foreach(['goods_receipt_items','purchase_invoice_items'] as $table){$pdo->prepare("UPDATE {$table} SET item_id=?,item_code=?,item_name=? WHERE item_id=?")->execute([$targetId,$target['code'],$target['name'],$id]);}
                foreach(['work_order_services','sales_invoice_items'] as $table){$pdo->prepare("UPDATE {$table} SET item_id=?,code=?,name=? WHERE item_id=?")->execute([$targetId,$target['code'],$target['name'],$id]);}
                $pdo->prepare("UPDATE items SET is_active=0,verification_status='Merged',merged_into_item_id=?,verified_by=?,stock=0,sellable_stock=0 WHERE id=?")->execute([$targetId,$actor['id']??null,$id]);
                $pdo->prepare("UPDATE items SET stock=(SELECT COALESCE(SUM(stock),0) FROM branch_item_stocks WHERE item_id=?),sellable_stock=(SELECT COALESCE(SUM(sellable_stock),0) FROM branch_item_stocks WHERE item_id=?) WHERE id=?")->execute([$targetId,$targetId,$targetId]);
                $pdo->prepare("INSERT INTO item_verification_audit(item_id,action,target_item_id,user_id,user_name) VALUES (?,'Merged',?,?,?)")->execute([$id,$targetId,$actor['id']??null,$actor['name']??'']);
                $pdo->commit();respondSuccess(null,'Barang duplikat berhasil dikonversi dan stok digabungkan');
            }catch(Exception $e){$pdo->rollBack();respondError($e->getMessage(),422);}
        }
        $type = (string)($d['type'] ?? '');
        if (!in_array($type, ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'], true)) respondError('Jenis barang/jasa tidak valid', 422);
        if (trim((string)($d['code'] ?? '')) === '' || trim((string)($d['name'] ?? '')) === '') respondError('Kode dan nama wajib diisi', 422);
        $barcode = trim((string)($d['barcode'] ?? ''));
        if ($barcode !== '') {
            $check = $pdo->prepare("SELECT id, name FROM items WHERE barcode = ? AND id <> ? LIMIT 1");
            $check->execute([$barcode, $id]);
            if ($duplicate = $check->fetch()) respondError("Barcode sudah dipakai oleh {$duplicate['name']}", 409);
        }
        $pdo->beginTransaction();
        try {
            $currentStmt=$pdo->prepare("SELECT * FROM items WHERE id=? FOR UPDATE");$currentStmt->execute([$id]);$current=$currentStmt->fetch();
            if(!$current)throw new InvalidArgumentException('Barang/Jasa tidak ditemukan');
            $categoryStmt=$pdo->prepare("SELECT id,code,name,is_active FROM item_categories WHERE id=?");$categoryStmt->execute([(string)($d['categoryId']??'')]);$category=$categoryStmt->fetch();
            if(!$category||!(bool)$category['is_active'])throw new InvalidArgumentException('Kategori wajib dipilih dari kategori aktif');
            $name=strtoupper(trim((string)$d['name']));$brand=in_array($type,['Jasa','Group'],true)?'':strtoupper(trim((string)($d['brand']??'')));
            $vehicleBrandIds=array_values(array_unique(array_filter(array_map('strval',(array)($d['vehicleBrandIds']??[])))));$primaryBrandId=(string)($vehicleBrandIds[0]??($d['vehicleBrandId']??$current['vehicle_brand_id']??''));$primaryBrand=$pdo->prepare("SELECT id,name FROM vehicle_brands WHERE id=? AND is_active=1");$primaryBrand->execute([$primaryBrandId]);$primaryBrandRow=$primaryBrand->fetch();if(!$primaryBrandRow)throw new InvalidArgumentException('Minimal satu merek kendaraan wajib dipilih');
            $unit=$type==='Jasa'?'JASA':($type==='Group'?'PAKET':strtoupper(trim((string)($d['unit']??'PCS'))));
            $quickService=in_array($type,['Jasa','Group'],true)?(int)!empty($d['isQuickService']):0;
            $normalizedBarcode=in_array($type,['Jasa','Group'],true)?null:($barcode!==''?$barcode:null);
            $nameCheck=$pdo->prepare("SELECT id FROM items WHERE UPPER(TRIM(name))=? AND id<>? LIMIT 1");$nameCheck->execute([$name,$id]);
            if($nameCheck->fetch())throw new InvalidArgumentException("Nama {$name} sudah digunakan");
            if($type==='Group'&&empty($d['groupMembers']))throw new InvalidArgumentException('Group/Paket wajib memiliki minimal satu komponen');
            if($type!==(string)$current['type']){
                $usageSql="SELECT (SELECT COUNT(*) FROM work_order_services WHERE item_id=?)+(SELECT COUNT(*) FROM sales_invoice_items WHERE item_id=?)+(SELECT COUNT(*) FROM goods_receipt_items WHERE item_id=?)+(SELECT COUNT(*) FROM purchase_invoice_items WHERE item_id=?)+(SELECT COUNT(*) FROM item_group_members WHERE member_item_id=?)+(SELECT COUNT(*) FROM branch_item_stocks WHERE item_id=? AND stock<>0)+(SELECT COUNT(*) FROM warehouse_stocks WHERE item_id=? AND quantity<>0)";
                $usage=$pdo->prepare($usageSql);$usage->execute([$id,$id,$id,$id,$id,$id,$id]);
                if((int)$usage->fetchColumn()>0)throw new InvalidArgumentException('Jenis item tidak dapat diubah karena sudah memiliki stok atau histori transaksi');
            }
            // Harga beli dan saldo stok hanya boleh berubah melalui transaksi
            // penerimaan, pembelian, atau penyesuaian persediaan.
            $stmt = $pdo->prepare("UPDATE items SET code=?, name=?, category_id=?, category_name=?, type=?, brand=?, item_brand_id=?, vehicle_brand_id=?, vehicle_brand_name=?, unit=?, selling_price=?, is_active=?, is_quick_service=?, description=?, receipt_description=?, barcode=? WHERE id=?");
            $stmt->execute([
                $current['code'], $name,
                $category['id'], $category['name'],
                $type, $brand, $d['itemBrandId']??null,$primaryBrandRow['id'],$primaryBrandRow['name'],$unit,
                max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $quickService,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                $normalizedBarcode,
                $id
            ]);
            $pdo->prepare("DELETE FROM item_vehicle_brands WHERE item_id=?")->execute([$id]);if(!$vehicleBrandIds)$vehicleBrandIds=[$primaryBrandId];$link=$pdo->prepare("INSERT INTO item_vehicle_brands(item_id,vehicle_brand_id,sort_order) VALUES(?,?,?)");foreach($vehicleBrandIds as $position=>$linkedBrandId){$primaryBrand->execute([$linkedBrandId]);if(!$primaryBrand->fetch())throw new InvalidArgumentException('Merek kendaraan tidak valid');$link->execute([$id,$linkedBrandId,$position]);}

            // Refresh group members
            $pdo->prepare("DELETE FROM item_group_members WHERE group_item_id = ?")->execute([$id]);
            if (($d['type'] ?? '') === 'Group' && !empty($d['groupMembers'])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $memberCheck = $pdo->prepare("SELECT code,name,type,selling_price FROM items WHERE id=? AND is_active=1");
                $seenMembers = [];
                foreach ($d['groupMembers'] as $m) {
                    $memberId = (string)($m['itemId'] ?? '');
                    if ($memberId === '' || $memberId === $id || isset($seenMembers[$memberId])) throw new InvalidArgumentException('Komponen paket tidak valid atau duplikat');
                    $memberCheck->execute([$memberId]);
                    $member = $memberCheck->fetch();
                    if (!$member || $member['type'] === 'Group') throw new InvalidArgumentException('Komponen paket harus barang/jasa aktif dan bukan paket lain');
                    $qty = max(1, (int)($m['qty'] ?? 1));
                    $memStmt->execute([$id, $memberId, $member['code'], $member['name'], $member['type'], $qty, max(0, (float)$member['selling_price'])]);
                    $seenMembers[$memberId] = true;
                }
            }
            $pdo->commit();
            respondSuccess(null, 'Item diupdate');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update item', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $references = [
            'work_order_services' => 'item_id', 'sales_invoice_items' => 'item_id',
            'goods_receipt_items' => 'item_id', 'purchase_invoice_items' => 'item_id',
            'item_group_members' => 'member_item_id',
        ];
        foreach ($references as $table => $column) {
            $check = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$column}=?");
            $check->execute([$id]);
            if ((int)$check->fetchColumn() > 0) respondError('Barang/jasa sudah dipakai. Nonaktifkan agar histori transaksi tetap utuh.', 409);
        }
        $pdo->prepare("DELETE FROM items WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Item dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
