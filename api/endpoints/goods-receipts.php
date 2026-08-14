<?php
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(20) NULL AFTER branch_id");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS received_by_id VARCHAR(64) NULL AFTER received_by");
$pdo->exec("UPDATE goods_receipts r JOIN warehouses w ON w.branch_id=r.branch_id AND w.is_default=1 SET r.warehouse_id=w.id WHERE r.warehouse_id IS NULL OR r.warehouse_id=''");
switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = array_values(array_filter(
            $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC, receipt_number DESC")->fetchAll(),
            fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])
        ));
        foreach ($rows as &$r) {
            $r['receiptNumber'] = $r['receipt_number'];
            $r['supplierId'] = $r['supplier_id'];
            $r['supplierName'] = $r['supplier_name'];
            $r['doNumber'] = $r['do_number'];
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
        $warehouseId = (string)($d['warehouseId'] ?? '');
        if ($warehouseId === '') respondError('Gudang tujuan wajib dipilih', 422);
        $warehouseCheck=$pdo->prepare("SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=1");$warehouseCheck->execute([$warehouseId,$branchId]);
        if(!$warehouseCheck->fetch())respondError('Gudang tujuan tidak valid',422);
        $supplier = null;
        if (!empty($d['supplierId'])) {
            $supplierCheck = $pdo->prepare("SELECT id,name FROM suppliers WHERE id=? AND is_active=1");
            $supplierCheck->execute([$d['supplierId']]);$supplier=$supplierCheck->fetch();
            if (!$supplier) respondError('Supplier tidak ditemukan atau nonaktif', 422);
        }
        if (empty($d['items']) || !is_array($d['items'])) respondError('Tambahkan minimal satu barang', 422);
        $newStatus = (string)($d['status'] ?? 'Draft');
        if (!in_array($newStatus, ['Draft', 'Diterima'], true)) respondError('Status awal penerimaan tidak valid', 422);
        $pdo->beginTransaction();
        try {
            $rId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO goods_receipts (id,receipt_number,date,supplier_id,supplier_name,do_number,status,notes,branch_id,warehouse_id,received_by,received_by_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([
                $rId, $d['receiptNumber'], $d['date'],
                $supplier['id'] ?? null, $supplier['name'] ?? '', $d['doNumber'] ?? '',
                $newStatus, $d['notes'] ?? '',
                $branchId,$warehouseId,$actor['name'] ?? $actor['username'] ?? 'System',$actor['id'] ?? null
            ]);

            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $itemCheck = $pdo->prepare("SELECT code,name,unit,type FROM items WHERE id=? AND is_active=1");
                $seenItems = [];
                foreach ($d['items'] as $i) {
                    $itemCheck->execute([$i['itemId'] ?? '']);
                    $item = $itemCheck->fetch();
                    $qty = (int)($i['qty'] ?? 0);
                    if (!$item || $item['type'] !== 'Persediaan' || $qty <= 0) throw new InvalidArgumentException('Penerimaan hanya boleh berisi barang persediaan aktif dengan qty lebih dari 0');
                    if (isset($seenItems[(string)$i['itemId']])) throw new InvalidArgumentException('Barang yang sama tidak boleh diduplikasi dalam satu penerimaan');
                    $seenItems[(string)$i['itemId']] = true;
                    $iStmt->execute([$rId, $i['itemId'], $item['code'], $item['name'], $qty, $item['unit'], 0]);
                }
            }

            // Auto-increment stock jika status Diterima
            if ($newStatus === 'Diterima' && !empty($d['items'])) {
                foreach ($d['items'] as $i) {
                    adjustWarehouseStockAllowNegative($pdo,$warehouseId,$branchId,$i['itemId'],(int)$i['qty']);
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $rId], 'Penerimaan disimpan');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan penerimaan', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            // Get old status untuk logic stock
            $oldRowStmt = $pdo->prepare("SELECT status,branch_id,warehouse_id FROM goods_receipts WHERE id=? FOR UPDATE");
            $oldRowStmt->execute([$id]);
            $oldRow = $oldRowStmt->fetch();
            if (!$oldRow) throw new InvalidArgumentException('Penerimaan tidak ditemukan');
            $oldStatus = $oldRow['status'] ?? '';
            $oldBranchId = $oldRow['branch_id'] ?? ($d['branchId'] ?? 'BR-001');
            $newBranchId = (string)($d['branchId'] ?? $oldBranchId);
            $oldWarehouseId=(string)($oldRow['warehouse_id']??defaultWarehouseId($pdo,(string)$oldBranchId));
            $newWarehouseId=(string)($d['warehouseId']??$oldWarehouseId);
            $actor = $requestUser ?? requireAuthenticatedUser($pdo);
            requireAccessibleBranch($pdo, $actor, (string)$oldBranchId);
            requireAccessibleBranch($pdo, $actor, $newBranchId);
            if (empty($d['items']) || !is_array($d['items'])) throw new InvalidArgumentException('Tambahkan minimal satu barang');
            $newStatus = (string)($d['status'] ?? 'Draft');
            if (!in_array($newStatus, ['Draft', 'Diterima', 'Batal'], true)) throw new InvalidArgumentException('Status penerimaan hanya boleh Draft, Diterima, atau Batal');
            $oldItems = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $oldItems->execute([$id]);
            $oldItemsList = $oldItems->fetchAll();
            foreach ($oldItemsList as $oldItem) {
                if ((int)$oldItem['qty_invoiced'] > 0) throw new DomainException('Penerimaan yang sudah difakturkan tidak boleh diubah. Koreksi atau hapus faktur pembelian terlebih dahulu.');
            }
            $warehouseCheck=$pdo->prepare("SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=1");$warehouseCheck->execute([$newWarehouseId,$newBranchId]);
            if(!$warehouseCheck->fetch())throw new InvalidArgumentException('Gudang tujuan tidak valid');
            $supplier=null;
            if(!empty($d['supplierId'])){$supplierCheck=$pdo->prepare("SELECT id,name FROM suppliers WHERE id=? AND is_active=1");$supplierCheck->execute([$d['supplierId']]);$supplier=$supplierCheck->fetch();if(!$supplier)throw new InvalidArgumentException('Supplier tidak ditemukan atau nonaktif');}

            $stmt=$pdo->prepare("UPDATE goods_receipts SET receipt_number=?,date=?,supplier_id=?,supplier_name=?,do_number=?,status=?,notes=?,branch_id=?,warehouse_id=?,received_by=?,received_by_id=? WHERE id=?");
            $stmt->execute([
                $d['receiptNumber'], $d['date'],
                $supplier['id']??null,$supplier['name']??'', $d['doNumber'] ?? '',
                $newStatus, $d['notes'] ?? '',
                $newBranchId,$newWarehouseId,$actor['name']??$actor['username']??'System',$actor['id']??null,
                $id
            ]);

            $pdo->prepare("DELETE FROM goods_receipt_items WHERE receipt_id = ?")->execute([$id]);
            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $itemCheck = $pdo->prepare("SELECT code,name,unit,type FROM items WHERE id=? AND is_active=1");
                $seenItems = [];
                foreach ($d['items'] as $i) {
                    $itemCheck->execute([$i['itemId'] ?? '']);
                    $item = $itemCheck->fetch();
                    $qty = (int)($i['qty'] ?? 0);
                    if (!$item || $item['type'] !== 'Persediaan' || $qty <= 0) throw new InvalidArgumentException('Penerimaan hanya boleh berisi barang persediaan aktif dengan qty lebih dari 0');
                    if (isset($seenItems[(string)$i['itemId']])) throw new InvalidArgumentException('Barang yang sama tidak boleh diduplikasi dalam satu penerimaan');
                    $seenItems[(string)$i['itemId']] = true;
                    $iStmt->execute([$id, $i['itemId'], $item['code'], $item['name'], $qty, $item['unit'], 0]);
                }
            }

            // Stock logic
            $wasReceived = in_array($oldStatus, ['Diterima', 'Difakturkan', 'Sebagian']);
            $isReceived = in_array($newStatus, ['Diterima', 'Difakturkan', 'Sebagian']);

            // Selalu balikkan dampak lama lalu terapkan dampak baru.
            // Ini juga menangani perubahan qty, item, atau cabang.
            if ($wasReceived) {
                foreach ($oldItemsList as $i) {
                    adjustWarehouseStockAllowNegative($pdo,$oldWarehouseId,$oldBranchId,$i['item_id'],-(int)$i['qty']);
                }
            }
            if ($isReceived) {
                foreach ($d['items'] as $i) {
                    adjustWarehouseStockAllowNegative($pdo,$newWarehouseId,$newBranchId,$i['itemId'],(int)$i['qty']);
                }
            }

            $pdo->commit();
            respondSuccess(null, 'Penerimaan diupdate');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update penerimaan', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->beginTransaction();
        try {
            $rowStmt=$pdo->prepare("SELECT status,branch_id,warehouse_id FROM goods_receipts WHERE id=? FOR UPDATE");
            $rowStmt->execute([$id]);
            $row = $rowStmt->fetch();
            if (!$row) throw new InvalidArgumentException('Penerimaan tidak ditemukan');
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), (string)$row['branch_id']);
            $linked = $pdo->prepare("SELECT COUNT(*) FROM purchase_invoice_items WHERE receipt_id=?");
            $linked->execute([$id]);
            if ((int)$linked->fetchColumn() > 0) throw new DomainException('Penerimaan sudah dipakai pada faktur pembelian dan tidak dapat dihapus');
            if ($row && in_array($row['status'], ['Diterima', 'Difakturkan', 'Sebagian'])) {
                $items = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
                $items->execute([$id]);
                foreach ($items->fetchAll() as $i) {
                    if (!empty($i['item_id'])) {
                        adjustWarehouseStockAllowNegative($pdo,(string)($row['warehouse_id']?:defaultWarehouseId($pdo,(string)$row['branch_id'])),(string)$row['branch_id'],$i['item_id'],-(int)$i['qty']);
                    }
                }
            }
            $pdo->prepare("DELETE FROM goods_receipts WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(null, 'Penerimaan dihapus');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 409);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal menghapus penerimaan', 500, $e->getMessage());
        }
        break;

    default: respondError('Method not allowed', 405);
}
