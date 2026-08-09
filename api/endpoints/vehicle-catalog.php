<?php
// Master merek, tipe/model, dan warna kendaraan.
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_brands (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_models (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vehicle_model (brand_id, name),
    CONSTRAINT fk_vehicle_model_brand FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_colors (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Menjaga instalasi lama tetap kompatibel tanpa migrasi manual.
foreach (['vehicle_brands', 'vehicle_models', 'vehicle_colors'] as $catalogTable) {
    $column = $pdo->query("SHOW COLUMNS FROM {$catalogTable} LIKE 'sort_order'")->fetch();
    if (!$column) $pdo->exec("ALTER TABLE {$catalogTable} ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER is_active");
}

$defaults = [
    'Toyota'=>['Agya','Avanza','Calya','Camry','Fortuner','Innova','Raize','Rush','Veloz','Yaris'],
    'Honda'=>['Brio','BR-V','City','Civic','CR-V','HR-V','Jazz','Mobilio'],
    'Suzuki'=>['APV','Baleno','Carry','Ertiga','Grand Vitara','Ignis','Jimny','S-Presso','XL7'],
    'Daihatsu'=>['Ayla','Gran Max','Luxio','Rocky','Sigra','Sirion','Terios','Xenia'],
    'Mitsubishi'=>['Colt L300','Outlander','Pajero Sport','Triton','Xpander','Xpander Cross'],
    'Nissan'=>['Almera','Grand Livina','Kicks','Livina','Magnite','Navara','Serena','X-Trail'],
    'Hyundai'=>['Creta','H-1','Ioniq','Kona','Palisade','Santa Fe','Stargazer','Tucson'],
    'Kia'=>['Carens','Carnival','Picanto','Rio','Seltos','Sonet','Sportage'],
    'Wuling'=>['Air ev','Almaz','BinguoEV','Cloud EV','Confero','Cortez','Formo'],
    'DFSK'=>['Gelora','Glory 560','Glory i-Auto','Super Cab'],
    'Isuzu'=>['D-Max','MU-X','Panther','Traga'],
    'Mazda'=>['CX-3','CX-5','CX-8','CX-9','Mazda2','Mazda3','Mazda6'],
    'Lexus'=>['ES','LM','LS','LX','NX','RX','UX'],
    'BMW'=>['Seri 2','Seri 3','Seri 5','Seri 7','X1','X3','X5','X7'],
    'Mercedes-Benz'=>['A-Class','C-Class','E-Class','GLA','GLC','GLE','S-Class'],
    'Lainnya'=>[]
];
$brandInsert = $pdo->prepare("INSERT IGNORE INTO vehicle_brands(id,name,is_active) VALUES(?,?,1)");
$modelInsert = $pdo->prepare("INSERT IGNORE INTO vehicle_models(id,brand_id,name,is_active) VALUES(?,?,?,1)");
foreach ($defaults as $brandName => $models) {
    $brandId = 'VB-' . substr(sha1(strtolower($brandName)), 0, 16);
    $brandInsert->execute([$brandId, $brandName]);
    foreach ($models as $modelName) {
        $modelInsert->execute(['VM-' . substr(sha1(strtolower($brandName . '|' . $modelName)), 0, 16), $brandId, $modelName]);
    }
}
$colorInsert = $pdo->prepare("INSERT IGNORE INTO vehicle_colors(id,name,is_active) VALUES(?,?,1)");
foreach (['Hitam','Putih','Silver','Abu-abu','Merah','Biru','Cokelat','Hijau','Kuning','Oranye','Ungu','Emas','Lainnya'] as $colorName) {
    $colorInsert->execute(['VC-' . substr(sha1(strtolower($colorName)), 0, 16), $colorName]);
}

// Hubungkan data lama hanya jika pasangan merek dan tipe cocok persis
// tanpa membedakan kapital. Ejaan yang meragukan tetap dibiarkan untuk
// diverifikasi manusia melalui editor kendaraan.
$pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand_id VARCHAR(64) NULL AFTER model");
$pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_id VARCHAR(64) NULL AFTER brand_id");
$pdo->exec("
    UPDATE vehicles v
    JOIN vehicle_brands b ON LOWER(TRIM(b.name))=LOWER(TRIM(v.brand))
    JOIN vehicle_models m ON m.brand_id=b.id AND LOWER(TRIM(m.name))=LOWER(TRIM(v.model))
    SET v.brand_id=b.id,v.model_id=m.id,v.brand=b.name,v.model=m.name
    WHERE v.brand_id IS NULL OR v.model_id IS NULL OR v.brand<>b.name OR v.model<>m.name
");

function requireVehicleCatalogManager(PDO $pdo): array {
    $user = requireAuthenticatedUser($pdo);
    if (!empty($user['is_owner'])) return $user;
    $stmt = $pdo->prepare("SELECT name FROM roles WHERE id = ?");
    $stmt->execute([$user['role_id'] ?? '']);
    if (strtolower((string)$stmt->fetchColumn()) !== 'administrator') respondError('Hanya Owner atau Administrator yang dapat mengubah master kendaraan', 403);
    return $user;
}

switch ($method) {
    case 'GET':
        requireAuthenticatedUser($pdo);
        $brands = $pdo->query("SELECT id,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_brands ORDER BY sort_order,name")->fetchAll();
        $models = $pdo->query("SELECT id,brand_id AS brandId,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_models ORDER BY sort_order,name")->fetchAll();
        $colors = $pdo->query("SELECT id,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_colors ORDER BY sort_order,name")->fetchAll();
        foreach ($brands as &$brand) {
            $brand['isActive'] = (bool)$brand['isActive'];
            $brand['models'] = array_values(array_filter($models, fn($model) => $model['brandId'] === $brand['id']));
            foreach ($brand['models'] as &$model) $model['isActive'] = (bool)$model['isActive'];
        }
        foreach ($colors as &$color) $color['isActive'] = (bool)$color['isActive'];
        respondSuccess(['brands'=>$brands, 'colors'=>$colors]);
        break;

    case 'POST':
        requireVehicleCatalogManager($pdo);
        $d = getInput(); $entity = $d['entity'] ?? ''; $name = trim((string)($d['name'] ?? ''));
        if ($name === '') respondError('Nama wajib diisi', 422);
        try {
            if ($entity === 'brand') $pdo->prepare("INSERT INTO vehicle_brands(id,name,is_active,sort_order) SELECT ?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_brands")->execute([generateId(),$name]);
            elseif ($entity === 'model') $pdo->prepare("INSERT INTO vehicle_models(id,brand_id,name,is_active,sort_order) SELECT ?,?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_models WHERE brand_id=?")->execute([generateId(),$d['brandId'] ?? '',$name,$d['brandId'] ?? '']);
            elseif ($entity === 'color') $pdo->prepare("INSERT INTO vehicle_colors(id,name,is_active,sort_order) SELECT ?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_colors")->execute([generateId(),$name]);
            else respondError('Jenis master tidak valid', 422);
        } catch (PDOException $e) { respondError('Nama sudah digunakan atau data induk tidak valid', 409); }
        respondSuccess(null, 'Master kendaraan ditambahkan');
        break;

    case 'PUT':
        requireVehicleCatalogManager($pdo);
        if (!$id) respondError('ID required');
        $d = getInput(); $entity = $d['entity'] ?? '';
        if (($d['action'] ?? '') === 'reorder') {
            $table = $entity === 'brand' ? 'vehicle_brands' : ($entity === 'model' ? 'vehicle_models' : ($entity === 'color' ? 'vehicle_colors' : ''));
            $orderedIds = is_array($d['orderedIds'] ?? null) ? $d['orderedIds'] : [];
            if ($table === '' || !$orderedIds) respondError('Urutan master tidak valid', 422);
            $pdo->beginTransaction();
            try {
                $sort = $pdo->prepare("UPDATE {$table} SET sort_order=? WHERE id=?");
                foreach ($orderedIds as $index => $orderedId) $sort->execute([($index + 1) * 10, $orderedId]);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                respondError('Gagal menyimpan urutan master', 500);
            }
            respondSuccess(null, 'Urutan master kendaraan disimpan');
        }
        $name = trim((string)($d['name'] ?? '')); $active = !empty($d['isActive']) ? 1 : 0;
        if ($name === '') respondError('Nama wajib diisi', 422);
        $table = $entity === 'brand' ? 'vehicle_brands' : ($entity === 'model' ? 'vehicle_models' : ($entity === 'color' ? 'vehicle_colors' : ''));
        if ($table === '') respondError('Jenis master tidak valid', 422);
        try {
            $oldStmt = $pdo->prepare("SELECT name" . ($entity === 'model' ? ",brand_id" : "") . " FROM {$table} WHERE id=?");
            $oldStmt->execute([$id]);
            $old = $oldStmt->fetch();
            if (!$old) respondError('Master kendaraan tidak ditemukan', 404);
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE {$table} SET name=?,is_active=? WHERE id=?")->execute([$name,$active,$id]);
            if ($entity === 'brand') {
                $pdo->prepare("UPDATE vehicles SET brand=?,brand_id=? WHERE brand_id=? OR LOWER(TRIM(brand))=LOWER(TRIM(?))")
                    ->execute([$name,$id,$id,$old['name']]);
            } elseif ($entity === 'model') {
                $pdo->prepare("UPDATE vehicles SET model=?,model_id=? WHERE (model_id=? OR LOWER(TRIM(model))=LOWER(TRIM(?))) AND (brand_id=? OR LOWER(TRIM(brand))=(SELECT LOWER(TRIM(name)) FROM vehicle_brands WHERE id=?))")
                    ->execute([$name,$id,$id,$old['name'],$old['brand_id'],$old['brand_id']]);
            }
            $pdo->commit();
        }
        catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Nama sudah digunakan', 409);
        }
        respondSuccess(null, 'Master kendaraan diperbarui');
        break;

    default: respondError('Method not allowed', 405);
}
