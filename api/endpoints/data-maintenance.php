<?php
$owner = requireOwner($pdo);
$from = (string)($_GET['from'] ?? '');
$to = (string)($_GET['to'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $from > $to) {
    respondError('Periode tidak valid', 422);
}

function maintenanceIds(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function maintenancePlaceholders(array $ids): string {
    return implode(',', array_fill(0, count($ids), '?'));
}

function maintenanceCount(PDO $pdo, string $table, string $where, array $params): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}");
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function maintenanceRecalculateInvoice(PDO $pdo, string $invoiceId): void {
    $sum = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE invoice_id=?');
    $sum->execute([$invoiceId]);
    $paid = (float)$sum->fetchColumn();
    $invoice = $pdo->prepare('SELECT total FROM sales_invoices WHERE id=? FOR UPDATE');
    $invoice->execute([$invoiceId]);
    $row = $invoice->fetch();
    if (!$row) return;
    $paid = min($paid, (float)$row['total']);
    $last = $pdo->prepare('SELECT date,payment_method FROM customer_payments WHERE invoice_id=? ORDER BY date DESC,created_at DESC LIMIT 1');
    $last->execute([$invoiceId]);
    $latest = $last->fetch();
    $method = (string)($latest['payment_method'] ?? 'Tunai');
    if ($method !== 'Tunai') $method = 'Transfer';
    $status = $paid >= (float)$row['total'] ? 'Lunas' : 'Belum Lunas';
    $pdo->prepare('UPDATE sales_invoices SET payment=?,payment_date=?,payment_method=?,status=? WHERE id=?')
        ->execute([$paid, $latest['date'] ?? null, $method, $status, $invoiceId]);
}

$woIds = maintenanceIds($pdo, 'SELECT id FROM work_orders WHERE date BETWEEN ? AND ?', [$from, $to]);
$invoiceSql = 'SELECT id FROM sales_invoices WHERE date BETWEEN ? AND ?';
$invoiceParams = [$from, $to];
if ($woIds) {
    $invoiceSql .= ' OR wo_id IN (' . maintenancePlaceholders($woIds) . ')';
    $invoiceParams = array_merge($invoiceParams, $woIds);
}
$invoiceIds = maintenanceIds($pdo, $invoiceSql, $invoiceParams);

$paymentSql = 'SELECT id FROM customer_payments WHERE date BETWEEN ? AND ?';
$paymentParams = [$from, $to];
if ($invoiceIds) {
    $paymentSql .= ' OR invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')';
    $paymentParams = array_merge($paymentParams, $invoiceIds);
}
$paymentIds = maintenanceIds($pdo, $paymentSql, $paymentParams);
$vehicleIds = maintenanceIds($pdo, 'SELECT id FROM vehicles WHERE DATE(created_at) BETWEEN ? AND ?', [$from, $to]);
$customerIds = maintenanceIds($pdo, 'SELECT id FROM customers WHERE DATE(created_at) BETWEEN ? AND ?', [$from, $to]);

$preview = [
    'from' => $from,
    'to' => $to,
    'workOrders' => count($woIds),
    'workOrderServices' => $woIds ? maintenanceCount($pdo, 'work_order_services', 'wo_id IN (' . maintenancePlaceholders($woIds) . ')', $woIds) : 0,
    'invoices' => count($invoiceIds),
    'invoiceItems' => $invoiceIds ? maintenanceCount($pdo, 'sales_invoice_items', 'invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')', $invoiceIds) : 0,
    'payments' => count($paymentIds),
    'vehicles' => count($vehicleIds),
    'customers' => count($customerIds),
];

if ($method === 'GET') respondSuccess($preview);
if ($method !== 'POST') respondError('Method not allowed', 405);

$input = getInput();
if (($input['confirmation'] ?? '') !== 'HAPUS DATA') respondError('Konfirmasi penghapusan tidak sesuai', 422);

