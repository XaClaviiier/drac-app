<?php
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS vehicle_brand_id VARCHAR(64) NULL AFTER brand");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS vehicle_brand_name VARCHAR(100) NULL AFTER vehicle_brand_id");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS item_brand_id VARCHAR(64) NULL AFTER brand");
$pdo->exec("CREATE TABLE IF NOT EXISTS item_vehicle_brands(item_id VARCHAR(64) NOT NULL,vehicle_brand_id VARCHAR(64) NOT NULL,sort_order INT NOT NULL DEFAULT 0,PRIMARY KEY(item_id,vehicle_brand_id),INDEX idx_ivb_brand(vehicle_brand_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS item_vehicle_compatibilities(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,item_id VARCHAR(64) NOT NULL,brand_id VARCHAR(64) NOT NULL,model_id VARCHAR(64) NULL,generation_id VARCHAR(64) NULL,engine_cc SMALLINT UNSIGNED NULL,sort_order INT NOT NULL DEFAULT 0,INDEX idx_ivc_item(item_id),INDEX idx_ivc_vehicle(brand_id,model_id,generation_id,engine_cc)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("ALTER TABLE item_vehicle_compatibilities ADD COLUMN IF NOT EXISTS engine_type VARCHAR(20) NULL AFTER engine_cc");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'Verified' AFTER is_active");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) NULL AFTER verification_status");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS verified_by VARCHAR(64) NULL AFTER created_by");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS merged_into_item_id VARCHAR(64) NULL AFTER verified_by");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(20) NULL AFTER branch_id");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS received_by_id VARCHAR(64) NULL AFTER received_by");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(40) NOT NULL DEFAULT 'Diantar Supplier' AFTER do_number");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS delivery_other VARCHAR(100) NULL AFTER delivery_method");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS shipping_notes VARCHAR(500) NULL AFTER delivery_other");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'Supplier' AFTER shipping_notes");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS source_warehouse_id VARCHAR(20) NULL AFTER source_type");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS source_branch_id VARCHAR(20) NULL AFTER source_warehouse_id");
$pdo->exec("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS transfer_number VARCHAR(40) NULL AFTER source_branch_id");
// ==========================================================
// ALL DATA - Load semua data sekaligus untuk aplikasi
// GET /api/all-data
// ==========================================================
if ($method !== 'GET') respondError('Method not allowed', 405);

