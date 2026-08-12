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
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_generations (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    model_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    aliases VARCHAR(500) NOT NULL DEFAULT '',
    year_from SMALLINT UNSIGNED NULL,
    year_to SMALLINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vehicle_generation(model_id,name),
    KEY idx_generation_model(model_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_generation_engines (
    generation_id VARCHAR(64) NOT NULL,
    engine_cc SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY(generation_id,engine_cc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS generation_id VARCHAR(64) NULL AFTER model_id");
$pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS generation_name VARCHAR(100) NOT NULL DEFAULT '' AFTER generation_id");
$pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_cc SMALLINT UNSIGNED NULL AFTER generation_name");

// Istilah pasar yang umum dipakai bengkel. INSERT IGNORE menjaga edit user.
$avanzaModel = $pdo->query("SELECT m.id FROM vehicle_models m JOIN vehicle_brands b ON b.id=m.brand_id WHERE b.name='Toyota' AND m.name='Avanza' LIMIT 1")->fetchColumn();
if ($avanzaModel) {
    $generationSeed = $pdo->prepare("INSERT IGNORE INTO vehicle_generations(id,model_id,name,aliases,year_from,year_to,sort_order) VALUES(?,?,?,?,?,?,?)");
    $engineSeed = $pdo->prepare("INSERT IGNORE INTO vehicle_generation_engines(generation_id,engine_cc) VALUES(?,?)");
    foreach ([
        ['VG-AVANZA-LAMA','Avanza Lama','lama,old,gen 1',2003,2011,[1300,1500]],
        ['VG-AVANZA-ALLNEW','All New Avanza','all new,gen 2',2011,2015,[1300,1500]],
        ['VG-AVANZA-GRAND','Grand New Avanza','grand,grand new',2015,2021,[1300,1500]],
        ['VG-AVANZA-FWD','All New Avanza FWD','fwd,gen 3,avanza baru',2021,null,[1300,1500]],
    ] as $index => [$generationId,$generationName,$aliases,$yearFrom,$yearTo,$engines]) {
        $generationSeed->execute([$generationId,$avanzaModel,$generationName,$aliases,$yearFrom,$yearTo,($index+1)*10]);
        foreach ($engines as $engineCc) $engineSeed->execute([$generationId,$engineCc]);
    }
}
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_catalog_settings (
    id TINYINT NOT NULL PRIMARY KEY,
    brand_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'manual',
    model_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'manual',
    color_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'usage',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("ALTER TABLE vehicle_catalog_settings MODIFY color_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'usage'");
$pdo->exec("INSERT IGNORE INTO vehicle_catalog_settings(id) VALUES(1)");
$pdo->exec("UPDATE vehicle_catalog_settings SET color_sort_mode='usage' WHERE id=1 AND color_sort_mode='manual'");
$pdo->exec("CREATE TABLE IF NOT EXISTS vehicle_catalog_audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(20) NOT NULL,
    entity_id VARCHAR(64) NULL,
    entity_name VARCHAR(100) NULL,
    action VARCHAR(30) NOT NULL,
    detail VARCHAR(500) NULL,
    user_id VARCHAR(64) NULL,
    user_name VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_vehicle_catalog_audit_created(created_at)
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

function requireVehicleCatalogEditor(PDO $pdo): array {
    $user = requireAuthenticatedUser($pdo);
    $roleStmt = $pdo->prepare("SELECT name FROM roles WHERE id = ?");
    $roleStmt->execute([$user['role_id'] ?? '']);
    $roleName = strtolower(trim((string)$roleStmt->fetchColumn()));
    if (!empty($user['is_owner'])
        || in_array($roleName, ['teknisi', 'technician'], true)
        || authenticatedUserHasPermission($pdo, $user, 'vehicle:create')
        || authenticatedUserHasPermission($pdo, $user, 'vehicle:edit')) return $user;
    respondError('Anda tidak memiliki hak mengubah master kendaraan', 403);
}

function requireVehicleCatalogDeactivator(PDO $pdo, array $user): void {
    if (!empty($user['is_owner'])) return;
    $stmt = $pdo->prepare("SELECT name FROM roles WHERE id = ?");
    $stmt->execute([$user['role_id'] ?? '']);
    if (strtolower((string)$stmt->fetchColumn()) !== 'administrator') respondError('Hanya Owner atau Administrator yang dapat menonaktifkan master kendaraan', 403);
}

function logVehicleCatalogChange(PDO $pdo, array $user, string $entity, ?string $entityId, ?string $entityName, string $action, ?string $detail = null): void {
    $stmt = $pdo->prepare("INSERT INTO vehicle_catalog_audit_logs(entity,entity_id,entity_name,action,detail,user_id,user_name) VALUES(?,?,?,?,?,?,?)");
    $stmt->execute([$entity,$entityId,$entityName,$action,$detail,$user['id'] ?? null,$user['name'] ?? $user['username'] ?? 'System']);
}

switch ($method) {
    case 'GET':
        $catalogViewer = requireAuthenticatedUser($pdo);
        $brands = $pdo->query("SELECT id,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_brands ORDER BY sort_order,name")->fetchAll();
        $models = $pdo->query("SELECT id,brand_id AS brandId,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_models ORDER BY sort_order,name")->fetchAll();
        $colors = $pdo->query("SELECT id,name,is_active AS isActive,sort_order AS sortOrder FROM vehicle_colors ORDER BY sort_order,name")->fetchAll();
        $generations = $pdo->query("SELECT id,model_id AS modelId,name,aliases,year_from AS yearFrom,year_to AS yearTo,is_active AS isActive,sort_order AS sortOrder FROM vehicle_generations ORDER BY sort_order,name")->fetchAll();
        $engineRows = $pdo->query("SELECT generation_id AS generationId,engine_cc AS engineCc FROM vehicle_generation_engines ORDER BY engine_cc")->fetchAll();
        $enginesByGeneration = [];
        foreach ($engineRows as $engineRow) $enginesByGeneration[$engineRow['generationId']][] = (int)$engineRow['engineCc'];
        foreach ($generations as &$generation) { $generation['isActive']=(bool)$generation['isActive']; $generation['yearFrom']=$generation['yearFrom'] ? (int)$generation['yearFrom'] : null; $generation['yearTo']=$generation['yearTo'] ? (int)$generation['yearTo'] : null; $generation['engineCcs']=$enginesByGeneration[$generation['id']] ?? []; }
        $vehicleRows = $pdo->query("SELECT brand_id,model_id,brand,model,color FROM vehicles")->fetchAll();
        $brandUsage = []; $modelUsage = []; $colorUsage = [];
        foreach ($vehicleRows as $vehicleRow) {
            $brandKey = (string)($vehicleRow['brand_id'] ?: 'name:' . strtolower(trim((string)$vehicleRow['brand'])));
            $modelKey = (string)($vehicleRow['model_id'] ?: 'name:' . strtolower(trim((string)$vehicleRow['brand'])) . '|' . strtolower(trim((string)$vehicleRow['model'])));
            $brandUsage[$brandKey] = ($brandUsage[$brandKey] ?? 0) + 1;
            $modelUsage[$modelKey] = ($modelUsage[$modelKey] ?? 0) + 1;
            $colorKey = strtolower(trim((string)($vehicleRow['color'] ?? '')));
            if ($colorKey !== '') $colorUsage[$colorKey] = ($colorUsage[$colorKey] ?? 0) + 1;
        }
        foreach ($brands as &$brand) {
            $brand['isActive'] = (bool)$brand['isActive'];
            $brand['usageCount'] = (int)($brandUsage[$brand['id']] ?? $brandUsage['name:' . strtolower(trim((string)$brand['name']))] ?? 0);
            $brand['models'] = array_values(array_filter($models, fn($model) => $model['brandId'] === $brand['id']));
            foreach ($brand['models'] as &$model) {
                $model['isActive'] = (bool)$model['isActive'];
                $model['usageCount'] = (int)($modelUsage[$model['id']] ?? $modelUsage['name:' . strtolower(trim((string)$brand['name'])) . '|' . strtolower(trim((string)$model['name']))] ?? 0);
                $model['generations'] = array_values(array_filter($generations, fn($generation) => $generation['modelId'] === $model['id']));
            }
        }
        foreach ($colors as &$color) { $color['isActive'] = (bool)$color['isActive']; $color['usageCount'] = (int)($colorUsage[strtolower(trim((string)$color['name']))] ?? 0); }
        unset($brand,$model,$color);
        $sortSettings = $pdo->query("SELECT brand_sort_mode AS brandSortMode,model_sort_mode AS modelSortMode,color_sort_mode AS colorSortMode FROM vehicle_catalog_settings WHERE id=1")->fetch();
        if (($sortSettings['brandSortMode'] ?? 'manual') === 'usage') {
            usort($brands, fn($left,$right) => ($right['usageCount'] <=> $left['usageCount']) ?: strcasecmp((string)$left['name'], (string)$right['name']));
        }
        if (($sortSettings['modelSortMode'] ?? 'manual') === 'usage') {
            foreach ($brands as &$brand) usort($brand['models'], fn($left,$right) => ($right['usageCount'] <=> $left['usageCount']) ?: strcasecmp((string)$left['name'], (string)$right['name']));
        }
        if (($sortSettings['colorSortMode'] ?? 'usage') === 'usage') {
            usort($colors, fn($left,$right) => ($right['usageCount'] <=> $left['usageCount']) ?: strcasecmp((string)$left['name'], (string)$right['name']));
        }
        $auditLogs = $pdo->query("SELECT id,entity,entity_id AS entityId,entity_name AS entityName,action,detail,user_id AS userId,user_name AS userName,created_at AS createdAt FROM vehicle_catalog_audit_logs ORDER BY id DESC LIMIT 100")->fetchAll();
        respondSuccess(['brands'=>$brands, 'colors'=>$colors, 'sortModes'=>$sortSettings ?: ['brandSortMode'=>'manual','modelSortMode'=>'manual','colorSortMode'=>'manual'], 'auditLogs'=>$auditLogs]);
        break;

    case 'POST':
        $catalogUser = requireVehicleCatalogEditor($pdo);
        $d = getInput(); $entity = $d['entity'] ?? ''; $name = trim((string)($d['name'] ?? ''));
        if ($name === '') respondError('Nama wajib diisi', 422);
        try {
            $newId = generateId();
            if ($entity === 'brand') $pdo->prepare("INSERT INTO vehicle_brands(id,name,is_active,sort_order) SELECT ?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_brands")->execute([$newId,$name]);
            elseif ($entity === 'model') $pdo->prepare("INSERT INTO vehicle_models(id,brand_id,name,is_active,sort_order) SELECT ?,?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_models WHERE brand_id=?")->execute([$newId,$d['brandId'] ?? '',$name,$d['brandId'] ?? '']);
            elseif ($entity === 'generation') {
                $modelId=(string)($d['modelId']??'');
                $yearFrom = !empty($d['yearFrom']) ? (int)$d['yearFrom'] : null;
                $yearTo = !empty($d['yearTo']) ? (int)$d['yearTo'] : null;
                if ($modelId === '') respondError('Model kendaraan wajib dipilih', 422);
                if ($yearFrom && ($yearFrom < 1900 || $yearFrom > (int)date('Y') + 2)) respondError('Tahun awal tidak valid', 422);
                if ($yearTo && ($yearTo < 1900 || $yearTo > (int)date('Y') + 2)) respondError('Tahun akhir tidak valid', 422);
                if ($yearFrom && $yearTo && $yearTo < $yearFrom) respondError('Tahun akhir tidak boleh lebih kecil dari tahun awal', 422);
                $pdo->prepare("INSERT INTO vehicle_generations(id,model_id,name,aliases,year_from,year_to,is_active,sort_order) SELECT ?,?,?,?,?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_generations WHERE model_id=?")
                    ->execute([$newId,$modelId,$name,trim((string)($d['aliases']??'')),$yearFrom,$yearTo,$modelId]);
                $engineInsert=$pdo->prepare("INSERT IGNORE INTO vehicle_generation_engines(generation_id,engine_cc) VALUES(?,?)");
                foreach (($d['engineCcs']??[]) as $engineCc) if ((int)$engineCc>=600 && (int)$engineCc<=10000) $engineInsert->execute([$newId,(int)$engineCc]);
            }
            elseif ($entity === 'color') $pdo->prepare("INSERT INTO vehicle_colors(id,name,is_active,sort_order) SELECT ?,?,1,COALESCE(MAX(sort_order),0)+10 FROM vehicle_colors")->execute([$newId,$name]);
            else respondError('Jenis master tidak valid', 422);
            logVehicleCatalogChange($pdo,$catalogUser,$entity,$newId,$name,'create',$entity === 'model' ? 'Ditambahkan ke merek ' . ($d['brandId'] ?? '-') : null);
        } catch (PDOException $e) { respondError('Nama sudah digunakan atau data induk tidak valid', 409); }
        respondSuccess(null, 'Master kendaraan ditambahkan');
        break;

    case 'PUT':
        $catalogUser = requireVehicleCatalogEditor($pdo);
        if (!$id) respondError('ID required');
        $d = getInput(); $entity = $d['entity'] ?? '';
        if (($d['action'] ?? '') === 'merge') {
            requireVehicleCatalogDeactivator($pdo, $catalogUser);
            $targetId = trim((string)($d['targetId'] ?? ''));
            if ($targetId === '' || $targetId === $id) respondError('Target penggabungan tidak valid', 422);
            $table = $entity === 'brand' ? 'vehicle_brands' : ($entity === 'model' ? 'vehicle_models' : ($entity === 'color' ? 'vehicle_colors' : ''));
            if ($table === '') respondError('Jenis master tidak valid', 422);
            $fields = $entity === 'model' ? 'id,name,brand_id,is_active' : 'id,name,is_active';
            $lookup = $pdo->prepare("SELECT {$fields} FROM {$table} WHERE id IN (?,?) FOR UPDATE");
            $pdo->beginTransaction();
            try {
                $lookup->execute([$id,$targetId]);
                $found = [];
                foreach ($lookup->fetchAll() as $row) $found[$row['id']] = $row;
                $source = $found[$id] ?? null; $target = $found[$targetId] ?? null;
                if (!$source || !$target) throw new InvalidArgumentException('Data sumber atau target tidak ditemukan.');
                if (!(bool)$target['is_active']) throw new InvalidArgumentException('Target penggabungan harus aktif.');
                if ($entity === 'brand') {
                    $sourceModelsStmt = $pdo->prepare("SELECT id,name FROM vehicle_models WHERE brand_id=? FOR UPDATE");
                    $sourceModelsStmt->execute([$id]);
                    $targetModelStmt = $pdo->prepare("SELECT id,name FROM vehicle_models WHERE brand_id=? AND LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1");
                    foreach ($sourceModelsStmt->fetchAll() as $sourceModel) {
                        $targetModelStmt->execute([$targetId,$sourceModel['name']]);
                        $existingTargetModel = $targetModelStmt->fetch();
                        if ($existingTargetModel) {
                            $pdo->prepare("UPDATE vehicles SET brand_id=?,brand=?,model_id=?,model=? WHERE model_id=?")
                                ->execute([$targetId,$target['name'],$existingTargetModel['id'],$existingTargetModel['name'],$sourceModel['id']]);
                            $pdo->prepare("UPDATE vehicle_models SET is_active=0 WHERE id=?")->execute([$sourceModel['id']]);
                        } else {
                            $pdo->prepare("UPDATE vehicle_models SET brand_id=? WHERE id=?")->execute([$targetId,$sourceModel['id']]);
                            $pdo->prepare("UPDATE vehicles SET brand_id=?,brand=? WHERE model_id=?")
                                ->execute([$targetId,$target['name'],$sourceModel['id']]);
                        }
                    }
                    $pdo->prepare("UPDATE vehicles SET brand_id=?,brand=? WHERE brand_id=? OR LOWER(TRIM(brand))=LOWER(TRIM(?))")
                        ->execute([$targetId,$target['name'],$id,$source['name']]);
                } elseif ($entity === 'model') {
                    if ((string)$source['brand_id'] !== (string)$target['brand_id']) throw new InvalidArgumentException('Tipe hanya dapat digabungkan dalam merek yang sama.');
                    $brandNameStmt = $pdo->prepare("SELECT name FROM vehicle_brands WHERE id=?");
                    $brandNameStmt->execute([$target['brand_id']]); $brandName = (string)$brandNameStmt->fetchColumn();
                    $pdo->prepare("UPDATE vehicles SET brand_id=?,brand=?,model_id=?,model=? WHERE model_id=? OR (LOWER(TRIM(brand))=LOWER(TRIM(?)) AND LOWER(TRIM(model))=LOWER(TRIM(?)))")
                        ->execute([$target['brand_id'],$brandName,$targetId,$target['name'],$id,$brandName,$source['name']]);
                } else {
                    $pdo->prepare("UPDATE vehicles SET color=? WHERE LOWER(TRIM(color))=LOWER(TRIM(?))")->execute([$target['name'],$source['name']]);
                }
                $pdo->prepare("UPDATE {$table} SET is_active=0 WHERE id=?")->execute([$id]);
                logVehicleCatalogChange($pdo,$catalogUser,$entity,$id,$source['name'],'merge','Digabungkan ke ' . $target['name'] . ' (' . $targetId . ')');
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                respondError($e->getMessage() ?: 'Gagal menggabungkan master kendaraan', $e instanceof InvalidArgumentException ? 422 : 500);
            }
            respondSuccess(null, 'Master kendaraan berhasil digabungkan');
        }
        if (($d['action'] ?? '') === 'reorder') {
            $table = $entity === 'brand' ? 'vehicle_brands' : ($entity === 'model' ? 'vehicle_models' : ($entity === 'color' ? 'vehicle_colors' : ''));
            $orderedIds = is_array($d['orderedIds'] ?? null) ? $d['orderedIds'] : [];
            if ($table === '' || !$orderedIds) respondError('Urutan master tidak valid', 422);
            $pdo->beginTransaction();
            try {
                $sort = $pdo->prepare("UPDATE {$table} SET sort_order=? WHERE id=?");
                foreach ($orderedIds as $index => $orderedId) $sort->execute([($index + 1) * 10, $orderedId]);
                $sortMode = ($d['sortMode'] ?? '') === 'usage' && in_array($entity,['brand','model','color'],true) ? 'usage' : 'manual';
                $settingColumn = $entity === 'brand' ? 'brand_sort_mode' : ($entity === 'model' ? 'model_sort_mode' : 'color_sort_mode');
                $pdo->prepare("UPDATE vehicle_catalog_settings SET {$settingColumn}=? WHERE id=1")->execute([$sortMode]);
                logVehicleCatalogChange($pdo,$catalogUser,$entity,null,null,'reorder',$sortMode === 'usage' ? 'Mode otomatis: paling dipakai' : 'Urutan manual diperbarui');
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                respondError('Gagal menyimpan urutan master', 500);
            }
            respondSuccess(null, 'Urutan master kendaraan disimpan');
        }
        if ($entity === 'generation') {
            $name = trim((string)($d['name'] ?? ''));
            $modelId = trim((string)($d['modelId'] ?? ''));
            $aliases = trim((string)($d['aliases'] ?? ''));
            $yearFrom = !empty($d['yearFrom']) ? (int)$d['yearFrom'] : null;
            $yearTo = !empty($d['yearTo']) ? (int)$d['yearTo'] : null;
            $active = !empty($d['isActive']) ? 1 : 0;
            if ($name === '' || $modelId === '') respondError('Model dan nama generasi wajib diisi', 422);
            if ($yearFrom && ($yearFrom < 1900 || $yearFrom > (int)date('Y') + 2)) respondError('Tahun awal tidak valid', 422);
            if ($yearTo && ($yearTo < 1900 || $yearTo > (int)date('Y') + 2)) respondError('Tahun akhir tidak valid', 422);
            if ($yearFrom && $yearTo && $yearTo < $yearFrom) respondError('Tahun akhir tidak boleh lebih kecil dari tahun awal', 422);
            $oldStmt = $pdo->prepare("SELECT name,is_active FROM vehicle_generations WHERE id=?");
            $oldStmt->execute([$id]); $old = $oldStmt->fetch();
            if (!$old) respondError('Generasi kendaraan tidak ditemukan', 404);
            if ((int)$old['is_active'] !== $active) requireVehicleCatalogDeactivator($pdo, $catalogUser);
            $engineCcs = array_values(array_unique(array_filter(array_map('intval', is_array($d['engineCcs'] ?? null) ? $d['engineCcs'] : []), fn($cc) => $cc >= 600 && $cc <= 10000)));
            $pdo->beginTransaction();
            try {
                $pdo->prepare("UPDATE vehicle_generations SET model_id=?,name=?,aliases=?,year_from=?,year_to=?,is_active=? WHERE id=?")
                    ->execute([$modelId,$name,$aliases,$yearFrom,$yearTo,$active,$id]);
                $pdo->prepare("DELETE FROM vehicle_generation_engines WHERE generation_id=?")->execute([$id]);
                $engineInsert = $pdo->prepare("INSERT INTO vehicle_generation_engines(generation_id,engine_cc) VALUES(?,?)");
                foreach ($engineCcs as $engineCc) $engineInsert->execute([$id,$engineCc]);
                $pdo->prepare("UPDATE vehicles SET generation_name=?,engine_cc=IF(engine_cc IN (" . ($engineCcs ? implode(',',array_fill(0,count($engineCcs),'?')) : 'NULL') . "),engine_cc,NULL) WHERE generation_id=?")
                    ->execute(array_merge([$name],$engineCcs,[$id]));
                $auditAction = (int)$old['is_active'] !== $active ? ($active ? 'activate' : 'deactivate') : 'update';
                logVehicleCatalogChange($pdo,$catalogUser,'generation',$id,$name,$auditAction,'Alias, rentang tahun, dan pilihan mesin diperbarui');
                $pdo->commit();
            } catch (PDOException $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                respondError('Nama generasi sudah digunakan pada model tersebut', 409);
            }
            respondSuccess(null, 'Generasi dan pilihan mesin diperbarui');
        }
        $name = trim((string)($d['name'] ?? '')); $active = !empty($d['isActive']) ? 1 : 0;
        if ($name === '') respondError('Nama wajib diisi', 422);
        $table = $entity === 'brand' ? 'vehicle_brands' : ($entity === 'model' ? 'vehicle_models' : ($entity === 'color' ? 'vehicle_colors' : ''));
        if ($table === '') respondError('Jenis master tidak valid', 422);
        try {
            $oldStmt = $pdo->prepare("SELECT name,is_active" . ($entity === 'model' ? ",brand_id" : "") . " FROM {$table} WHERE id=?");
            $oldStmt->execute([$id]);
            $old = $oldStmt->fetch();
            if (!$old) respondError('Master kendaraan tidak ditemukan', 404);
            if ((int)$old['is_active'] !== $active) requireVehicleCatalogDeactivator($pdo, $catalogUser);
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE {$table} SET name=?,is_active=? WHERE id=?")->execute([$name,$active,$id]);
            if ($entity === 'brand') {
                $pdo->prepare("UPDATE vehicles SET brand=?,brand_id=? WHERE brand_id=? OR LOWER(TRIM(brand))=LOWER(TRIM(?))")
                    ->execute([$name,$id,$id,$old['name']]);
            } elseif ($entity === 'model') {
                $pdo->prepare("UPDATE vehicles SET model=?,model_id=? WHERE (model_id=? OR LOWER(TRIM(model))=LOWER(TRIM(?))) AND (brand_id=? OR LOWER(TRIM(brand))=(SELECT LOWER(TRIM(name)) FROM vehicle_brands WHERE id=?))")
                    ->execute([$name,$id,$id,$old['name'],$old['brand_id'],$old['brand_id']]);
            }
            $auditAction = (int)$old['is_active'] !== $active ? ($active ? 'activate' : 'deactivate') : 'rename';
            $auditDetail = $auditAction === 'rename' ? 'Nama lama: ' . $old['name'] : null;
            logVehicleCatalogChange($pdo,$catalogUser,$entity,$id,$name,$auditAction,$auditDetail);
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