$pdo->exec("CREATE TABLE IF NOT EXISTS data_purge_runs (
    id VARCHAR(64) PRIMARY KEY, period_from DATE NOT NULL, period_to DATE NOT NULL,
    summary_json LONGTEXT NOT NULL, created_by VARCHAR(64) NULL, created_by_name VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS data_purge_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, purge_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(60) NOT NULL, entity_id VARCHAR(100) NOT NULL, snapshot_json LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_purge_snapshot (purge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$purgeId = 'PURGE-' . date('YmdHis') . '-' . substr(generateId(), -6);
$pdo->beginTransaction();
try {
    $snapshotStmt = $pdo->prepare('INSERT INTO data_purge_snapshots(purge_id,entity_type,entity_id,snapshot_json) VALUES(?,?,?,?)');
    $snapshotRows = static function (string $table, string $type, string $where, array $params) use ($pdo, $snapshotStmt, $purgeId): array {
        $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE {$where} FOR UPDATE");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as $row) {
            $id = (string)($row['id'] ?? $row['payment_number'] ?? uniqid());
            $snapshotStmt->execute([$purgeId, $type, $id, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        }
        return $rows;
    };

    $paymentRows = $paymentIds ? $snapshotRows('customer_payments', 'customer_payment', 'id IN (' . maintenancePlaceholders($paymentIds) . ')', $paymentIds) : [];
    $invoiceRows = $invoiceIds ? $snapshotRows('sales_invoices', 'sales_invoice', 'id IN (' . maintenancePlaceholders($invoiceIds) . ')', $invoiceIds) : [];
    $invoiceItemRows = $invoiceIds ? $snapshotRows('sales_invoice_items', 'sales_invoice_item', 'invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')', $invoiceIds) : [];
    if ($woIds) $snapshotRows('work_order_services', 'work_order_service', 'wo_id IN (' . maintenancePlaceholders($woIds) . ')', $woIds);
    if ($woIds) $snapshotRows('work_orders', 'work_order', 'id IN (' . maintenancePlaceholders($woIds) . ')', $woIds);
    if ($vehicleIds) $snapshotRows('vehicles', 'vehicle', 'id IN (' . maintenancePlaceholders($vehicleIds) . ')', $vehicleIds);
    if ($customerIds) $snapshotRows('customers', 'customer', 'id IN (' . maintenancePlaceholders($customerIds) . ')', $customerIds);

    // Faktur mengurangi stok; kembalikan stok sebelum detail faktur dihapus.
    $invoiceById = [];
    foreach ($invoiceRows as $invoice) $invoiceById[(string)$invoice['id']] = $invoice;
    foreach ($invoiceItemRows as $detail) {
        $itemId = (string)($detail['item_id'] ?? '');
        $invoice = $invoiceById[(string)$detail['invoice_id']] ?? null;
        if ($itemId === '' || !$invoice) continue;
        $typeStmt = $pdo->prepare('SELECT type FROM items WHERE id=?');
        $typeStmt->execute([$itemId]);
        if ((string)$typeStmt->fetchColumn() === 'Persediaan') {
            adjustBranchStockAllowNegative($pdo, (string)$invoice['branch_id'], $itemId, (int)$detail['qty']);
        }
    }

    if ($paymentIds) {
        $pdo->prepare('DELETE FROM customer_payment_audit_logs WHERE payment_id IN (' . maintenancePlaceholders($paymentIds) . ')')->execute($paymentIds);
        $pdo->prepare('DELETE FROM customer_payments WHERE id IN (' . maintenancePlaceholders($paymentIds) . ')')->execute($paymentIds);
    }
    if ($invoiceIds) {
        $pdo->prepare('DELETE FROM customer_payment_audit_logs WHERE invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')')->execute($invoiceIds);
        $pdo->prepare('DELETE FROM sales_invoice_items WHERE invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')')->execute($invoiceIds);
        $pdo->prepare('DELETE FROM sales_invoices WHERE id IN (' . maintenancePlaceholders($invoiceIds) . ')')->execute($invoiceIds);
        $pdo->prepare('UPDATE work_orders SET invoice_id=NULL,invoice_number=NULL WHERE invoice_id IN (' . maintenancePlaceholders($invoiceIds) . ')')->execute($invoiceIds);
    }

    // Pembayaran periode ini pada faktur yang dipertahankan harus menghitung ulang saldo faktur.
    $survivingInvoiceIds = [];
    foreach ($paymentRows as $payment) {
        $linkedInvoiceId = (string)$payment['invoice_id'];
        if (!in_array($linkedInvoiceId, $invoiceIds, true)) $survivingInvoiceIds[$linkedInvoiceId] = true;
    }
    foreach (array_keys($survivingInvoiceIds) as $survivingInvoiceId) maintenanceRecalculateInvoice($pdo, $survivingInvoiceId);

    if ($woIds) {
        $pdo->prepare('UPDATE work_orders SET continued_from_wo_id=NULL,continued_from_wo_number=NULL,continued_from_branch_name=NULL WHERE continued_from_wo_id IN (' . maintenancePlaceholders($woIds) . ')')->execute($woIds);
        $pdo->prepare('UPDATE work_orders SET continued_to_wo_id=NULL,continued_to_wo_number=NULL,continued_to_branch_name=NULL,continued_at=NULL,continued_by=NULL,continued_by_name=NULL,continued_branch_id=NULL WHERE continued_to_wo_id IN (' . maintenancePlaceholders($woIds) . ')')->execute($woIds);
        $pdo->prepare('DELETE FROM work_order_services WHERE wo_id IN (' . maintenancePlaceholders($woIds) . ')')->execute($woIds);
        $pdo->prepare('DELETE FROM work_orders WHERE id IN (' . maintenancePlaceholders($woIds) . ')')->execute($woIds);
    }

    // Master periode harus benar-benar dihapus. Dokumen historis tetap menyimpan
    // nama/nomor plat snapshot, tetapi foreign reference dilepas agar tidak yatim.
    $deletedVehicles = 0;
    if ($vehicleIds) {
        $vehiclePlaceholders = maintenancePlaceholders($vehicleIds);
        $snapshotRows('work_orders', 'work_order_before_vehicle_unlink', "vehicle_ref_id IN ({$vehiclePlaceholders})", $vehicleIds);
        $pdo->prepare("UPDATE work_orders SET vehicle_ref_id=NULL WHERE vehicle_ref_id IN ({$vehiclePlaceholders})")->execute($vehicleIds);
        $delete = $pdo->prepare("DELETE FROM vehicles WHERE id IN ({$vehiclePlaceholders})");
        $delete->execute($vehicleIds);
        $deletedVehicles = $delete->rowCount();
    }
    $deletedCustomers = 0;
    if ($customerIds) {
        $customerPlaceholders = maintenancePlaceholders($customerIds);
        $snapshotRows('work_orders', 'work_order_before_customer_unlink', "customer_ref_id IN ({$customerPlaceholders})", $customerIds);
        $snapshotRows('sales_invoices', 'sales_invoice_before_customer_unlink', "customer_ref_id IN ({$customerPlaceholders})", $customerIds);
        $snapshotRows('vehicles', 'vehicle_before_customer_unlink', "customer_id IN ({$customerPlaceholders})", $customerIds);
        $pdo->prepare("UPDATE work_orders SET customer_ref_id=NULL WHERE customer_ref_id IN ({$customerPlaceholders})")->execute($customerIds);
        $pdo->prepare("UPDATE sales_invoices SET customer_ref_id=NULL WHERE customer_ref_id IN ({$customerPlaceholders})")->execute($customerIds);
        $pdo->prepare("UPDATE vehicles SET customer_id=NULL WHERE customer_id IN ({$customerPlaceholders})")->execute($customerIds);
        $delete = $pdo->prepare("DELETE FROM customers WHERE id IN ({$customerPlaceholders})");
        $delete->execute($customerIds);
        $deletedCustomers = $delete->rowCount();
    }

    $result = array_merge($preview, [
        'purgeId' => $purgeId,
        'vehiclesDeleted' => $deletedVehicles,
        'vehiclesSkipped' => 0,
        'customersDeleted' => $deletedCustomers,
        'customersSkipped' => 0,
    ]);
    $pdo->prepare('INSERT INTO data_purge_runs(id,period_from,period_to,summary_json,created_by,created_by_name) VALUES(?,?,?,?,?,?)')
        ->execute([$purgeId, $from, $to, json_encode($result), $owner['id'] ?? null, $owner['name'] ?? $owner['username'] ?? null]);
    $pdo->commit();
    respondSuccess($result, 'Data periode berhasil dihapus');
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError('Penghapusan dibatalkan: ' . $error->getMessage(), 500);
}
