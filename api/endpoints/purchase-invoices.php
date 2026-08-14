<?php
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'Supplier'");
$refreshReceiptStatus = static function (PDO $pdo, string $receiptId): void {
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(qty),0) total_qty, COALESCE(SUM(qty_invoiced),0) invoiced_qty FROM goods_receipt_items WHERE receipt_id=?");
    $stmt->execute([$receiptId]);
    $row = $stmt->fetch();
    $totalQty = (int)($row['total_qty'] ?? 0);
    $invoicedQty = (int)($row['invoiced_qty'] ?? 0);
    $status = $invoicedQty <= 0 ? 'Diterima' : ($invoicedQty >= $totalQty ? 'Difakturkan' : 'Sebagian');
    $pdo->prepare("UPDATE goods_receipts SET status=? WHERE id=? AND status<>'Batal'")->execute([$status, $receiptId]);
};

$normalizePurchaseLines = static function (PDO $pdo, array $lines, string $branchId, ?string $excludeInvoiceId = null): array {
    if (!$lines) throw new InvalidArgumentException('Faktur pembelian wajib memiliki rincian barang');
    $result = [];
    $subtotal = 0.0;
    $itemStmt = $pdo->prepare("SELECT id,code,name,unit,type FROM items WHERE id=? AND is_active=1");
    foreach ($lines as $line) {
        $qty = (int)($line['qty'] ?? 0);
        $unitPrice = (float)($line['unitPrice'] ?? 0);
        $discount = max(0, (float)($line['discount'] ?? 0));
        if ($qty <= 0 || $unitPrice < 0 || empty($line['itemId'])) throw new InvalidArgumentException('Rincian pembelian tidak valid');
        $itemStmt->execute([$line['itemId']]);
        $item = $itemStmt->fetch();
        if (!$item || $item['type'] !== 'Persediaan') throw new InvalidArgumentException('Barang pembelian tidak ditemukan atau bukan persediaan aktif');
        $receiptId = !empty($line['receiptId']) ? (string)$line['receiptId'] : null;
        if ($receiptId) {
            $receiptStmt = $pdo->prepare("SELECT r.branch_id,r.source_type,ri.qty,ri.qty_invoiced FROM goods_receipts r JOIN goods_receipt_items ri ON ri.receipt_id=r.id WHERE r.id=? AND ri.item_id=? FOR UPDATE");
            $receiptStmt->execute([$receiptId, $item['id']]);
            $receipt = $receiptStmt->fetch();
            if (!$receipt || (string)$receipt['branch_id'] !== $branchId) throw new InvalidArgumentException('Penerimaan barang tidak ditemukan atau cabang tidak sesuai');
            if (($receipt['source_type']??'Supplier') === 'Transfer Gudang') throw new InvalidArgumentException('Transfer antar gudang tidak boleh dibuatkan Faktur Pembelian');
            if ($qty > ((int)$receipt['qty'] - (int)$receipt['qty_invoiced'])) throw new InvalidArgumentException('Qty faktur melebihi sisa penerimaan');
        }
        $lineSubtotal = max(0, ($qty * $unitPrice) - $discount);
        $subtotal += $lineSubtotal;
        $result[] = [
            'receiptId' => $receiptId, 'receiptNumber' => (string)($line['receiptNumber'] ?? ''),
            'itemId' => $item['id'], 'itemCode' => $item['code'], 'itemName' => $item['name'],
            'qty' => $qty, 'unit' => $item['unit'], 'unitPrice' => $unitPrice,
            'discount' => $discount, 'subtotal' => $lineSubtotal,
        ];
    }
    return ['items' => $result, 'subtotal' => $subtotal];
};
// Sub-aksi harus ditangani sebelum switch CRUD; jika tidak, POST pembayaran
// akan keliru diproses sebagai pembuatan faktur pembelian baru.
if ($action === 'payments') {
    if (!in_array($method, ['POST', 'DELETE'], true) || !$id) respondError('Method not allowed', 405);
    $d = getInput();
    if ($method === 'DELETE') {
        $paymentId = (string)($d['paymentId'] ?? '');
        if ($paymentId === '') respondError('ID pembayaran wajib diisi', 422);
        $pdo->beginTransaction();
        try {
            $invStmt = $pdo->prepare("SELECT id,total,branch_id FROM purchase_invoices WHERE id=? FOR UPDATE");
            $invStmt->execute([$id]);
            $invoice = $invStmt->fetch();
            if (!$invoice) throw new InvalidArgumentException('Faktur pembelian tidak ditemukan');
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), (string)$invoice['branch_id']);
            $delete = $pdo->prepare("DELETE FROM purchase_payments WHERE id=? AND invoice_id=?");
            $delete->execute([$paymentId, $id]);
            if ($delete->rowCount() !== 1) throw new InvalidArgumentException('Pembayaran supplier tidak ditemukan');
            $paidStmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE invoice_id=?");
            $paidStmt->execute([$id]);
            $paid = (float)$paidStmt->fetchColumn();
            $status = $paid <= 0 ? 'Belum Lunas' : ($paid >= (float)$invoice['total'] ? 'Lunas' : 'Sebagian');
            $pdo->prepare("UPDATE purchase_invoices SET paid_amount=?,status=? WHERE id=?")->execute([$paid,$status,$id]);
            $pdo->commit();
            respondSuccess(null, 'Pembayaran supplier dihapus');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            $pdo->rollBack();
            respondError('Gagal menghapus pembayaran supplier', 500, $e->getMessage());
        }
    }
    $amount = (float)($d['amount'] ?? 0);
    if ($amount <= 0) respondError('Jumlah pembayaran harus lebih dari 0', 422);
    if (empty($d['date'])) respondError('Tanggal pembayaran wajib diisi', 422);
    $paymentDate = (string)$d['date'];
    if ($paymentDate > date('Y-m-d')) respondError('Tanggal pembayaran tidak boleh melebihi hari ini', 422);
    if ($paymentDate < date('Y-m-d')) requireUserPermission($pdo, 'payment:backdate');
    $paymentMethod = (string)($d['paymentMethod'] ?? 'Kas');
    if (!in_array($paymentMethod, ['Kas', 'Transfer Bank', 'Cek', 'Lainnya'], true)) respondError('Metode pembayaran tidak valid', 422);
    $pdo->beginTransaction();
    try {
        $invStmt = $pdo->prepare("SELECT id,total,paid_amount,branch_id FROM purchase_invoices WHERE id=? FOR UPDATE");
        $invStmt->execute([$id]);
        $invoice = $invStmt->fetch();
        if (!$invoice) throw new InvalidArgumentException('Faktur pembelian tidak ditemukan');
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        requireAccessibleBranch($pdo, $actor, (string)$invoice['branch_id']);
        $remaining = max(0, (float)$invoice['total'] - (float)$invoice['paid_amount']);
        if ($amount > $remaining) throw new InvalidArgumentException('Pembayaran melebihi sisa utang supplier');
        $accountId = trim((string)($d['bankAccount'] ?? ''));
        if ($accountId === '') throw new InvalidArgumentException('Akun kas/bank pembayaran wajib dipilih');
        $accountStmt = $pdo->prepare("SELECT id,account_type,branch_id FROM cash_accounts WHERE id COLLATE utf8mb4_unicode_ci=? COLLATE utf8mb4_unicode_ci AND is_active=1 FOR UPDATE");
        $accountStmt->execute([$accountId]);
        $account = $accountStmt->fetch();
        if (!$account) throw new InvalidArgumentException('Akun kas/bank pembayaran tidak ditemukan atau nonaktif');
        $expectedType = $paymentMethod === 'Kas' ? 'cash' : 'bank';
        if ((string)$account['account_type'] !== $expectedType) throw new InvalidArgumentException($expectedType === 'cash' ? 'Metode Kas harus menggunakan akun kas tunai' : 'Metode ini harus menggunakan akun bank');
        if (!empty($account['branch_id']) && (string)$account['branch_id'] !== (string)$invoice['branch_id']) throw new InvalidArgumentException('Akun pembayaran tidak sesuai cabang faktur');
        $payId = $d['id'] ?? generateId();
        $paymentNumber = 'PP-' . date('ymdHis') . '-' . strtoupper(substr($payId, -4));
        $pdo->prepare("INSERT INTO purchase_payments (id,payment_number,invoice_id,date,amount,payment_method,account_id,bank_account,notes,branch_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
            ->execute([$payId,$paymentNumber,$id,$paymentDate,$amount,$paymentMethod,$accountId,$accountId,$d['notes'] ?? '',$invoice['branch_id']]);
        $paid = (float)$invoice['paid_amount'] + $amount;
        $status = $paid >= (float)$invoice['total'] ? 'Lunas' : 'Sebagian';
        $pdo->prepare("UPDATE purchase_invoices SET paid_amount=?,status=? WHERE id=?")->execute([$paid,$status,$id]);
        $pdo->commit();
        respondSuccess(['id'=>$payId,'paymentNumber'=>$paymentNumber], 'Pembayaran supplier dicatat');
    } catch (InvalidArgumentException $e) {
        $pdo->rollBack();
        respondError($e->getMessage(), 422);
    } catch (Throwable $e) {
        $pdo->rollBack();
        respondError('Gagal mencatat pembayaran supplier', 500, $e->getMessage());
    }
}

switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = array_values(array_filter(
            $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll(),
            fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])
        ));
        foreach ($rows as &$r) {
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['dueDate'] = $r['due_date'];
            $r['supplierId'] = $r['supplier_id'];
            $r['supplierName'] = $r['supplier_name'];
            $r['supplierInvoiceNumber'] = $r['supplier_invoice_number'];
            $r['subtotal'] = (float)$r['subtotal'];
            $r['discount'] = (float)$r['discount'];
            $r['tax'] = (float)$r['tax'];
            $r['total'] = (float)$r['total'];
            $r['paidAmount'] = (float)$r['paid_amount'];
            $r['branchId'] = $r['branch_id'];
            $r['createdAt'] = $r['created_at'];

            // Load items
            $stmt = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id = ?");
            $stmt->execute([$r['id']]);
            $r['items'] = array_map(function($i) {
                return [
                    'id' => (string)$i['id'],
                    'receiptId' => $i['receipt_id'],
                    'receiptNumber' => $i['receipt_number'],
                    'itemId' => $i['item_id'],
                    'itemCode' => $i['item_code'],
                    'itemName' => $i['item_name'],
                    'qty' => (int)$i['qty'],
                    'unit' => $i['unit'],
                    'unitPrice' => (float)$i['unit_price'],
                    'discount' => (float)$i['discount'],
                    'subtotal' => (float)$i['subtotal'],
                ];
            }, $stmt->fetchAll());

            // Get receipt IDs (unique)
            $r['receiptIds'] = array_values(array_unique(array_map(function($x) { return $x['receiptId']; }, $r['items'])));

            // Load payments
            $pStmt = $pdo->prepare("SELECT * FROM purchase_payments WHERE invoice_id = ? ORDER BY date");
            $pStmt->execute([$r['id']]);
            $r['payments'] = array_map(function($p) {
                return [
                    'id' => $p['id'],
                    'paymentNumber' => $p['payment_number'],
                    'date' => $p['date'],
                    'amount' => (float)$p['amount'],
                    'paymentMethod' => $p['payment_method'],
                    'bankAccount' => $p['bank_account'],
                    'notes' => $p['notes'],
                ];
            }, $pStmt->fetchAll());
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $branchId = (string)($d['branchId'] ?? '');
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $branchId);
        if (empty($d['supplierId'])) respondError('Supplier wajib dipilih', 422);
        $supplierStmt = $pdo->prepare("SELECT id,name FROM suppliers WHERE id=? AND is_active=1");
        $supplierStmt->execute([$d['supplierId']]);
        $supplier = $supplierStmt->fetch();
        if (!$supplier) respondError('Supplier tidak ditemukan atau nonaktif', 422);
        if (empty($d['items']) || !is_array($d['items'])) respondError('Faktur pembelian wajib memiliki rincian barang', 422);
        $pdo->beginTransaction();
        try {
            $normalized = $normalizePurchaseLines($pdo, $d['items'], $branchId);
            $invoiceDiscount = max(0, (float)($d['discount'] ?? 0));
            $invoiceTax = max(0, (float)($d['tax'] ?? 0));
            $subtotal = $normalized['subtotal'];
            $total = max(0, $subtotal - $invoiceDiscount + $invoiceTax);
            $piId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO purchase_invoices (id, invoice_number, date, due_date, supplier_id, supplier_name, supplier_invoice_number, subtotal, discount, tax, total, paid_amount, status, notes, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $piId, $d['invoiceNumber'], $d['date'], $d['dueDate'] ?? null,
                $d['supplierId'], $supplier['name'],
                $d['supplierInvoiceNumber'] ?? '',
                $subtotal, $invoiceDiscount, $invoiceTax,
                $total, 0,
                'Belum Lunas', $d['notes'] ?? '',
                $branchId
            ]);

            if (!empty($d['items'])) {
                $iStmt = $pdo->prepare("INSERT INTO purchase_invoice_items (invoice_id, receipt_id, receipt_number, item_id, item_code, item_name, qty, unit, unit_price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalized['items'] as $i) {
                    $iStmt->execute([
                        $piId, $i['receiptId'], $i['receiptNumber'],
                        $i['itemId'], $i['itemCode'], $i['itemName'],
                        $i['qty'], $i['unit'], $i['unitPrice'], $i['discount'], $i['subtotal']
                    ]);

                    // Update qty_invoiced di goods_receipt_items
                    if (!empty($i['receiptId'])) {
                        $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced = qty_invoiced + ? WHERE receipt_id = ? AND item_id = ?")
                            ->execute([$i['qty'], $i['receiptId'], $i['itemId']]);
                    }
                }
            }

            // Update status penerimaan
            if (!empty($d['receiptIds'])) {
                foreach ($d['receiptIds'] as $rid) {
                    $refreshReceiptStatus($pdo, (string)$rid);
                }
            }

            $pdo->commit();
            respondSuccess(['id' => $piId], 'Faktur pembelian dibuat');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan faktur pembelian', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $currentStmt = $pdo->prepare("SELECT * FROM purchase_invoices WHERE id=? FOR UPDATE");
            $currentStmt->execute([$id]);
            $current = $currentStmt->fetch();
            if (!$current) throw new InvalidArgumentException('Faktur pembelian tidak ditemukan');
            $branchId = (string)$current['branch_id'];
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $branchId);
            if (empty($d['items']) || !is_array($d['items'])) throw new InvalidArgumentException('Faktur pembelian wajib memiliki rincian barang');

            $oldItemsStmt = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id=? FOR UPDATE");
            $oldItemsStmt->execute([$id]);
            $touchedReceipts = [];
            foreach ($oldItemsStmt->fetchAll() as $oldItem) {
                if (!empty($oldItem['receipt_id'])) {
                    $touchedReceipts[(string)$oldItem['receipt_id']] = true;
                    $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced=GREATEST(0,qty_invoiced-?) WHERE receipt_id=? AND item_id=?")
                        ->execute([(int)$oldItem['qty'], $oldItem['receipt_id'], $oldItem['item_id']]);
                }
            }

            $normalized = $normalizePurchaseLines($pdo, $d['items'], $branchId, (string)$id);
            $invoiceDiscount = max(0, (float)($d['discount'] ?? 0));
            $invoiceTax = max(0, (float)($d['tax'] ?? 0));
            $subtotal = $normalized['subtotal'];
            $total = max(0, $subtotal - $invoiceDiscount + $invoiceTax);
            if ((float)$current['paid_amount'] > $total) throw new InvalidArgumentException('Total baru lebih kecil dari pembayaran yang sudah tercatat');
            $status = (float)$current['paid_amount'] <= 0 ? 'Belum Lunas' : ((float)$current['paid_amount'] >= $total ? 'Lunas' : 'Sebagian');

            $pdo->prepare("DELETE FROM purchase_invoice_items WHERE invoice_id=?")->execute([$id]);
            $insertItem = $pdo->prepare("INSERT INTO purchase_invoice_items (invoice_id,receipt_id,receipt_number,item_id,item_code,item_name,qty,unit,unit_price,discount,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
            foreach ($normalized['items'] as $line) {
                $insertItem->execute([$id,$line['receiptId'],$line['receiptNumber'],$line['itemId'],$line['itemCode'],$line['itemName'],$line['qty'],$line['unit'],$line['unitPrice'],$line['discount'],$line['subtotal']]);
                if ($line['receiptId']) {
                    $touchedReceipts[(string)$line['receiptId']] = true;
                    $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced=qty_invoiced+? WHERE receipt_id=? AND item_id=?")
                        ->execute([$line['qty'],$line['receiptId'],$line['itemId']]);
                }
            }
            $pdo->prepare("UPDATE purchase_invoices SET date=?,due_date=?,supplier_invoice_number=?,subtotal=?,discount=?,tax=?,total=?,status=?,notes=? WHERE id=?")
                ->execute([$d['date'],$d['dueDate'] ?? null,$d['supplierInvoiceNumber'] ?? '',$subtotal,$invoiceDiscount,$invoiceTax,$total,$status,$d['notes'] ?? '',$id]);
            foreach (array_keys($touchedReceipts) as $receiptId) $refreshReceiptStatus($pdo, $receiptId);
            $pdo->commit();
            respondSuccess(null, 'Faktur pembelian diupdate');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            $pdo->rollBack();
            respondError('Gagal mengubah faktur pembelian', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->beginTransaction();
        try {
            $currentStmt = $pdo->prepare("SELECT branch_id,paid_amount FROM purchase_invoices WHERE id=? FOR UPDATE");
            $currentStmt->execute([$id]);
            $current = $currentStmt->fetch();
            if (!$current) throw new InvalidArgumentException('Faktur pembelian tidak ditemukan');
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), (string)$current['branch_id']);
            if ((float)$current['paid_amount'] > 0) throw new DomainException('Hapus pembayaran supplier terlebih dahulu');
            $items = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id=? FOR UPDATE");
            $items->execute([$id]);
            $touchedReceipts = [];
            foreach ($items->fetchAll() as $line) {
                if (!empty($line['receipt_id'])) {
                    $touchedReceipts[(string)$line['receipt_id']] = true;
                    $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced=GREATEST(0,qty_invoiced-?) WHERE receipt_id=? AND item_id=?")
                        ->execute([(int)$line['qty'],$line['receipt_id'],$line['item_id']]);
                }
            }
            $pdo->prepare("DELETE FROM purchase_invoices WHERE id=?")->execute([$id]);
            foreach (array_keys($touchedReceipts) as $receiptId) $refreshReceiptStatus($pdo, $receiptId);
            $pdo->commit();
            respondSuccess(null, 'Faktur pembelian dihapus');
        } catch (InvalidArgumentException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 404);
        } catch (DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 409);
        } catch (Throwable $e) {
            $pdo->rollBack();
            respondError('Gagal menghapus faktur pembelian', 500, $e->getMessage());
        }
        break;

    default: respondError('Method not allowed', 405);
}
