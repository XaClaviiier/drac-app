<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['woNumber'] = $r['wo_number'];
            $r['customerRefId'] = $r['customer_ref_id'];
            $r['customerId'] = $r['customer_id'];
            $r['customerName'] = $r['customer_name'];
            $r['vehicleRefId'] = $r['vehicle_ref_id'];
            $r['plateNumber'] = $r['plate_number'];
            $r['vehicleInfo'] = $r['vehicle_info'];
            $r['branchId'] = $r['branch_id'];
            $r['invoiceId'] = $r['invoice_id'];
            $r['invoiceNumber'] = $r['invoice_number'];
            $r['total'] = (float)$r['total'];
            $r['findings'] = $r['findings'] ?? null;
            $r['estimateTotal'] = isset($r['estimate_total']) ? (float)$r['estimate_total'] : null;
            $r['approvedAt'] = $r['approved_at'] ?? null;
            $r['continuedFromWoId'] = $r['continued_from_wo_id'] ?? null;
            $r['continuedFromWoNumber'] = $r['continued_from_wo_number'] ?? null;
            $r['continuedFromBranchName'] = $r['continued_from_branch_name'] ?? null;
            $r['continuedToWoId'] = $r['continued_to_wo_id'] ?? null;
            $r['continuedToWoNumber'] = $r['continued_to_wo_number'] ?? null;
            $r['continuedToBranchName'] = $r['continued_to_branch_name'] ?? null;
            // Load services
            $stmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
            $stmt->execute([$r['id']]);
            $services = $stmt->fetchAll();
            $r['services'] = array_map(function($s) {
                return [
                    'id' => (string)$s['id'],
                    'itemId' => $s['item_id'],
                    'code' => $s['code'],
                    'name' => $s['name'],
                    'description' => $s['description'],
                    'price' => (float)$s['price'],
                    'qty' => (int)$s['qty'],
                ];
            }, $services);
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $woId = $d['id'] ?? generateId();
            $stmt = $pdo->prepare("INSERT INTO work_orders (id, wo_number, date, customer_ref_id, customer_id, customer_name, vehicle_ref_id, plate_number, vehicle_info, description, findings, total, estimate_total, approved_at, status, notes, branch_id, continued_from_wo_id, continued_from_wo_number, continued_from_branch_name, continued_to_wo_id, continued_to_wo_number, continued_to_branch_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $woId, $d['woNumber'], $d['date'],
                $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
                $d['vehicleRefId'] ?? '', $d['plateNumber'] ?? '', $d['vehicleInfo'] ?? '',
                $d['description'] ?? '', $d['findings'] ?? null, $d['total'] ?? 0,
                $d['estimateTotal'] ?? null, $d['approvedAt'] ?? null,
                $d['status'] ?? 'Pengecekan', $d['notes'] ?? '', $d['branchId'] ?? 'BR-001',
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $d['continuedToWoId'] ?? null, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null
            ]);

            if (!empty($d['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['services'] as $s) {
                    $qty = $s['qty'] ?? 1;
                    $price = $s['price'] ?? 0;
                    $sStmt->execute([$woId, $s['itemId'] ?? null, $s['code'] ?? '', $s['name'], $s['description'] ?? '', $price, $qty, $price * $qty]);
                }
            }
            $pdo->commit();
            respondSuccess(['id' => $woId], 'Order kerja disimpan');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan WO', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("UPDATE work_orders SET wo_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_ref_id=?, plate_number=?, vehicle_info=?, description=?, findings=?, total=?, estimate_total=?, approved_at=?, status=?, notes=?, branch_id=?, invoice_id=?, invoice_number=?, continued_from_wo_id=?, continued_from_wo_number=?, continued_from_branch_name=?, continued_to_wo_id=?, continued_to_wo_number=?, continued_to_branch_name=? WHERE id=?");
            $stmt->execute([
                $d['woNumber'], $d['date'],
                $d['customerRefId'] ?? '', $d['customerId'] ?? '', $d['customerName'] ?? '',
                $d['vehicleRefId'] ?? '', $d['plateNumber'] ?? '', $d['vehicleInfo'] ?? '',
                $d['description'] ?? '', $d['findings'] ?? null, $d['total'] ?? 0,
                $d['estimateTotal'] ?? null, $d['approvedAt'] ?? null,
                $d['status'] ?? 'Pengecekan', $d['notes'] ?? '', $d['branchId'] ?? 'BR-001',
                $d['invoiceId'] ?? null, $d['invoiceNumber'] ?? null,
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $d['continuedToWoId'] ?? null, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null,
                $id
            ]);

            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id = ?")->execute([$id]);
            if (!empty($d['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['services'] as $s) {
                    $qty = $s['qty'] ?? 1;
                    $price = $s['price'] ?? 0;
                    $sStmt->execute([$id, $s['itemId'] ?? null, $s['code'] ?? '', $s['name'], $s['description'] ?? '', $price, $qty, $price * $qty]);
                }
            }
            $pdo->commit();
            respondSuccess(null, 'WO diupdate');
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update WO', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM work_orders WHERE id=?")->execute([$id]);
        respondSuccess(null, 'WO dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
