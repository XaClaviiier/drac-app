<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['customerRefId'] = $r['customer_ref_id'];
            $r['customerId'] = $r['customer_id'];
            $r['customerName'] = $r['customer_name'];
            $r['vehicleInfo'] = $r['vehicle_info'];
            $r['total'] = (float)$r['total'];
            $r['payment'] = (float)$r['payment'];
            $r['age'] = (int)$r['age'];
            $r['woId'] = $r['wo_id'];
            $r['woNumber'] = $r['wo_number'];
            $r['branchId'] = $r['branch_id'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $stmt = $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['invoiceNumber'], $d['date'],
            $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
            $d['vehicleInfo'] ?? '', $d['description'] ?? '',
            $d['total'] ?? 0, $d['payment'] ?? 0,
            $d['status'] ?? 'Belum Lunas', $d['age'] ?? 0,
            $d['woId'] ?? null, $d['woNumber'] ?? null,
            $d['branchId'] ?? 'BR-001'
        ]);
        respondSuccess(null, 'Faktur disimpan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, status=?, age=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $d['invoiceNumber'], $d['date'],
            $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
            $d['vehicleInfo'] ?? '', $d['description'] ?? '',
            $d['total'] ?? 0, $d['payment'] ?? 0,
            $d['status'] ?? 'Belum Lunas', $d['age'] ?? 0,
            $d['branchId'] ?? 'BR-001', $id
        ]);
        respondSuccess(null, 'Faktur diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM sales_invoices WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Faktur dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