try {
    $actor = $requestUser ?? requireAuthenticatedUser($pdo);
    $allowedBranchIds = getAccessibleBranchIds($pdo, $actor);
    $allowedBranchMap = array_fill_keys($allowedBranchIds, true);
    $canViewUsers = authenticatedUserHasPermission($pdo, $actor, 'user:view');
    $canViewRoles = authenticatedUserHasPermission($pdo, $actor, 'role:view');
    $canUseAi = authenticatedUserHasPermission($pdo, $actor, 'ai:view');
    $canUseCustomers = $canUseAi || authenticatedUserHasPermission($pdo, $actor, 'customer:view') || authenticatedUserHasPermission($pdo, $actor, 'wo:create');
    $canUseVehicles = $canUseAi || authenticatedUserHasPermission($pdo, $actor, 'vehicle:view') || authenticatedUserHasPermission($pdo, $actor, 'wo:create');
    $canUseItems = $canUseAi || authenticatedUserHasPermission($pdo, $actor, 'item:view') || authenticatedUserHasPermission($pdo, $actor, 'wo:create') || authenticatedUserHasPermission($pdo, $actor, 'invoice:create');
    $canUseWorkOrders = authenticatedUserHasPermission($pdo, $actor, 'wo:view');
    $canUseInvoices = authenticatedUserHasPermission($pdo, $actor, 'invoice:view') || authenticatedUserHasPermission($pdo, $actor, 'payment:view');
    $canUseReceipts = authenticatedUserHasPermission($pdo, $actor, 'receipt:view');
    $canUsePurchases = authenticatedUserHasPermission($pdo, $actor, 'purchase:view');
    $supplierRoleStmt = $pdo->prepare('SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1');
    $supplierRoleStmt->execute([(string)($actor['role_id'] ?? '')]);
    $supplierRole = $supplierRoleStmt->fetch() ?: [];
    $canSeeSuppliers = !empty($actor['is_owner'])
        || strtoupper(trim((string)($supplierRole['code'] ?? ''))) === 'ADM'
        || strtolower(trim((string)($supplierRole['name'] ?? ''))) === 'administrator';
    $data = [];
    // Selalu kirim akses efektif user aktif. Frontend memakai nilai ini untuk
    // menyegarkan sesi lama ketika role atau hak cabang diubah oleh owner.
    $data['currentAccess'] = [
        'permissions' => getUserPermissions($pdo, $actor),
        'branchId' => (string)($actor['branch_id'] ?? ''),
        'branchIds' => $allowedBranchIds,
    ];

    // Migrasi ringan agar field master barang baru langsung tersedia setelah deploy.
    $pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS receipt_description VARCHAR(255) NULL AFTER description");
    $pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100) NULL AFTER receipt_description");
    try { $pdo->exec("ALTER TABLE items ADD UNIQUE INDEX IF NOT EXISTS uq_items_barcode (barcode)"); } catch (Throwable $e) {}
    $pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand_id VARCHAR(64) NULL AFTER model");
    $pdo->exec("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_id VARCHAR(64) NULL AFTER brand_id");
    if ($pdo->query("SHOW TABLES LIKE 'vehicle_brands'")->fetch() && $pdo->query("SHOW TABLES LIKE 'vehicle_models'")->fetch()) {
        $pdo->exec("UPDATE vehicles v JOIN vehicle_brands b ON LOWER(TRIM(b.name))=LOWER(TRIM(v.brand)) JOIN vehicle_models m ON m.brand_id=b.id AND LOWER(TRIM(m.name))=LOWER(TRIM(v.model)) SET v.brand_id=b.id,v.model_id=m.id,v.brand=b.name,v.model=m.name WHERE v.brand_id IS NULL OR v.model_id IS NULL OR v.brand<>b.name OR v.model<>m.name");
    }
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS backdate_reason VARCHAR(255) NULL AFTER date");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS transaction_time TIME NOT NULL DEFAULT '00:00:00' AFTER date");
    $pdo->exec("UPDATE work_orders SET transaction_time=TIME(created_at) WHERE transaction_time='00:00:00' AND created_at IS NOT NULL");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_at DATETIME NULL AFTER approved_at");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_until DATETIME NULL AFTER pending_at");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_reason VARCHAR(255) NULL AFTER pending_until");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS diagnosis_temperature DECIMAL(6,2) NULL AFTER findings");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS diagnosis_lp DECIMAL(8,2) NULL AFTER diagnosis_temperature");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS diagnosis_hp DECIMAL(8,2) NULL AFTER diagnosis_lp");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS final_temperature DECIMAL(6,2) NULL AFTER diagnosis_hp");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS final_lp DECIMAL(8,2) NULL AFTER final_temperature");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS final_hp DECIMAL(8,2) NULL AFTER final_lp");
    $pdo->exec("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS approved_services_json LONGTEXT NULL AFTER approved_at");

    // Bersihkan nama pelanggan yang pernah ikut menyimpan kata perintah AI.
    // customer_ref_id dipakai agar seluruh salinan nama pada kendaraan dan
    // transaksi lama tetap konsisten tanpa mengubah relasi atau nomor dokumen.
    $badCustomerRows = $pdo->query("SELECT id,name FROM customers WHERE UPPER(name) REGEXP '^(REG|WO)[[:space:],;:-]'")->fetchAll();
    $updateCustomerName = $pdo->prepare("UPDATE customers SET name=? WHERE id=?");
    $updateVehicleCustomerName = $pdo->prepare("UPDATE vehicles SET customer_name=? WHERE customer_id=?");
    $updateWorkOrderCustomerName = $pdo->prepare("UPDATE work_orders SET customer_name=? WHERE customer_ref_id=?");
    $updateInvoiceCustomerName = $pdo->prepare("UPDATE sales_invoices SET customer_name=? WHERE customer_ref_id=?");
    foreach ($badCustomerRows as $badCustomerRow) {
        $cleanName = preg_replace('/^(?:(?:reg)(?:\s+wo)?|wo)\b\s*[,;:\-]?\s*/iu', '', trim((string)$badCustomerRow['name']));
        $cleanName = trim((string)$cleanName, " \t\n\r\0\x0B,;:-");
        $cleanName = function_exists('mb_strtoupper') ? mb_strtoupper($cleanName, 'UTF-8') : strtoupper($cleanName);
        if ($cleanName === '') continue;
        $updateCustomerName->execute([$cleanName, $badCustomerRow['id']]);
        $updateVehicleCustomerName->execute([$cleanName, $badCustomerRow['id']]);
        $updateWorkOrderCustomerName->execute([$cleanName, $badCustomerRow['id']]);
        $updateInvoiceCustomerName->execute([$cleanName, $badCustomerRow['id']]);
    }
    $statusColumn = $pdo->query("SHOW COLUMNS FROM work_orders LIKE 'status'")->fetch();
    if ($statusColumn && (
        stripos((string)$statusColumn['Type'], "'Register'") === false
        || stripos((string)$statusColumn['Type'], "'Proses'") === false
        || stripos((string)$statusColumn['Type'], "'Selesai'") === false
        || stripos((string)$statusColumn['Type'], "'Closed'") === false
        || stripos((string)$statusColumn['Type'], "'Pengecekan'") !== false
        || stripos((string)$statusColumn['Type'], "'Pending'") !== false
        || stripos((string)$statusColumn['Type'], "'Invoiced'") !== false
        || stripos((string)$statusColumn['Type'], "'Dibayar'") !== false
        || stripos((string)$statusColumn['Type'], "'Batal'") !== false
    )) {
        // Konversi permanen data lama ke tiga status operasional. Hubungan
        // faktur/pembayaran tetap dibaca dari invoice_id dan sales_invoices.
        $pdo->exec("ALTER TABLE work_orders MODIFY COLUMN status ENUM('Register','Pengecekan','Pending','Proses','Selesai','Dibayar','Invoiced','Batal','Closed') DEFAULT 'Register'");
        $pdo->exec("UPDATE work_orders SET status='Register' WHERE status IN ('Pengecekan','Pending')");
        $pdo->exec("UPDATE work_orders SET status='Selesai' WHERE status IN ('Dibayar','Invoiced')");
        $pdo->exec("UPDATE work_orders SET status='Closed' WHERE status='Batal'");
        $pdo->exec("ALTER TABLE work_orders MODIFY COLUMN status ENUM('Register','Proses','Selesai','Closed') DEFAULT 'Register'");
    }
    // Koreksi data tidak valid dari alur lama: WO tanpa layanan dan tanpa nilai
    // belum boleh berstatus Diagnosa/Dikerjakan/Selesai. Saat ini kondisi ini
    // hanya mengenai data yang belum difakturkan.
    $invalidRows = $pdo->query("SELECT w.id,w.status,w.status_log FROM work_orders w WHERE w.invoice_id IS NULL AND w.total<=0 AND w.status IN ('Proses','Selesai')")->fetchAll();
    $repairInvalid = $pdo->prepare("UPDATE work_orders SET status='Register',approved_at=NULL,approved_services_json=NULL,estimate_total=0,status_log=? WHERE id=?");
    foreach ($invalidRows as $invalidRow) {
        $statusLog = json_decode((string)($invalidRow['status_log'] ?? '[]'), true);
        if (!is_array($statusLog)) $statusLog = [];
        $statusLog[] = [
            'from' => (string)$invalidRow['status'], 'to' => 'Register', 'at' => date('c'),
            'byUserId' => 'system', 'byUserName' => 'System',
            'reason' => 'Koreksi otomatis: WO belum memiliki layanan dengan estimasi bernilai positif.',
        ];
        $repairInvalid->execute([json_encode($statusLog), $invalidRow['id']]);
    }
    $pdo->exec("ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS payment_date DATE NULL AFTER payment");
    $pdo->exec("ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS backdate_reason VARCHAR(255) NULL AFTER payment_date");

    // Branches
    $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
    foreach ($rows as &$r) { $r['isActive'] = (bool)$r['is_active']; $r['reviewUrl'] = $r['review_url'] ?? ''; }
    $data['branches'] = array_values(array_filter($rows, fn($row) => isset($allowedBranchMap[(string)$row['id']])));

    // Roles
    $rows = $pdo->query("SELECT * FROM roles ORDER BY code")->fetchAll();
    foreach ($rows as &$r) {
        $r['isActive'] = (bool)$r['is_active'];
        $r['permissions'] = $r['permissions'] ? json_decode($r['permissions']) : [];
    }
    $data['roles'] = $canViewRoles
        ? $rows
        : array_values(array_filter($rows, fn($row) => (string)$row['id'] === (string)($actor['role_id'] ?? '')));

    // Users (tanpa password)
    $rows = $pdo->query("SELECT u.*, r.name as role_name, b.name as branch_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id")->fetchAll();
    foreach ($rows as &$r) {
        unset($r['password']);
        $r['roleName'] = $r['role_name']; $r['roleId'] = $r['role_id'];
        $r['branchName'] = $r['branch_name']; $r['branchId'] = $r['branch_id'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['isOwner'] = (bool)($r['is_owner'] ?? false);
        $r['isProtected'] = (bool)($r['is_protected'] ?? false);
        $r['branchIds'] = getUserBranchIds($pdo, $r['id']);
        $r['lastLogin'] = $r['last_login']; $r['createdAt'] = $r['created_at'];
    }
    if ($canViewUsers) {
        $data['users'] = $rows;
    } elseif ($canUseWorkOrders) {
        // Untuk penugasan teknisi cukup kirim identitas operasional, bukan data akun.
        $data['users'] = array_map(function($row) {
            return [
                'id' => $row['id'], 'name' => $row['name'], 'username' => '', 'email' => '',
                'roleId' => $row['roleId'], 'roleName' => $row['roleName'],
                'branchId' => $row['branchId'], 'branchName' => $row['branchName'],
                'branchIds' => $row['branchIds'], 'isActive' => $row['isActive'],
                'isOwner' => false, 'isProtected' => false, 'createdAt' => '',
            ];
        }, array_values(array_filter($rows, fn($row) => !empty($row['isActive']) && count(array_intersect($row['branchIds'], $allowedBranchIds)) > 0)));
    } else {
        $data['users'] = array_values(array_filter($rows, fn($row) => (string)$row['id'] === (string)$actor['id']));
    }

    // Customers
    $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
    foreach ($rows as &$r) {
        $r['customerCode']      = $r['customer_code'];
        $r['companyName']       = $r['company_name'] ?? '';
        $r['accountType']       = $r['account_type'] ?? 'Pribadi';
        $r['primaryContactId']  = $r['primary_contact_id'] ?? null;
        $r['billingContactId']  = $r['billing_contact_id'] ?? null;
        $r['branchId']          = $r['branch_id'];
        $r['firstSeenBranchId'] = $r['first_seen_branch_id'] ?? $r['branch_id'];
        $r['createdAt']         = $r['created_at'];
    }
    $data['customers'] = $canUseCustomers ? $rows : [];

    // Orang yang terkait dengan akun pelanggan beserta peran dan kendaraan.
    $people = $pdo->query("SELECT * FROM customer_people ORDER BY name")->fetchAll();
    $peopleRoles = $pdo->query("SELECT person_id,role_code FROM customer_person_roles ORDER BY role_code")->fetchAll();
    $peopleVehicles = $pdo->query("SELECT person_id,vehicle_id,assignment_role,is_primary FROM vehicle_people ORDER BY vehicle_id,assignment_role")->fetchAll();
    $rolesByPerson=[];$vehiclesByPerson=[];
    foreach($peopleRoles as $roleRow)$rolesByPerson[$roleRow['person_id']][]=$roleRow['role_code'];
    foreach($peopleVehicles as $vehicleRow)$vehiclesByPerson[$vehicleRow['person_id']][]=['vehicleId'=>$vehicleRow['vehicle_id'],'role'=>$vehicleRow['assignment_role'],'isPrimary'=>(bool)$vehicleRow['is_primary']];
    $customerLinks=[];foreach($rows as $customerRow)$customerLinks[$customerRow['id']]=['primary'=>$customerRow['primary_contact_id']??null,'billing'=>$customerRow['billing_contact_id']??null];
    foreach($people as &$person){$person['customerId']=$person['customer_id'];$person['relationshipLabel']=$person['relationship_label'];$person['isActive']=(bool)$person['is_active'];$person['roles']=$rolesByPerson[$person['id']]??[];$person['vehicleAssignments']=$vehiclesByPerson[$person['id']]??[];$person['isPrimaryPic']=($customerLinks[$person['customer_id']]['primary']??null)===$person['id'];$person['isBillingContact']=($customerLinks[$person['customer_id']]['billing']??null)===$person['id'];}
    $data['customerPeople']=$canUseCustomers?$people:[];

    // Vehicles
    $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
    foreach ($rows as &$r) {
        $r['plateNumber']       = $r['plate_number'];
        $r['brandId']           = $r['brand_id'] ?? null;
        $r['modelId']           = $r['model_id'] ?? null;
        $r['generationId']      = $r['generation_id'] ?? null;
        $r['generationName']    = $r['generation_name'] ?? '';
        $r['engineCc']          = isset($r['engine_cc']) ? (int)$r['engine_cc'] : null;
        $r['customerRefId']     = $r['customer_id'];
        $r['customerId']        = $r['customer_code'] ?: $r['customer_id'];
        $r['customerName']      = $r['customer_name'];
        $r['registrationDate']  = $r['registration_date'];
        $r['createdAt']         = $r['created_at'] ?? null;
        $r['updatedAt']         = $r['updated_at'] ?? null;
        $r['branchId']          = $r['branch_id'];
        $r['firstSeenBranchId'] = $r['first_seen_branch_id'] ?? $r['branch_id'];
    }
    $data['vehicles'] = $canUseVehicles ? $rows : [];

    // Suppliers
    $rows = $pdo->query("SELECT * FROM suppliers ORDER BY code")->fetchAll();
    foreach ($rows as &$r) {
        $r['contactPerson'] = $r['contact_person'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['createdAt'] = $r['created_at'];
    }
    $data['suppliers'] = $canSeeSuppliers ? $rows : [];

    // Item Categories
    $rows = $pdo->query("SELECT * FROM item_categories ORDER BY code")->fetchAll();
    foreach ($rows as &$r) $r['isActive'] = (bool)$r['is_active'];
    $data['itemCategories'] = $canUseItems ? $rows : [];

    // Items (with group members)
    $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
    $stockRows = $pdo->query("
        SELECT w.branch_id, ws.item_id, SUM(ws.quantity) stock,
               SUM(ws.quantity-ws.reserved_quantity) sellable_stock
        FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id
        WHERE w.is_active=1 GROUP BY w.branch_id,ws.item_id
    ")->fetchAll();
    $stocksByItem = [];
    foreach ($stockRows as $stockRow) {
        $stocksByItem[$stockRow['item_id']][$stockRow['branch_id']] = [
            'stock' => (int)$stockRow['stock'],
            'sellableStock' => (int)$stockRow['sellable_stock'],
        ];
    }
    $groupMembersAll = $pdo->query("SELECT * FROM item_group_members")->fetchAll();
    $vehicleBrandLinks=$pdo->query("SELECT ivb.item_id,ivb.vehicle_brand_id,b.name FROM item_vehicle_brands ivb JOIN vehicle_brands b ON b.id=ivb.vehicle_brand_id ORDER BY ivb.sort_order,b.name")->fetchAll();$vehicleBrandsByItem=[];foreach($vehicleBrandLinks as $link)$vehicleBrandsByItem[$link['item_id']][]=$link;
    $compatibilityLinks=$pdo->query("SELECT c.item_id,c.brand_id AS brandId,b.name AS brandName,c.model_id AS modelId,m.name AS modelName,c.generation_id AS generationId,g.name AS generationName,c.engine_cc AS engineCc,c.engine_type AS engineType FROM item_vehicle_compatibilities c JOIN vehicle_brands b ON b.id=c.brand_id LEFT JOIN vehicle_models m ON m.id=c.model_id LEFT JOIN vehicle_generations g ON g.id=c.generation_id ORDER BY c.item_id,c.sort_order,c.id")->fetchAll();$compatibilitiesByItem=[];foreach($compatibilityLinks as $compatibility){$compatibility['engineCc']=$compatibility['engineCc']!==null?(int)$compatibility['engineCc']:null;$compatibilitiesByItem[$compatibility['item_id']][]=$compatibility;}
    $membersByGroup = [];
    foreach ($groupMembersAll as $m) {
        $membersByGroup[$m['group_item_id']][] = [
            'itemId' => $m['member_item_id'],
            'itemCode' => $m['member_code'],
            'itemName' => $m['member_name'],
            'itemType' => $m['member_type'],
            'qty' => (int)$m['qty'],
            'unitPrice' => (float)$m['unit_price'],
        ];
    }
    foreach ($rows as &$r) {
        $r['categoryId'] = $r['category_id'];
        $r['categoryName'] = $r['category_name'];
        $r['sellableStock'] = (int)$r['sellable_stock'];
        $r['purchasePrice'] = (float)$r['purchase_price'];
        $r['sellingPrice'] = (float)$r['selling_price'];
        $r['isActive'] = (bool)$r['is_active'];
        $r['vehicleBrandId'] = $r['vehicle_brand_id'] ?? null;
        $r['vehicleBrandName'] = $r['vehicle_brand_name'] ?? '';
        $r['itemBrandId'] = $r['item_brand_id'] ?? null;
        $linkedBrands=$vehicleBrandsByItem[$r['id']]??[];if(!$linkedBrands&&!empty($r['vehicle_brand_id']))$linkedBrands=[['vehicle_brand_id'=>$r['vehicle_brand_id'],'name'=>$r['vehicle_brand_name']]];
        $r['vehicleBrandIds']=array_values(array_column($linkedBrands,'vehicle_brand_id'));
        $r['vehicleBrandNames']=array_values(array_column($linkedBrands,'name'));
        $r['vehicleCompatibilities']=$compatibilitiesByItem[$r['id']]??[];
        $r['verificationStatus'] = $r['verification_status'] ?? 'Verified';
        $r['createdBy'] = $r['created_by'] ?? null;
        $r['verifiedBy'] = $r['verified_by'] ?? null;
        $r['mergedIntoItemId'] = $r['merged_into_item_id'] ?? null;
        $r['isQuickService'] = (bool)$r['is_quick_service'];
        $r['receiptDescription'] = $r['receipt_description'] ?? '';
        $r['branchId'] = $r['branch_id'];
        $r['branchStocks'] = array_intersect_key($stocksByItem[$r['id']] ?? [], $allowedBranchMap);
        $r['stock'] = array_sum(array_column($r['branchStocks'], 'stock'));
        $r['sellableStock'] = array_sum(array_column($r['branchStocks'], 'sellableStock'));
        if ($r['type'] === 'Group') {
            $r['groupMembers'] = $membersByGroup[$r['id']] ?? [];
        }
    }
    $data['items'] = $canUseItems ? $rows : [];

    // Gudang, saldo stok per gudang, dan histori mutasi.
    $warehouses = $pdo->query("SELECT w.*,b.name branch_name FROM warehouses w LEFT JOIN branches b ON b.id=w.branch_id COLLATE utf8mb4_unicode_ci ORDER BY b.name,w.is_default DESC,w.name")->fetchAll();
    foreach($warehouses as &$w){$w['branchId']=$w['branch_id'];$w['branchName']=$w['branch_name'];$w['isDefault']=(bool)$w['is_default'];$w['isSellable']=(bool)$w['is_sellable'];$w['isSystem']=(bool)($w['is_system']??false);$w['isActive']=(bool)$w['is_active'];}
    $warehouses = array_values(array_filter($warehouses, fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])));
    $data['warehouses']=($canUseItems || $canUseReceipts || $canUsePurchases) ? $warehouses : [];
    $allowedWarehouseMap = array_fill_keys(array_map(fn($row) => (string)$row['id'], $warehouses), true);
    $warehouseStocks=$pdo->query("SELECT warehouse_id,item_id,quantity,reserved_quantity FROM warehouse_stocks")->fetchAll();
    foreach($warehouseStocks as &$s){$s['warehouseId']=$s['warehouse_id'];$s['itemId']=$s['item_id'];$s['quantity']=(int)$s['quantity'];$s['reservedQuantity']=(int)$s['reserved_quantity'];}
    $data['warehouseStocks']=$canUseItems ? array_values(array_filter($warehouseStocks, fn($row) => isset($allowedWarehouseMap[(string)$row['warehouse_id']]))) : [];
    $movements=$pdo->query("SELECT m.*,i.name item_name,sw.name source_name,dw.name destination_name FROM stock_movements m JOIN items i ON i.id=m.item_id COLLATE utf8mb4_unicode_ci LEFT JOIN warehouses sw ON sw.id=m.source_warehouse_id LEFT JOIN warehouses dw ON dw.id=m.destination_warehouse_id WHERE m.is_voided=0 ORDER BY COALESCE(m.occurred_at,m.created_at) DESC,m.movement_sequence DESC LIMIT 200")->fetchAll();
    foreach($movements as &$m){$m['itemId']=$m['item_id'];$m['itemName']=$m['item_name'];$m['sourceWarehouseId']=$m['source_warehouse_id'];$m['sourceName']=$m['source_name'];$m['destinationWarehouseId']=$m['destination_warehouse_id'];$m['destinationName']=$m['destination_name'];$m['movementType']=$m['movement_type'];$m['referenceType']=$m['reference_type']??null;$m['referenceId']=$m['reference_id']??null;$m['referenceNumber']=$m['reference_number']??null;$m['movementSequence']=(int)($m['movement_sequence']??0);$m['reversalOfId']=$m['reversal_of_id']??null;$m['correctionGroupId']=$m['correction_group_id']??null;$m['unitCost']=$m['unit_cost']!==null?(float)$m['unit_cost']:null;$m['quantity']=(int)$m['quantity'];$m['occurredAt']=$m['occurred_at']??$m['created_at'];$m['recordedAt']=$m['created_at'];$m['createdAt']=$m['occurred_at']??$m['created_at'];}
    $data['stockMovements']=$canUseItems ? array_values(array_filter($movements, function($row) use ($allowedWarehouseMap) {
        return (!empty($row['source_warehouse_id']) && isset($allowedWarehouseMap[(string)$row['source_warehouse_id']]))
            || (!empty($row['destination_warehouse_id']) && isset($allowedWarehouseMap[(string)$row['destination_warehouse_id']]));
    })) : [];

    // Work Orders
    $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll();
    $allServices = $pdo->query("SELECT * FROM work_order_services")->fetchAll();
    $servicesByWO = [];
    foreach ($allServices as $s) {
        $servicesByWO[$s['wo_id']][] = [
            'id' => (string)$s['id'],
            'itemId' => $s['item_id'],
            'code' => $s['code'],
            'name' => $s['name'],
            'description' => $s['description'],
            'price' => (float)$s['price'],
            'qty' => (int)$s['qty'],
        ];
    }
    foreach ($rows as &$r) {
        $r['woNumber'] = $r['wo_number'];
        $r['customerRefId'] = $r['customer_ref_id'];
        $r['customerId'] = $r['customer_id'];
        $r['customerName'] = $r['customer_name'];
        $r['vehicleRefId'] = $r['vehicle_ref_id'];
        $r['plateNumber'] = $r['plate_number'];
        $r['vehicleInfo'] = $r['vehicle_info'];
        $r['driverContactId'] = $r['driver_contact_id'] ?? null;
        $r['driverName'] = $r['driver_name'] ?? null;
        $r['driverPhone'] = $r['driver_phone'] ?? null;
        $r['approvalContactId'] = $r['approval_contact_id'] ?? null;
        $r['approvalContactName'] = $r['approval_contact_name'] ?? null;
        $r['approvalContactPhone'] = $r['approval_contact_phone'] ?? null;
        $r['billingContactId'] = $r['billing_contact_id'] ?? null;
        $r['billingContactName'] = $r['billing_contact_name'] ?? null;
        $r['billingContactPhone'] = $r['billing_contact_phone'] ?? null;
        $r['transactionTime'] = isset($r['transaction_time']) ? substr((string)$r['transaction_time'], 0, 5) : null;
        $r['branchId'] = $r['branch_id'];
        $r['createdBy'] = $r['created_by'] ?? null;
        $r['createdByName'] = $r['created_by_name'] ?? null;
        $r['technicianId'] = $r['technician_id'] ?? null;
        $r['technicianName'] = $r['technician_name'] ?? null;
        $r['backdateReason'] = $r['backdate_reason'] ?? null;
        $r['invoiceId'] = $r['invoice_id'];
        $r['invoiceNumber'] = $r['invoice_number'];
        $r['total'] = (float)$r['total'];
        $r['findings']                = $r['findings'] ?? null;
        $r['diagnosisTemperature']    = isset($r['diagnosis_temperature']) ? (float)$r['diagnosis_temperature'] : null;
        $r['diagnosisLp']             = isset($r['diagnosis_lp']) ? (float)$r['diagnosis_lp'] : null;
        $r['diagnosisHp']             = isset($r['diagnosis_hp']) ? (float)$r['diagnosis_hp'] : null;
        $r['finalTemperature']        = isset($r['final_temperature']) ? (float)$r['final_temperature'] : null;
        $r['finalLp']                 = isset($r['final_lp']) ? (float)$r['final_lp'] : null;
        $r['finalHp']                 = isset($r['final_hp']) ? (float)$r['final_hp'] : null;
        $r['estimateTotal']           = isset($r['estimate_total']) ? (float)$r['estimate_total'] : null;
        $r['approvedAt']              = $r['approved_at'] ?? null;
        $r['approvedServices']        = isset($r['approved_services_json']) && $r['approved_services_json'] ? json_decode($r['approved_services_json'], true) : [];
        $r['pendingAt']               = $r['pending_at'] ?? null;
        $r['pendingUntil']            = $r['pending_until'] ?? null;
        $r['pendingReason']           = $r['pending_reason'] ?? null;
        $r['cancelReason']            = $r['cancel_reason'] ?? null;
        $r['statusLog']               = isset($r['status_log']) && $r['status_log'] ? json_decode($r['status_log'], true) : [];
        $r['continuedFromWoId']       = $r['continued_from_wo_id'] ?? null;
        $r['continuedFromWoNumber']   = $r['continued_from_wo_number'] ?? null;
        $r['continuedFromBranchName'] = $r['continued_from_branch_name'] ?? null;
        $r['continuedToWoId']         = $r['continued_to_wo_id'] ?? null;
        $r['continuedToWoNumber']     = $r['continued_to_wo_number'] ?? null;
        $r['continuedToBranchName']   = $r['continued_to_branch_name'] ?? null;
        $r['continuedAt']             = $r['continued_at'] ?? null;
        $r['continuedBy']             = $r['continued_by'] ?? null;
        $r['continuedByName']         = $r['continued_by_name'] ?? null;
        $r['continuedBranchId']       = $r['continued_branch_id'] ?? null;
        $r['createdAt']               = $r['created_at'] ?? null;
        $r['updatedAt']               = $r['updated_at'] ?? null;
        $r['services']                = $servicesByWO[$r['id']] ?? [];
    }
    $data['workOrders'] = $canUseWorkOrders ? array_values(array_filter($rows, fn($row) => isset($allowedBranchMap[(string)$row['branch_id']]))) : [];

    // Sales Invoices
    $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
    $invoiceItemRows = $pdo->query("SELECT * FROM sales_invoice_items ORDER BY id")->fetchAll();
    $itemsBySalesInvoice = [];
    foreach ($invoiceItemRows as $item) {
        $itemsBySalesInvoice[$item['invoice_id']][] = [
            'id' => (string)$item['id'], 'itemId' => $item['item_id'], 'code' => $item['code'],
            'name' => $item['name'], 'description' => $item['description'],
            'price' => (float)$item['price'], 'qty' => (int)$item['qty'],
        ];
    }
    foreach ($rows as &$r) {
        $r['invoiceNumber'] = $r['invoice_number'];
        $r['customerRefId'] = $r['customer_ref_id'];
        $r['customerId'] = $r['customer_id'];
        $r['customerName'] = $r['customer_name'];
        $r['vehicleInfo'] = $r['vehicle_info'];
        $r['total'] = (float)$r['total'];
        $r['payment'] = (float)$r['payment'];
        $r['paymentMethod'] = $r['payment_method'] ?? 'Tunai';
        $r['paymentDate'] = $r['payment_date'] ?? null;
        $r['backdateReason'] = $r['backdate_reason'] ?? null;
        $r['age'] = (int)$r['age'];
        $r['woId'] = $r['wo_id'];
        $r['woNumber'] = $r['wo_number'];
        $r['branchId'] = $r['branch_id'];
        $r['createdAt'] = $r['created_at'] ?? null;
        $r['updatedAt'] = $r['updated_at'] ?? null;
        $r['items'] = $itemsBySalesInvoice[$r['id']] ?? [];
    }
    $data['invoices'] = $canUseInvoices ? array_values(array_filter($rows, fn($row) => isset($allowedBranchMap[(string)$row['branch_id']]))) : [];

    // Goods Receipts
    $rows = $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC")->fetchAll();
    $allItems = $pdo->query("SELECT * FROM goods_receipt_items")->fetchAll();
    $itemsByReceipt = [];
    foreach ($allItems as $i) {
        $itemsByReceipt[$i['receipt_id']][] = [
            'id' => (string)$i['id'],
            'itemId' => $i['item_id'],
            'itemCode' => $i['item_code'],
            'itemName' => $i['item_name'],
            'qty' => (int)$i['qty'],
            'unit' => $i['unit'],
            'qtyInvoiced' => (int)$i['qty_invoiced'],
            'unitPrice' => (float)($i['unit_price'] ?? 0),
            'discountPercent' => (float)($i['discount_percent'] ?? 0),
            'discountAmount' => (float)($i['discount_amount'] ?? 0),
            'subtotal' => (float)($i['subtotal'] ?? 0),
            'technicianId' => $i['technician_id'] ?? '',
            'technicianName' => $i['technician_name'] ?? '',
            'lineNotes' => $i['line_notes'] ?? '',
            'isDeferred' => (bool)($i['is_deferred'] ?? false),
            'deferReason' => $i['defer_reason'] ?? '',
            'deferUntil' => $i['defer_until'] ?? '',
        ];
    }
    foreach ($rows as &$r) {
        $r['receiptNumber'] = $r['receipt_number'];
        $r['supplierId'] = $canSeeSuppliers ? $r['supplier_id'] : '';
        $r['supplierName'] = $canSeeSuppliers ? $r['supplier_name'] : '';
        $r['doNumber'] = $r['do_number'];
        $r['deliveryMethod'] = $r['delivery_method'] ?? 'Diantar Supplier';
        $r['deliveryOther'] = $r['delivery_other'] ?? '';
        $r['shippingNotes'] = $r['shipping_notes'] ?? '';
        $r['sourceType'] = $r['source_type'] ?? 'Supplier';
        $r['sourceWarehouseId'] = $r['source_warehouse_id'] ?? null;
        $r['sourceBranchId'] = $r['source_branch_id'] ?? null;
        $r['transferNumber'] = $r['transfer_number'] ?? null;
        $r['branchId'] = $r['branch_id'];
        $r['warehouseId'] = $r['warehouse_id'] ?? null;
        $r['receivedBy'] = $r['received_by'];
        $r['receivedById'] = $r['received_by_id'] ?? null;
        $r['createdAt'] = $r['created_at'];
        $r['items'] = $itemsByReceipt[$r['id']] ?? [];
    }
    $data['goodsReceipts'] = $canUseReceipts ? array_values(array_filter($rows, fn($row) => isset($allowedBranchMap[(string)$row['branch_id']]))) : [];

    // Purchase Invoices
    $rows = $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC")->fetchAll();
    $allPIItems = $pdo->query("SELECT * FROM purchase_invoice_items")->fetchAll();
    $allPayments = $pdo->query("SELECT * FROM purchase_payments")->fetchAll();
    $piItemsById = [];
    $paymentsById = [];
    foreach ($allPIItems as $i) {
        $piItemsById[$i['invoice_id']][] = [
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
    }
    foreach ($allPayments as $p) {
        $paymentsById[$p['invoice_id']][] = [
            'id' => $p['id'],
            'paymentNumber' => $p['payment_number'],
            'date' => $p['date'],
            'amount' => (float)$p['amount'],
            'paymentMethod' => $p['payment_method'],
            'bankAccount' => $p['account_id'] ?? $p['bank_account'],
            'notes' => $p['notes'],
        ];
    }
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
        $r['items'] = $piItemsById[$r['id']] ?? [];
        $r['payments'] = $paymentsById[$r['id']] ?? [];
        $r['receiptIds'] = array_values(array_unique(array_map(function($x) { return $x['receiptId']; }, $r['items'])));
    }
    $data['purchaseInvoices'] = $canUsePurchases ? array_values(array_filter($rows, fn($row) => isset($allowedBranchMap[(string)$row['branch_id']]))) : [];

    $settingsTable = $pdo->query("SHOW TABLES LIKE 'app_settings'")->fetch();
    if ($settingsTable) {
        $settingsRow = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
        if ($settingsRow) $data['settings'] = json_decode($settingsRow['settings_json'], true);
    }

    respondSuccess($data, 'All data loaded');
} catch (Exception $e) {
    respondError('Failed to load data', 500, $e->getMessage());
}
