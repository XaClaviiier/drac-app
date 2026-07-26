<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
        foreach ($rows as &$r) {
            $r['plateNumber'] = $r['plate_number'];
            $r['customerId'] = $r['customer_code'] ?: $r['customer_id'];
            $r['customerName'] = $r['customer_name'];
            $r['registrationDate'] = $r['registration_date'];
            $r['branchId'] = $r['branch_id'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $stmt = $pdo->prepare("INSERT INTO vehicles (id, plate_number, brand, model, year, color, customer_id, customer_name, customer_code, phone, address, registration_date, notes, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['plateNumber'], $d['brand'] ?? '', $d['model'] ?? '',
            $d['year'] ?? 0, $d['color'] ?? '',
            $d['customerRefId'] ?? '', $d['customerName'] ?? '',
            $d['customerId'] ?? '', $d['phone'] ?? '', $d['address'] ?? '',
            $d['registrationDate'] ?? nowDate(),
            $d['notes'] ?? '', $d['branchId'] ?? 'BR-001'
        ]);
        respondSuccess(null, 'Kendaraan ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $stmt = $pdo->prepare("UPDATE vehicles SET plate_number=?, brand=?, model=?, year=?, color=?, customer_id=?, customer_name=?, customer_code=?, phone=?, address=?, notes=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $d['plateNumber'], $d['brand'] ?? '', $d['model'] ?? '',
            $d['year'] ?? 0, $d['color'] ?? '',
            $d['customerRefId'] ?? '', $d['customerName'] ?? '',
            $d['customerId'] ?? '', $d['phone'] ?? '', $d['address'] ?? '',
            $d['notes'] ?? '', $d['branchId'] ?? 'BR-001', $id
        ]);
        respondSuccess(null, 'Kendaraan diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM vehicles WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Kendaraan dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
