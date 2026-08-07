<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
        foreach ($rows as &$r) {
            $r['plateNumber']        = $r['plate_number'];
            $r['customerRefId']      = $r['customer_id'];
            $r['customerId']         = $r['customer_code'] ?: $r['customer_id'];
            $r['customerName']       = $r['customer_name'];
            $r['registrationDate']   = $r['registration_date'];
            $r['createdAt']          = $r['created_at'] ?? null;
            $r['updatedAt']          = $r['updated_at'] ?? null;
            $r['branchId']           = $r['branch_id'];
            $r['firstSeenBranchId']  = $r['first_seen_branch_id'] ?? $r['branch_id'];
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $plate = normalizeVehiclePlate((string)($d['plateNumber'] ?? ''));
        if ($plate === '') respondError('Nomor plat wajib diisi.', 422);
        if (empty($d['brand']) || empty($d['model']) || empty($d['color'])) {
            respondError('Merek, model, dan warna wajib diisi.', 422);
        }
        $customerStmt = $pdo->prepare("SELECT id, customer_code, name, phone, address FROM customers WHERE id = ?");
        $customerStmt->execute([(string)($d['customerRefId'] ?? '')]);
        $customer = $customerStmt->fetch();
        if (!$customer) respondError('Pelanggan kendaraan tidak ditemukan.', 422);
        $duplicate = findVehicleByNormalizedPlate($pdo, $plate);
        if ($duplicate) respondError('Plat sudah terdaftar atas nama ' . $duplicate['customer_name'] . '.', 409);
        $branchId = (string)($d['branchId'] ?? '');
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $branchId);
        $firstSeenBranchId = (string)($d['firstSeenBranchId'] ?? $branchId);
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $firstSeenBranchId);

        $stmt = $pdo->prepare("INSERT INTO vehicles (id, plate_number, brand, model, year, color, customer_id, customer_name, customer_code, phone, address, registration_date, notes, branch_id, first_seen_branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $plate, $d['brand'] ?? '', $d['model'] ?? '',
            $d['year'] ?? 0, $d['color'] ?? '',
            $customer['id'], $customer['name'],
            $customer['customer_code'], $customer['phone'] ?? '', $customer['address'] ?? '',
            $d['registrationDate'] ?? nowDate(),
            $d['notes'] ?? '',
            $branchId, $firstSeenBranchId
        ]);
        respondSuccess(null, 'Kendaraan ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $currentStmt = $pdo->prepare("SELECT branch_id FROM vehicles WHERE id=?");
        $currentStmt->execute([$id]);
        $current = $currentStmt->fetch();
        if (!$current) respondError('Kendaraan tidak ditemukan', 404);
        $branchId = (string)($d['branchId'] ?? $current['branch_id']);
        requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), $branchId);
        $plate = normalizeVehiclePlate((string)($d['plateNumber'] ?? ''));
        if ($plate === '') respondError('Nomor plat wajib diisi.', 422);
        if (empty($d['brand']) || empty($d['model']) || empty($d['color'])) {
            respondError('Merek, model, dan warna wajib diisi.', 422);
        }
        $customerStmt = $pdo->prepare("SELECT id, customer_code, name, phone, address FROM customers WHERE id = ?");
        $customerStmt->execute([(string)($d['customerRefId'] ?? '')]);
        $customer = $customerStmt->fetch();
        if (!$customer) respondError('Pelanggan kendaraan tidak ditemukan.', 422);
        $duplicate = findVehicleByNormalizedPlate($pdo, $plate, (string)$id);
        if ($duplicate) respondError('Plat sudah terdaftar atas nama ' . $duplicate['customer_name'] . '.', 409);
        $stmt = $pdo->prepare("UPDATE vehicles SET plate_number=?, brand=?, model=?, year=?, color=?, customer_id=?, customer_name=?, customer_code=?, phone=?, address=?, notes=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $plate, $d['brand'] ?? '', $d['model'] ?? '',
            $d['year'] ?? 0, $d['color'] ?? '',
            $customer['id'], $customer['name'],
            $customer['customer_code'], $customer['phone'] ?? '', $customer['address'] ?? '',
            $d['notes'] ?? '', $branchId, $id
        ]);
        respondSuccess(null, 'Kendaraan diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $check=$pdo->prepare("SELECT COUNT(*) FROM work_orders WHERE vehicle_ref_id=?");$check->execute([$id]);
        if((int)$check->fetchColumn()>0) respondError('Kendaraan sudah memiliki histori WO dan tidak dapat dihapus.',409);
        $pdo->prepare("DELETE FROM vehicles WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Kendaraan dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
