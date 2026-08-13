<?php
function itemCodeSegment(string $value, string $fallback): string {
    $normalized = strtoupper(trim((string)preg_replace('/[^A-Z0-9]+/i', ' ', $value)));
    $digits = preg_replace('/\D/', '', $normalized);
    if ($digits !== '') return str_pad(substr($digits, -2), 2, '0', STR_PAD_LEFT);
    $words = array_values(array_filter(preg_split('/\s+/', $normalized) ?: []));
    $code = count($words) > 1 ? substr($words[0],0,1).substr($words[1],0,1) : substr($words[0] ?? $fallback,0,2);
    return str_pad($code, 2, 'X');
}

function nextAutomaticItemCode(PDO $pdo, string $categoryCode, string $categoryName, string $brand, string $type): string {
    $categoryPart = itemCodeSegment($categoryCode !== '' ? $categoryCode : $categoryName, '00');
    $fallback = $type === 'Jasa' ? 'JS' : ($type === 'Group' ? 'GP' : ($type === 'Non Persediaan' ? 'NP' : 'NA'));
    $brandPart = itemCodeSegment($brand, $fallback);
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
            $unit=$type==='Jasa'?'JASA':($type==='Group'?'PAKET':strtoupper(trim((string)($d['unit']??'PCS'))));
            $quickService=in_array($type,['Jasa','Group'],true)?(int)!empty($d['isQuickService']):0;
            $normalizedBarcode=in_array($type,['Jasa','Group'],true)?null:($barcode!==''?$barcode:null);
            $nameCheck=$pdo->prepare("SELECT id FROM items WHERE UPPER(TRIM(name))=? LIMIT 1");$nameCheck->execute([$name]);
            if($nameCheck->fetch())throw new InvalidArgumentException("Nama {$name} sudah digunakan");
            $code=!empty($d['autoCode'])?nextAutomaticItemCode($pdo,(string)$category['code'],(string)$category['name'],$brand,$type):strtoupper(trim((string)($d['code']??'')));
            if($code==='')throw new InvalidArgumentException('Kode barang/jasa wajib diisi');
            $codeCheck=$pdo->prepare("SELECT id FROM items WHERE code=? LIMIT 1");$codeCheck->execute([$code]);
            if($codeCheck->fetch())throw new InvalidArgumentException("Kode {$code} sudah digunakan");
            if($type==='Group'&&empty($d['groupMembers']))throw new InvalidArgumentException('Group/Paket wajib memiliki minimal satu komponen');
            $itemId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO items (id, code, name, category_id, category_name, type, brand, unit, stock, sellable_stock, purchase_price, selling_price, is_active, is_quick_service, description, receipt_description, barcode, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $itemId, $code, $name,
                $category['id'], $category['name'],
                $type, $brand, $unit,
                0, 0,
                0, max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $quickService,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                $normalizedBarcode,
                $branchId
            ]);

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
            $stmt = $pdo->prepare("UPDATE items SET code=?, name=?, category_id=?, category_name=?, type=?, brand=?, unit=?, selling_price=?, is_active=?, is_quick_service=?, description=?, receipt_description=?, barcode=? WHERE id=?");
            $stmt->execute([
                $current['code'], $name,
                $category['id'], $category['name'],
                $type, $brand, $unit,
                max(0, (float)($d['sellingPrice'] ?? 0)),
                $d['isActive'] ?? 1, $quickService,
                $d['description'] ?? '', $d['receiptDescription'] ?? '',
                $normalizedBarcode,
                $id
            ]);

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
