<?php
$resolveVehicleCatalog = static function (PDO $pdo, array $data): array {
    $brandInput = trim((string)($data['brand'] ?? ''));
    $modelInput = trim((string)($data['model'] ?? ''));
    if ($brandInput === '' || $modelInput === '') {
        throw new InvalidArgumentException('Merek dan tipe/model wajib dipilih.');
    }
    $brandStmt = $pdo->prepare("SELECT id,name,is_active FROM vehicle_brands WHERE id=? OR LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id=? DESC LIMIT 1");
    $brandStmt->execute([(string)($data['brandId'] ?? ''), $brandInput, (string)($data['brandId'] ?? '')]);
    $brand = $brandStmt->fetch();
    if (!$brand || !(bool)$brand['is_active']) throw new InvalidArgumentException('Merek tidak tersedia pada Master Kendaraan. Tambahkan atau aktifkan merek terlebih dahulu.');

    $modelStmt = $pdo->prepare("SELECT id,name,is_active FROM vehicle_models WHERE brand_id=? AND (id=? OR LOWER(TRIM(name))=LOWER(TRIM(?))) ORDER BY id=? DESC LIMIT 1");
    $modelStmt->execute([$brand['id'], (string)($data['modelId'] ?? ''), $modelInput, (string)($data['modelId'] ?? '')]);
    $model = $modelStmt->fetch();
    if (!$model || !(bool)$model['is_active']) throw new InvalidArgumentException('Tipe/model tidak tersedia untuk merek yang dipilih. Tambahkan atau aktifkan tipe terlebih dahulu.');
    $generation = null; $engineCc = null;
    if (!empty($data['generationId']) || trim((string)($data['generationName'] ?? '')) !== '') {
        $generationStmt=$pdo->prepare("SELECT id,name,year_from,year_to,is_active FROM vehicle_generations WHERE model_id=? AND (id=? OR LOWER(TRIM(name))=LOWER(TRIM(?))) LIMIT 1");
        $generationStmt->execute([$model['id'],(string)($data['generationId']??''),trim((string)($data['generationName']??''))]);
        $generation=$generationStmt->fetch();
        if (!$generation || !(bool)$generation['is_active']) throw new InvalidArgumentException('Generasi tidak tersedia untuk tipe yang dipilih.');
        $engineCc=(int)($data['engineCc']??0) ?: null;
        if ($engineCc) {
            $engineStmt=$pdo->prepare("SELECT COUNT(*) FROM vehicle_generation_engines WHERE generation_id=? AND engine_cc=?");
            $engineStmt->execute([$generation['id'],$engineCc]);
            if (!(int)$engineStmt->fetchColumn()) throw new InvalidArgumentException('Kapasitas mesin tidak tersedia untuk generasi yang dipilih. Pilih Belum Diketahui atau perbaiki master.');
        }
        $year=(int)($data['year']??0);
        if ($year && ((!empty($generation['year_from']) && $year<(int)$generation['year_from']) || (!empty($generation['year_to']) && $year>(int)$generation['year_to']))) throw new InvalidArgumentException('Tahun kendaraan berada di luar rentang generasi yang dipilih.');
    }
    return [$brand, $model, $generation, $engineCc];
};

$resolveVehicleColor = static function (PDO $pdo, array $data): array {
    $colorInput = trim((string)($data['color'] ?? ''));
    if ($colorInput === '' || strtolower($colorInput) === 'lainnya') {
        throw new InvalidArgumentException('Warna kendaraan wajib dipilih secara jelas. Warna "Lainnya" tidak diperbolehkan.');
    }
    $stmt = $pdo->prepare("SELECT id,name,is_active FROM vehicle_colors WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1");
    $stmt->execute([$colorInput]);
    $color = $stmt->fetch();
    if (!$color || !(bool)$color['is_active']) {
        throw new InvalidArgumentException('Warna tidak tersedia pada Master Kendaraan. Tambahkan warna yang sebenarnya terlebih dahulu.');
    }
    return $color;
};

switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
        foreach ($rows as &$r) {
            $r['plateNumber']        = $r['plate_number'];
            $r['brandId']            = $r['brand_id'] ?? null;
            $r['modelId']            = $r['model_id'] ?? null;
            $r['generationId']       = $r['generation_id'] ?? null;
            $r['generationName']     = $r['generation_name'] ?? '';
            $r['engineCc']           = isset($r['engine_cc']) ? (int)$r['engine_cc'] : null;
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
        try { [$brand, $model, $generation, $engineCc] = $resolveVehicleCatalog($pdo, $d); $color = $resolveVehicleColor($pdo, $d); }
        catch (InvalidArgumentException $e) { respondError($e->getMessage(), 422); }
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

        $stmt = $pdo->prepare("INSERT INTO vehicles (id, plate_number, brand, model, brand_id, model_id, generation_id, generation_name, engine_cc, year, color, customer_id, customer_name, customer_code, phone, address, registration_date, notes, branch_id, first_seen_branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $plate, $brand['name'], $model['name'], $brand['id'], $model['id'],
            $generation['id']??null,$generation['name']??'',$engineCc,
            $d['year'] ?? 0, $color['name'],
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
        try { [$brand, $model, $generation, $engineCc] = $resolveVehicleCatalog($pdo, $d); $color = $resolveVehicleColor($pdo, $d); }
        catch (InvalidArgumentException $e) { respondError($e->getMessage(), 422); }
        $customerStmt = $pdo->prepare("SELECT id, customer_code, name, phone, address FROM customers WHERE id = ?");
        $customerStmt->execute([(string)($d['customerRefId'] ?? '')]);
        $customer = $customerStmt->fetch();
        if (!$customer) respondError('Pelanggan kendaraan tidak ditemukan.', 422);
        $duplicate = findVehicleByNormalizedPlate($pdo, $plate, (string)$id);
        if ($duplicate) respondError('Plat sudah terdaftar atas nama ' . $duplicate['customer_name'] . '.', 409);
        $stmt = $pdo->prepare("UPDATE vehicles SET plate_number=?, brand=?, model=?, brand_id=?, model_id=?, generation_id=?, generation_name=?, engine_cc=?, year=?, color=?, customer_id=?, customer_name=?, customer_code=?, phone=?, address=?, notes=?, branch_id=? WHERE id=?");
        $stmt->execute([
            $plate, $brand['name'], $model['name'], $brand['id'], $model['id'],
            $generation['id']??null,$generation['name']??'',$engineCc,
            $d['year'] ?? 0, $color['name'],
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
