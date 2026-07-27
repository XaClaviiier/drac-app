<?php
// ==========================================================
// DOKTER AC MOBIL - AUTO INSTALLER
// ==========================================================
// Cara pakai:
// 1. Upload file ini ke public_html/ di cPanel
// 2. Buka di browser: https://namadomain.com/api-installer.php
// 3. Isi info database Anda
// 4. Klik "Install" - semua file akan otomatis dibuat
// 5. HAPUS file ini setelah selesai untuk keamanan!
// ==========================================================

// Prevent execution timeout
set_time_limit(300);

$installed = false;
$errors = [];
$logs = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $dbHost = $_POST['db_host'] ?? 'localhost';
    $dbName = $_POST['db_name'] ?? '';
    $dbUser = $_POST['db_user'] ?? '';
    $dbPass = $_POST['db_pass'] ?? '';

    if (!$dbName || !$dbUser) {
        $errors[] = 'Nama database dan user harus diisi';
    } else {
        // Test DB connection first
        try {
            $testPdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $logs[] = '✅ Koneksi database berhasil';

            // Check if tables exist
            $tables = $testPdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            $requiredTables = ['branches', 'users', 'items', 'customers', 'vehicles'];
            $missingTables = array_diff($requiredTables, $tables);
            if (count($missingTables) > 0) {
                $errors[] = '⚠️ Tabel belum lengkap! Import dulu SQL schema. Yang belum ada: ' . implode(', ', $missingTables);
            } else {
                $logs[] = '✅ Tabel database sudah lengkap (' . count($tables) . ' tabel)';
            }
        } catch (Exception $e) {
            $errors[] = '❌ Koneksi DB gagal: ' . $e->getMessage();
        }

        if (empty($errors)) {
            // Create api folder
            $apiDir = __DIR__ . '/api';
            if (!is_dir($apiDir)) {
                mkdir($apiDir, 0755, true);
                $logs[] = '✅ Folder api/ dibuat';
            }
            $endpointsDir = $apiDir . '/endpoints';
            if (!is_dir($endpointsDir)) {
                mkdir($endpointsDir, 0755, true);
                $logs[] = '✅ Folder api/endpoints/ dibuat';
            }

            // ========== WRITE ALL FILES ==========
            $files = getAllFiles($dbHost, $dbName, $dbUser, $dbPass);
            foreach ($files as $path => $content) {
                $fullPath = $apiDir . '/' . $path;
                $dir = dirname($fullPath);
                if (!is_dir($dir)) mkdir($dir, 0755, true);
                file_put_contents($fullPath, $content);
                $logs[] = "✅ Created: api/$path (" . number_format(strlen($content)) . " bytes)";
            }

            $installed = true;
        }
    }
}

// ==========================================================
// FILE CONTENTS
// ==========================================================
function getAllFiles($host, $name, $user, $pass) {
    $files = [];

    // config.php
    $files['config.php'] = "<?php
define('DB_HOST', '$host');
define('DB_NAME', '$name');
define('DB_USER', '$user');
define('DB_PASS', '$pass');

header(\"Access-Control-Allow-Origin: *\");
header(\"Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\");
header(\"Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With\");
header(\"Content-Type: application/json; charset=UTF-8\");

if (\$_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

try {
    \$pdo = new PDO(\"mysql:host=\" . DB_HOST . \";dbname=\" . DB_NAME . \";charset=utf8mb4\", DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException \$e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB connection failed', 'error' => \$e->getMessage()]);
    exit;
}

function respond(\$data, \$status = 200) { http_response_code(\$status); echo json_encode(\$data); exit; }
function respondSuccess(\$data = null, \$message = 'Success') { respond(['success' => true, 'message' => \$message, 'data' => \$data]); }
function respondError(\$message = 'Error', \$status = 400, \$error = null) { respond(['success' => false, 'message' => \$message, 'error' => \$error], \$status); }
function getInput() { return json_decode(file_get_contents('php://input'), true) ?: []; }
function generateId() { return uniqid(); }
function nowDate() { return date('Y-m-d'); }
";

    // .htaccess
    $files['.htaccess'] = "<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /api/
  RewriteCond %{HTTP:Authorization} .
  RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.*)\$ index.php?route=\$1 [QSA,L]
</IfModule>
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin \"*\"
  Header set Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\"
  Header set Access-Control-Allow-Headers \"Content-Type, Authorization, X-Requested-With\"
</IfModule>
Options -Indexes";

    // index.php (router)
    $files['index.php'] = '<?php
require_once "config.php";
$route = $_GET["route"] ?? "";
$method = $_SERVER["REQUEST_METHOD"];
$parts = explode("/", trim($route, "/"));
$resource = $parts[0] ?? "";
$id = $parts[1] ?? null;
$action = $parts[2] ?? null;
try {
    switch ($resource) {
        case "login": require "endpoints/auth.php"; break;
        case "branches": require "endpoints/branches.php"; break;
        case "roles": require "endpoints/roles.php"; break;
        case "users": require "endpoints/users.php"; break;
        case "customers": require "endpoints/customers.php"; break;
        case "vehicles": require "endpoints/vehicles.php"; break;
        case "suppliers": require "endpoints/suppliers.php"; break;
        case "items": require "endpoints/items.php"; break;
        case "item-categories": require "endpoints/item-categories.php"; break;
        case "work-orders": require "endpoints/work-orders.php"; break;
        case "sales-invoices": require "endpoints/sales-invoices.php"; break;
        case "goods-receipts": require "endpoints/goods-receipts.php"; break;
        case "purchase-invoices": require "endpoints/purchase-invoices.php"; break;
        case "all-data": require "endpoints/all-data.php"; break;
        case "":
        case "info":
            respondSuccess(["app" => "Dokter AC Mobil API", "version" => "1.0.0", "status" => "OK"]);
            break;
        default: respondError("Endpoint not found: " . $resource, 404);
    }
} catch (Exception $e) {
    respondError("Server error", 500, $e->getMessage());
}
';

    // endpoints/auth.php
    $files['endpoints/auth.php'] = '<?php
if ($method !== "POST") respondError("Method not allowed", 405);
$input = getInput();
$username = $input["username"] ?? "";
$password = $input["password"] ?? "";
if (!$username || !$password) respondError("Username & password wajib diisi");

$stmt = $pdo->prepare("SELECT u.*, r.name as role_name, r.permissions, b.name as branch_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id WHERE u.username = ? AND u.is_active = 1");
$stmt->execute([$username]);
$user = $stmt->fetch();
if (!$user) respondError("Username tidak ditemukan", 401);
if ($user["password"] !== $password) respondError("Password salah", 401);

$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user["id"]]);
unset($user["password"]);
$user["roleName"] = $user["role_name"];
$user["roleId"] = $user["role_id"];
$user["branchName"] = $user["branch_name"];
$user["branchId"] = $user["branch_id"];
$user["isActive"] = (bool)$user["is_active"];
if ($user["permissions"]) $user["permissions"] = json_decode($user["permissions"]);
respondSuccess($user, "Login berhasil");
';

    // endpoints/branches.php
    $files['endpoints/branches.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
        foreach ($rows as &$r) $r["isActive"] = (bool)$r["is_active"];
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->prepare("INSERT INTO branches (id, code, name, address, phone, is_active) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $d["code"], $d["name"], $d["address"] ?? "", $d["phone"] ?? "", $d["isActive"] ?? 1]);
        respondSuccess(null, "Cabang ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE branches SET code=?, name=?, address=?, phone=?, is_active=? WHERE id=?")
            ->execute([$d["code"], $d["name"], $d["address"] ?? "", $d["phone"] ?? "", $d["isActive"] ?? 1, $id]);
        respondSuccess(null, "Cabang diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM branches WHERE id=?")->execute([$id]);
        respondSuccess(null, "Cabang dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/roles.php
    $files['endpoints/roles.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM roles ORDER BY code")->fetchAll();
        foreach ($rows as &$r) {
            $r["isActive"] = (bool)$r["is_active"];
            $r["permissions"] = $r["permissions"] ? json_decode($r["permissions"]) : [];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->prepare("INSERT INTO roles (id, code, name, description, permissions, is_active) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $d["code"], $d["name"], $d["description"] ?? "", json_encode($d["permissions"] ?? []), $d["isActive"] ?? 1]);
        respondSuccess(null, "Role ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE roles SET code=?, name=?, description=?, permissions=?, is_active=? WHERE id=?")
            ->execute([$d["code"], $d["name"], $d["description"] ?? "", json_encode($d["permissions"] ?? []), $d["isActive"] ?? 1, $id]);
        respondSuccess(null, "Role diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM roles WHERE id=?")->execute([$id]);
        respondSuccess(null, "Role dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/users.php
    $files['endpoints/users.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT u.*, r.name as role_name, b.name as branch_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id ORDER BY u.username")->fetchAll();
        foreach ($rows as &$r) {
            unset($r["password"]);
            $r["roleName"] = $r["role_name"]; $r["roleId"] = $r["role_id"];
            $r["branchName"] = $r["branch_name"]; $r["branchId"] = $r["branch_id"];
            $r["isActive"] = (bool)$r["is_active"];
            $r["lastLogin"] = $r["last_login"]; $r["createdAt"] = $r["created_at"];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->prepare("INSERT INTO users (id, username, name, email, password, role_id, branch_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $d["username"], $d["name"], $d["email"] ?? "", $d["password"], $d["roleId"], $d["branchId"], $d["isActive"] ?? 1]);
        respondSuccess(null, "User ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        if (!empty($d["password"])) {
            $pdo->prepare("UPDATE users SET username=?, name=?, email=?, password=?, role_id=?, branch_id=?, is_active=? WHERE id=?")
                ->execute([$d["username"], $d["name"], $d["email"] ?? "", $d["password"], $d["roleId"], $d["branchId"], $d["isActive"] ?? 1, $id]);
        } else {
            $pdo->prepare("UPDATE users SET username=?, name=?, email=?, role_id=?, branch_id=?, is_active=? WHERE id=?")
                ->execute([$d["username"], $d["name"], $d["email"] ?? "", $d["roleId"], $d["branchId"], $d["isActive"] ?? 1, $id]);
        }
        respondSuccess(null, "User diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]);
        respondSuccess(null, "User dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/customers.php
    $files['endpoints/customers.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
        foreach ($rows as &$r) {
            $r["customerCode"] = $r["customer_code"];
            $r["branchId"] = $r["branch_id"];
            $r["createdAt"] = $r["created_at"];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $code = $d["customerCode"] ?? "";
        if (!$code) {
            $maxRow = $pdo->query("SELECT customer_code FROM customers ORDER BY id DESC LIMIT 1")->fetch();
            $num = 1;
            if ($maxRow && preg_match("/PLG-(\d+)/", $maxRow["customer_code"], $m)) $num = intval($m[1]) + 1;
            $code = "PLG-" . str_pad($num, 3, "0", STR_PAD_LEFT);
        }
        $pdo->prepare("INSERT INTO customers (id, customer_code, name, phone, email, address, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $code, $d["name"], $d["phone"] ?? "", $d["email"] ?? "", $d["address"] ?? "", $d["branchId"] ?? "BR-001"]);
        respondSuccess(["customerCode" => $code], "Pelanggan ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE customers SET name=?, phone=?, email=?, address=?, branch_id=? WHERE id=?")
            ->execute([$d["name"], $d["phone"] ?? "", $d["email"] ?? "", $d["address"] ?? "", $d["branchId"] ?? "BR-001", $id]);
        respondSuccess(null, "Pelanggan diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM customers WHERE id=?")->execute([$id]);
        respondSuccess(null, "Pelanggan dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/vehicles.php
    $files['endpoints/vehicles.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
        foreach ($rows as &$r) {
            $r["plateNumber"] = $r["plate_number"];
            $r["customerId"] = $r["customer_code"] ?: $r["customer_id"];
            $r["customerName"] = $r["customer_name"];
            $r["registrationDate"] = $r["registration_date"];
            $r["branchId"] = $r["branch_id"];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->prepare("INSERT INTO vehicles (id, plate_number, brand, model, year, color, customer_id, customer_name, customer_code, phone, address, registration_date, notes, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $d["plateNumber"], $d["brand"] ?? "", $d["model"] ?? "", $d["year"] ?? 0, $d["color"] ?? "", $d["customerRefId"] ?? "", $d["customerName"] ?? "", $d["customerId"] ?? "", $d["phone"] ?? "", $d["address"] ?? "", $d["registrationDate"] ?? nowDate(), $d["notes"] ?? "", $d["branchId"] ?? "BR-001"]);
        respondSuccess(null, "Kendaraan ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE vehicles SET plate_number=?, brand=?, model=?, year=?, color=?, customer_id=?, customer_name=?, customer_code=?, phone=?, address=?, notes=?, branch_id=? WHERE id=?")
            ->execute([$d["plateNumber"], $d["brand"] ?? "", $d["model"] ?? "", $d["year"] ?? 0, $d["color"] ?? "", $d["customerRefId"] ?? "", $d["customerName"] ?? "", $d["customerId"] ?? "", $d["phone"] ?? "", $d["address"] ?? "", $d["notes"] ?? "", $d["branchId"] ?? "BR-001", $id]);
        respondSuccess(null, "Kendaraan diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM vehicles WHERE id=?")->execute([$id]);
        respondSuccess(null, "Kendaraan dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/suppliers.php
    $files['endpoints/suppliers.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM suppliers ORDER BY code")->fetchAll();
        foreach ($rows as &$r) {
            $r["contactPerson"] = $r["contact_person"];
            $r["isActive"] = (bool)$r["is_active"];
            $r["createdAt"] = $r["created_at"];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $code = $d["code"] ?? "";
        if (!$code) {
            $maxRow = $pdo->query("SELECT code FROM suppliers ORDER BY id DESC LIMIT 1")->fetch();
            $num = 1;
            if ($maxRow && preg_match("/SUP-(\d+)/", $maxRow["code"], $m)) $num = intval($m[1]) + 1;
            $code = "SUP-" . str_pad($num, 3, "0", STR_PAD_LEFT);
        }
        $pdo->prepare("INSERT INTO suppliers (id, code, name, contact_person, phone, email, address, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $code, $d["name"], $d["contactPerson"] ?? "", $d["phone"] ?? "", $d["email"] ?? "", $d["address"] ?? "", $d["isActive"] ?? 1]);
        respondSuccess(["code" => $code], "Supplier ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, is_active=? WHERE id=?")
            ->execute([$d["name"], $d["contactPerson"] ?? "", $d["phone"] ?? "", $d["email"] ?? "", $d["address"] ?? "", $d["isActive"] ?? 1, $id]);
        respondSuccess(null, "Supplier diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM suppliers WHERE id=?")->execute([$id]);
        respondSuccess(null, "Supplier dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/item-categories.php
    $files['endpoints/item-categories.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM item_categories ORDER BY code")->fetchAll();
        foreach ($rows as &$r) $r["isActive"] = (bool)$r["is_active"];
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $dup = $pdo->prepare("SELECT id FROM item_categories WHERE UPPER(code) = UPPER(?) OR LOWER(name) = LOWER(?) LIMIT 1");
        $dup->execute([$d["code"], $d["name"]]);
        if ($dup->fetch()) respondError("Kode atau nama kategori sudah digunakan", 409);
        $pdo->prepare("INSERT INTO item_categories (id, code, name, type, description, is_active) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([$d["id"] ?? generateId(), $d["code"], $d["name"], $d["type"] ?? "Semua", $d["description"] ?? "", $d["isActive"] ?? 1]);
        respondSuccess(null, "Kategori ditambahkan");
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $dup = $pdo->prepare("SELECT id FROM item_categories WHERE (UPPER(code) = UPPER(?) OR LOWER(name) = LOWER(?)) AND id <> ? LIMIT 1");
        $dup->execute([$d["code"], $d["name"], $id]);
        if ($dup->fetch()) respondError("Kode atau nama kategori sudah digunakan", 409);
        $pdo->prepare("UPDATE item_categories SET code=?, name=?, type=?, description=?, is_active=? WHERE id=?")
            ->execute([$d["code"], $d["name"], $d["type"] ?? "Semua", $d["description"] ?? "", $d["isActive"] ?? 1, $id]);
        respondSuccess(null, "Kategori diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $used = $pdo->prepare("SELECT COUNT(*) FROM items WHERE category_id = ?");
        $used->execute([$id]);
        if ((int)$used->fetchColumn() > 0) respondError("Kategori masih digunakan oleh barang/jasa", 409);
        $pdo->prepare("DELETE FROM item_categories WHERE id=?")->execute([$id]);
        respondSuccess(null, "Kategori dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/items.php
    $files['endpoints/items.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
        foreach ($rows as &$r) {
            $r["categoryId"] = $r["category_id"];
            $r["categoryName"] = $r["category_name"];
            $r["sellableStock"] = (int)$r["sellable_stock"];
            $r["purchasePrice"] = (float)$r["purchase_price"];
            $r["sellingPrice"] = (float)$r["selling_price"];
            $r["isActive"] = (bool)$r["is_active"];
            $r["isQuickService"] = (bool)$r["is_quick_service"];
            $r["branchId"] = $r["branch_id"];
            if ($r["type"] === "Group") {
                $stmt = $pdo->prepare("SELECT * FROM item_group_members WHERE group_item_id = ?");
                $stmt->execute([$r["id"]]);
                $r["groupMembers"] = array_map(function($m) {
                    return ["itemId" => $m["member_item_id"], "itemCode" => $m["member_code"], "itemName" => $m["member_name"], "itemType" => $m["member_type"], "qty" => (int)$m["qty"], "unitPrice" => (float)$m["unit_price"]];
                }, $stmt->fetchAll());
            }
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $itemId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO items (id, code, name, category_id, category_name, type, brand, unit, stock, sellable_stock, purchase_price, selling_price, is_active, is_quick_service, description, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$itemId, $d["code"], $d["name"], $d["categoryId"] ?? "", $d["categoryName"] ?? "", $d["type"], $d["brand"] ?? "", $d["unit"] ?? "PCS", $d["stock"] ?? 0, $d["sellableStock"] ?? 0, $d["purchasePrice"] ?? 0, $d["sellingPrice"] ?? 0, $d["isActive"] ?? 1, $d["isQuickService"] ?? 0, $d["description"] ?? "", $d["branchId"] ?? "BR-001"]);
            if (($d["type"] ?? "") === "Group" && !empty($d["groupMembers"])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["groupMembers"] as $m) {
                    $memStmt->execute([$itemId, $m["itemId"], $m["itemCode"], $m["itemName"], $m["itemType"], $m["qty"], $m["unitPrice"]]);
                }
            }
            $pdo->commit();
            respondSuccess(["id" => $itemId], "Barang/Jasa ditambahkan");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE items SET code=?, name=?, category_id=?, category_name=?, type=?, brand=?, unit=?, stock=?, sellable_stock=?, purchase_price=?, selling_price=?, is_active=?, is_quick_service=?, description=?, branch_id=? WHERE id=?")
                ->execute([$d["code"], $d["name"], $d["categoryId"] ?? "", $d["categoryName"] ?? "", $d["type"], $d["brand"] ?? "", $d["unit"] ?? "PCS", $d["stock"] ?? 0, $d["sellableStock"] ?? 0, $d["purchasePrice"] ?? 0, $d["sellingPrice"] ?? 0, $d["isActive"] ?? 1, $d["isQuickService"] ?? 0, $d["description"] ?? "", $d["branchId"] ?? "BR-001", $id]);
            $pdo->prepare("DELETE FROM item_group_members WHERE group_item_id = ?")->execute([$id]);
            if (($d["type"] ?? "") === "Group" && !empty($d["groupMembers"])) {
                $memStmt = $pdo->prepare("INSERT INTO item_group_members (group_item_id, member_item_id, member_code, member_name, member_type, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["groupMembers"] as $m) {
                    $memStmt->execute([$id, $m["itemId"], $m["itemCode"], $m["itemName"], $m["itemType"], $m["qty"], $m["unitPrice"]]);
                }
            }
            $pdo->commit();
            respondSuccess(null, "Item diupdate");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM items WHERE id=?")->execute([$id]);
        respondSuccess(null, "Item dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/work-orders.php
    $files['endpoints/work-orders.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r["woNumber"] = $r["wo_number"];
            $r["customerRefId"] = $r["customer_ref_id"]; $r["customerId"] = $r["customer_id"]; $r["customerName"] = $r["customer_name"];
            $r["vehicleRefId"] = $r["vehicle_ref_id"]; $r["plateNumber"] = $r["plate_number"]; $r["vehicleInfo"] = $r["vehicle_info"];
            $r["branchId"] = $r["branch_id"]; $r["invoiceId"] = $r["invoice_id"]; $r["invoiceNumber"] = $r["invoice_number"];
            $r["total"] = (float)$r["total"];
            $r["findings"] = $r["findings"] ?? null;
            $r["estimateTotal"] = isset($r["estimate_total"]) ? (float)$r["estimate_total"] : null;
            $r["approvedAt"] = $r["approved_at"] ?? null;
            $r["continuedFromWoId"] = $r["continued_from_wo_id"] ?? null;
            $r["continuedFromWoNumber"] = $r["continued_from_wo_number"] ?? null;
            $r["continuedFromBranchName"] = $r["continued_from_branch_name"] ?? null;
            $r["continuedToWoId"] = $r["continued_to_wo_id"] ?? null;
            $r["continuedToWoNumber"] = $r["continued_to_wo_number"] ?? null;
            $r["continuedToBranchName"] = $r["continued_to_branch_name"] ?? null;
            $stmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
            $stmt->execute([$r["id"]]);
            $r["services"] = array_map(function($s) { return ["id" => (string)$s["id"], "itemId" => $s["item_id"], "code" => $s["code"], "name" => $s["name"], "description" => $s["description"], "price" => (float)$s["price"], "qty" => (int)$s["qty"]]; }, $stmt->fetchAll());
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $woId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO work_orders (id, wo_number, date, customer_ref_id, customer_id, customer_name, vehicle_ref_id, plate_number, vehicle_info, description, findings, total, estimate_total, approved_at, status, notes, branch_id, continued_from_wo_id, continued_from_wo_number, continued_from_branch_name, continued_to_wo_id, continued_to_wo_number, continued_to_branch_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$woId, $d["woNumber"], $d["date"], $d["customerRefId"] ?? "", $d["customerId"] ?? "", $d["customerName"] ?? "", $d["vehicleRefId"] ?? "", $d["plateNumber"] ?? "", $d["vehicleInfo"] ?? "", $d["description"] ?? "", $d["findings"] ?? null, $d["total"] ?? 0, $d["estimateTotal"] ?? null, $d["approvedAt"] ?? null, $d["status"] ?? "Pengecekan", $d["notes"] ?? "", $d["branchId"] ?? "BR-001", $d["continuedFromWoId"] ?? null, $d["continuedFromWoNumber"] ?? null, $d["continuedFromBranchName"] ?? null, $d["continuedToWoId"] ?? null, $d["continuedToWoNumber"] ?? null, $d["continuedToBranchName"] ?? null]);
            if (!empty($d["services"])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["services"] as $s) {
                    $qty = $s["qty"] ?? 1; $price = $s["price"] ?? 0;
                    $sStmt->execute([$woId, $s["itemId"] ?? null, $s["code"] ?? "", $s["name"], $s["description"] ?? "", $price, $qty, $price * $qty]);
                }
            }
            $pdo->commit();
            respondSuccess(["id" => $woId], "WO disimpan");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE work_orders SET wo_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_ref_id=?, plate_number=?, vehicle_info=?, description=?, findings=?, total=?, estimate_total=?, approved_at=?, status=?, notes=?, branch_id=?, invoice_id=?, invoice_number=?, continued_from_wo_id=?, continued_from_wo_number=?, continued_from_branch_name=?, continued_to_wo_id=?, continued_to_wo_number=?, continued_to_branch_name=? WHERE id=?")
                ->execute([$d["woNumber"], $d["date"], $d["customerRefId"] ?? "", $d["customerId"] ?? "", $d["customerName"] ?? "", $d["vehicleRefId"] ?? "", $d["plateNumber"] ?? "", $d["vehicleInfo"] ?? "", $d["description"] ?? "", $d["findings"] ?? null, $d["total"] ?? 0, $d["estimateTotal"] ?? null, $d["approvedAt"] ?? null, $d["status"] ?? "Pengecekan", $d["notes"] ?? "", $d["branchId"] ?? "BR-001", $d["invoiceId"] ?? null, $d["invoiceNumber"] ?? null, $d["continuedFromWoId"] ?? null, $d["continuedFromWoNumber"] ?? null, $d["continuedFromBranchName"] ?? null, $d["continuedToWoId"] ?? null, $d["continuedToWoNumber"] ?? null, $d["continuedToBranchName"] ?? null, $id]);
            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id = ?")->execute([$id]);
            if (!empty($d["services"])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["services"] as $s) {
                    $qty = $s["qty"] ?? 1; $price = $s["price"] ?? 0;
                    $sStmt->execute([$id, $s["itemId"] ?? null, $s["code"] ?? "", $s["name"], $s["description"] ?? "", $price, $qty, $price * $qty]);
                }
            }
            $pdo->commit();
            respondSuccess(null, "WO diupdate");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->prepare("DELETE FROM work_orders WHERE id=?")->execute([$id]);
        respondSuccess(null, "WO dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/sales-invoices.php
    $files['endpoints/sales-invoices.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r["invoiceNumber"] = $r["invoice_number"]; $r["customerRefId"] = $r["customer_ref_id"];
            $r["customerId"] = $r["customer_id"]; $r["customerName"] = $r["customer_name"]; $r["vehicleInfo"] = $r["vehicle_info"];
            $r["total"] = (float)$r["total"]; $r["payment"] = (float)$r["payment"]; $r["age"] = (int)$r["age"];
            $r["woId"] = $r["wo_id"]; $r["woNumber"] = $r["wo_number"]; $r["branchId"] = $r["branch_id"];
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $invoiceId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO sales_invoices (id, invoice_number, date, customer_ref_id, customer_id, customer_name, vehicle_info, description, total, payment, status, age, wo_id, wo_number, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$invoiceId, $d["invoiceNumber"], $d["date"], $d["customerRefId"] ?? "", $d["customerId"] ?? "", $d["customerName"] ?? "", $d["vehicleInfo"] ?? "", $d["description"] ?? "", $d["total"] ?? 0, $d["payment"] ?? 0, $d["status"] ?? "Belum Lunas", $d["age"] ?? 0, $d["woId"] ?? null, $d["woNumber"] ?? null, $d["branchId"] ?? "BR-001"]);
            if (!empty($d["items"])) {
                $detailStmt = $pdo->prepare("INSERT INTO sales_invoice_items (invoice_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stockStmt = $pdo->prepare("UPDATE items SET stock = GREATEST(0, stock - ?), sellable_stock = GREATEST(0, sellable_stock - ?) WHERE id = ? AND type = ?");
                foreach ($d["items"] as $item) {
                    $qty = (int)($item["qty"] ?? 1); $price = (float)($item["price"] ?? 0);
                    $detailStmt->execute([$invoiceId, $item["itemId"] ?? null, $item["code"] ?? "", $item["name"] ?? "", $item["description"] ?? "", $price, $qty, $price * $qty]);
                    if (!empty($item["itemId"])) $stockStmt->execute([$qty, $qty, $item["itemId"], "Persediaan"]);
                }
            }
            $pdo->commit();
            respondSuccess(["id" => $invoiceId], "Faktur disimpan dan stok diperbarui");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal simpan faktur", 500, $e->getMessage()); }
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE sales_invoices SET invoice_number=?, date=?, customer_ref_id=?, customer_id=?, customer_name=?, vehicle_info=?, description=?, total=?, payment=?, status=?, age=?, branch_id=? WHERE id=?")
            ->execute([$d["invoiceNumber"], $d["date"], $d["customerRefId"] ?? "", $d["customerId"] ?? "", $d["customerName"] ?? "", $d["vehicleInfo"] ?? "", $d["description"] ?? "", $d["total"] ?? 0, $d["payment"] ?? 0, $d["status"] ?? "Belum Lunas", $d["age"] ?? 0, $d["branchId"] ?? "BR-001", $id]);
        respondSuccess(null, "Faktur diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $pdo->beginTransaction();
        try {
            $details = $pdo->prepare("SELECT item_id, qty FROM sales_invoice_items WHERE invoice_id = ?");
            $details->execute([$id]);
            $restore = $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = ?");
            foreach ($details->fetchAll() as $detail) {
                if (!empty($detail["item_id"])) $restore->execute([(int)$detail["qty"], (int)$detail["qty"], $detail["item_id"], "Persediaan"]);
            }
            $pdo->prepare("DELETE FROM sales_invoices WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(null, "Faktur dihapus dan stok dikembalikan");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal hapus faktur", 500, $e->getMessage()); }
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/goods-receipts.php
    $files['endpoints/goods-receipts.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC, receipt_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r["receiptNumber"] = $r["receipt_number"]; $r["supplierId"] = $r["supplier_id"];
            $r["supplierName"] = $r["supplier_name"]; $r["doNumber"] = $r["do_number"];
            $r["branchId"] = $r["branch_id"]; $r["receivedBy"] = $r["received_by"]; $r["createdAt"] = $r["created_at"];
            $stmt = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $stmt->execute([$r["id"]]);
            $r["items"] = array_map(function($i) { return ["id" => (string)$i["id"], "itemId" => $i["item_id"], "itemCode" => $i["item_code"], "itemName" => $i["item_name"], "qty" => (int)$i["qty"], "unit" => $i["unit"], "qtyInvoiced" => (int)$i["qty_invoiced"]]; }, $stmt->fetchAll());
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $rId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO goods_receipts (id, receipt_number, date, supplier_id, supplier_name, do_number, status, notes, branch_id, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$rId, $d["receiptNumber"], $d["date"], $d["supplierId"], $d["supplierName"], $d["doNumber"] ?? "", $d["status"] ?? "Draft", $d["notes"] ?? "", $d["branchId"] ?? "BR-001", $d["receivedBy"] ?? null]);
            if (!empty($d["items"])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["items"] as $i) {
                    $iStmt->execute([$rId, $i["itemId"], $i["itemCode"] ?? "", $i["itemName"] ?? "", $i["qty"] ?? 0, $i["unit"] ?? "", $i["qtyInvoiced"] ?? 0]);
                }
            }
            if (($d["status"] ?? "") === "Diterima" && !empty($d["items"])) {
                foreach ($d["items"] as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = ?")
                        ->execute([$i["qty"], $i["qty"], $i["itemId"], "Persediaan"]);
                }
            }
            $pdo->commit();
            respondSuccess(["id" => $rId], "Penerimaan disimpan");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $oldRow = $pdo->query("SELECT status FROM goods_receipts WHERE id = " . $pdo->quote($id))->fetch();
            $oldStatus = $oldRow["status"] ?? "";
            $oldItems = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $oldItems->execute([$id]);
            $oldItemsList = $oldItems->fetchAll();
            $pdo->prepare("UPDATE goods_receipts SET receipt_number=?, date=?, supplier_id=?, supplier_name=?, do_number=?, status=?, notes=?, branch_id=?, received_by=? WHERE id=?")
                ->execute([$d["receiptNumber"], $d["date"], $d["supplierId"], $d["supplierName"], $d["doNumber"] ?? "", $d["status"] ?? "Draft", $d["notes"] ?? "", $d["branchId"] ?? "BR-001", $d["receivedBy"] ?? null, $id]);
            $pdo->prepare("DELETE FROM goods_receipt_items WHERE receipt_id = ?")->execute([$id]);
            if (!empty($d["items"])) {
                $iStmt = $pdo->prepare("INSERT INTO goods_receipt_items (receipt_id, item_id, item_code, item_name, qty, unit, qty_invoiced) VALUES (?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["items"] as $i) {
                    $iStmt->execute([$id, $i["itemId"], $i["itemCode"] ?? "", $i["itemName"] ?? "", $i["qty"] ?? 0, $i["unit"] ?? "", $i["qtyInvoiced"] ?? 0]);
                }
            }
            $newStatus = $d["status"] ?? "Draft";
            $wasReceived = in_array($oldStatus, ["Diterima", "Difakturkan", "Sebagian"]);
            $isReceived = in_array($newStatus, ["Diterima", "Difakturkan", "Sebagian"]);
            if (!$wasReceived && $isReceived) {
                foreach ($d["items"] as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock + ?, sellable_stock = sellable_stock + ? WHERE id = ? AND type = ?")->execute([$i["qty"], $i["qty"], $i["itemId"], "Persediaan"]);
                }
            } elseif ($wasReceived && !$isReceived) {
                foreach ($oldItemsList as $i) {
                    $pdo->prepare("UPDATE items SET stock = stock - ?, sellable_stock = sellable_stock - ? WHERE id = ? AND type = ?")->execute([$i["qty"], $i["qty"], $i["item_id"], "Persediaan"]);
                }
            }
            $pdo->commit();
            respondSuccess(null, "Penerimaan diupdate");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $row = $pdo->query("SELECT status FROM goods_receipts WHERE id = " . $pdo->quote($id))->fetch();
        if ($row && $row["status"] === "Diterima") {
            $items = $pdo->prepare("SELECT * FROM goods_receipt_items WHERE receipt_id = ?");
            $items->execute([$id]);
            foreach ($items->fetchAll() as $i) {
                $pdo->prepare("UPDATE items SET stock = stock - ?, sellable_stock = sellable_stock - ? WHERE id = ? AND type = ?")->execute([$i["qty"], $i["qty"], $i["item_id"], "Persediaan"]);
            }
        }
        $pdo->prepare("DELETE FROM goods_receipts WHERE id=?")->execute([$id]);
        respondSuccess(null, "Penerimaan dihapus");
        break;
    default: respondError("Method not allowed", 405);
}
';

    // endpoints/purchase-invoices.php
    $files['endpoints/purchase-invoices.php'] = '<?php
switch ($method) {
    case "GET":
        $rows = $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC, invoice_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r["invoiceNumber"] = $r["invoice_number"]; $r["dueDate"] = $r["due_date"];
            $r["supplierId"] = $r["supplier_id"]; $r["supplierName"] = $r["supplier_name"]; $r["supplierInvoiceNumber"] = $r["supplier_invoice_number"];
            $r["subtotal"] = (float)$r["subtotal"]; $r["discount"] = (float)$r["discount"]; $r["tax"] = (float)$r["tax"];
            $r["total"] = (float)$r["total"]; $r["paidAmount"] = (float)$r["paid_amount"]; $r["branchId"] = $r["branch_id"]; $r["createdAt"] = $r["created_at"];
            $stmt = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id = ?");
            $stmt->execute([$r["id"]]);
            $r["items"] = array_map(function($i) { return ["id" => (string)$i["id"], "receiptId" => $i["receipt_id"], "receiptNumber" => $i["receipt_number"], "itemId" => $i["item_id"], "itemCode" => $i["item_code"], "itemName" => $i["item_name"], "qty" => (int)$i["qty"], "unit" => $i["unit"], "unitPrice" => (float)$i["unit_price"], "discount" => (float)$i["discount"], "subtotal" => (float)$i["subtotal"]]; }, $stmt->fetchAll());
            $r["receiptIds"] = array_values(array_unique(array_map(function($x) { return $x["receiptId"]; }, $r["items"])));
            $pStmt = $pdo->prepare("SELECT * FROM purchase_payments WHERE invoice_id = ? ORDER BY date");
            $pStmt->execute([$r["id"]]);
            $r["payments"] = array_map(function($p) { return ["id" => $p["id"], "paymentNumber" => $p["payment_number"], "date" => $p["date"], "amount" => (float)$p["amount"], "paymentMethod" => $p["payment_method"], "bankAccount" => $p["bank_account"], "notes" => $p["notes"]]; }, $pStmt->fetchAll());
        }
        respondSuccess($rows);
        break;
    case "POST":
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $piId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO purchase_invoices (id, invoice_number, date, due_date, supplier_id, supplier_name, supplier_invoice_number, subtotal, discount, tax, total, paid_amount, status, notes, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$piId, $d["invoiceNumber"], $d["date"], $d["dueDate"] ?? null, $d["supplierId"], $d["supplierName"], $d["supplierInvoiceNumber"] ?? "", $d["subtotal"] ?? 0, $d["discount"] ?? 0, $d["tax"] ?? 0, $d["total"] ?? 0, $d["paidAmount"] ?? 0, $d["status"] ?? "Belum Lunas", $d["notes"] ?? "", $d["branchId"] ?? "BR-001"]);
            if (!empty($d["items"])) {
                $iStmt = $pdo->prepare("INSERT INTO purchase_invoice_items (invoice_id, receipt_id, receipt_number, item_id, item_code, item_name, qty, unit, unit_price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d["items"] as $i) {
                    $iStmt->execute([$piId, $i["receiptId"] ?? null, $i["receiptNumber"] ?? "", $i["itemId"], $i["itemCode"], $i["itemName"], $i["qty"], $i["unit"] ?? "", $i["unitPrice"], $i["discount"] ?? 0, $i["subtotal"]]);
                    if (!empty($i["receiptId"])) {
                        $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced = qty_invoiced + ? WHERE receipt_id = ? AND item_id = ?")->execute([$i["qty"], $i["receiptId"], $i["itemId"]]);
                    }
                }
            }
            if (!empty($d["receiptIds"])) {
                foreach ($d["receiptIds"] as $rid) {
                    $itemsRow = $pdo->prepare("SELECT SUM(qty) as tot, SUM(qty_invoiced) as inv FROM goods_receipt_items WHERE receipt_id = ?");
                    $itemsRow->execute([$rid]);
                    $r = $itemsRow->fetch();
                    $newStatus = "Diterima";
                    if ($r["inv"] >= $r["tot"]) $newStatus = "Difakturkan";
                    elseif ($r["inv"] > 0) $newStatus = "Sebagian";
                    $pdo->prepare("UPDATE goods_receipts SET status = ? WHERE id = ?")->execute([$newStatus, $rid]);
                }
            }
            $pdo->commit();
            respondSuccess(["id" => $piId], "Faktur pembelian dibuat");
        } catch (Exception $e) { $pdo->rollBack(); respondError("Gagal", 500, $e->getMessage()); }
        break;
    case "PUT":
        if (!$id) respondError("ID required");
        $d = getInput();
        $pdo->prepare("UPDATE purchase_invoices SET date=?, due_date=?, supplier_invoice_number=?, subtotal=?, discount=?, tax=?, total=?, status=?, notes=? WHERE id=?")
            ->execute([$d["date"], $d["dueDate"] ?? null, $d["supplierInvoiceNumber"] ?? "", $d["subtotal"] ?? 0, $d["discount"] ?? 0, $d["tax"] ?? 0, $d["total"] ?? 0, $d["status"] ?? "Belum Lunas", $d["notes"] ?? "", $id]);
        respondSuccess(null, "Faktur pembelian diupdate");
        break;
    case "DELETE":
        if (!$id) respondError("ID required");
        $items = $pdo->prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id = ?");
        $items->execute([$id]);
        foreach ($items->fetchAll() as $i) {
            if (!empty($i["receipt_id"])) {
                $pdo->prepare("UPDATE goods_receipt_items SET qty_invoiced = GREATEST(0, qty_invoiced - ?) WHERE receipt_id = ? AND item_id = ?")->execute([$i["qty"], $i["receipt_id"], $i["item_id"]]);
            }
        }
        $pdo->prepare("DELETE FROM purchase_invoices WHERE id=?")->execute([$id]);
        respondSuccess(null, "Faktur pembelian dihapus");
        break;
    default:
        if ($action === "payments" && $method === "POST") {
            $d = getInput();
            $payId = $d["id"] ?? generateId();
            $pdo->prepare("INSERT INTO purchase_payments (id, payment_number, invoice_id, date, amount, payment_method, bank_account, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$payId, $d["paymentNumber"], $id, $d["date"], $d["amount"], $d["paymentMethod"] ?? "Kas", $d["bankAccount"] ?? "", $d["notes"] ?? ""]);
            $sum = $pdo->prepare("SELECT SUM(amount) as tot FROM purchase_payments WHERE invoice_id = ?");
            $sum->execute([$id]);
            $paid = (float)($sum->fetch()["tot"] ?? 0);
            $inv = $pdo->prepare("SELECT total FROM purchase_invoices WHERE id = ?");
            $inv->execute([$id]);
            $total = (float)($inv->fetch()["total"] ?? 0);
            $status = $paid >= $total ? "Lunas" : ($paid > 0 ? "Sebagian" : "Belum Lunas");
            $pdo->prepare("UPDATE purchase_invoices SET paid_amount = ?, status = ? WHERE id = ?")->execute([$paid, $status, $id]);
            respondSuccess(null, "Pembayaran dicatat");
        }
        respondError("Method not allowed", 405);
}
';

    // endpoints/all-data.php
    $files['endpoints/all-data.php'] = '<?php
if ($method !== "GET") respondError("Method not allowed", 405);
try {
    $data = [];
    $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
    foreach ($rows as &$r) $r["isActive"] = (bool)$r["is_active"];
    $data["branches"] = $rows;

    $rows = $pdo->query("SELECT * FROM roles ORDER BY code")->fetchAll();
    foreach ($rows as &$r) { $r["isActive"] = (bool)$r["is_active"]; $r["permissions"] = $r["permissions"] ? json_decode($r["permissions"]) : []; }
    $data["roles"] = $rows;

    $rows = $pdo->query("SELECT u.*, r.name as role_name, b.name as branch_name FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id")->fetchAll();
    foreach ($rows as &$r) {
        unset($r["password"]);
        $r["roleName"] = $r["role_name"]; $r["roleId"] = $r["role_id"];
        $r["branchName"] = $r["branch_name"]; $r["branchId"] = $r["branch_id"];
        $r["isActive"] = (bool)$r["is_active"]; $r["lastLogin"] = $r["last_login"]; $r["createdAt"] = $r["created_at"];
    }
    $data["users"] = $rows;

    $rows = $pdo->query("SELECT * FROM customers ORDER BY customer_code")->fetchAll();
    foreach ($rows as &$r) { $r["customerCode"] = $r["customer_code"]; $r["branchId"] = $r["branch_id"]; $r["createdAt"] = $r["created_at"]; }
    $data["customers"] = $rows;

    $rows = $pdo->query("SELECT * FROM vehicles ORDER BY plate_number")->fetchAll();
    foreach ($rows as &$r) { $r["plateNumber"] = $r["plate_number"]; $r["customerId"] = $r["customer_code"] ?: $r["customer_id"]; $r["customerName"] = $r["customer_name"]; $r["registrationDate"] = $r["registration_date"]; $r["branchId"] = $r["branch_id"]; }
    $data["vehicles"] = $rows;

    $rows = $pdo->query("SELECT * FROM suppliers ORDER BY code")->fetchAll();
    foreach ($rows as &$r) { $r["contactPerson"] = $r["contact_person"]; $r["isActive"] = (bool)$r["is_active"]; $r["createdAt"] = $r["created_at"]; }
    $data["suppliers"] = $rows;

    $rows = $pdo->query("SELECT * FROM item_categories ORDER BY code")->fetchAll();
    foreach ($rows as &$r) $r["isActive"] = (bool)$r["is_active"];
    $data["itemCategories"] = $rows;

    $rows = $pdo->query("SELECT * FROM items ORDER BY code")->fetchAll();
    $groupMembersAll = $pdo->query("SELECT * FROM item_group_members")->fetchAll();
    $membersByGroup = [];
    foreach ($groupMembersAll as $m) {
        $membersByGroup[$m["group_item_id"]][] = ["itemId" => $m["member_item_id"], "itemCode" => $m["member_code"], "itemName" => $m["member_name"], "itemType" => $m["member_type"], "qty" => (int)$m["qty"], "unitPrice" => (float)$m["unit_price"]];
    }
    foreach ($rows as &$r) {
        $r["categoryId"] = $r["category_id"]; $r["categoryName"] = $r["category_name"];
        $r["sellableStock"] = (int)$r["sellable_stock"]; $r["purchasePrice"] = (float)$r["purchase_price"]; $r["sellingPrice"] = (float)$r["selling_price"];
        $r["isActive"] = (bool)$r["is_active"]; $r["isQuickService"] = (bool)$r["is_quick_service"]; $r["branchId"] = $r["branch_id"];
        if ($r["type"] === "Group") $r["groupMembers"] = $membersByGroup[$r["id"]] ?? [];
    }
    $data["items"] = $rows;

    $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC")->fetchAll();
    $allServices = $pdo->query("SELECT * FROM work_order_services")->fetchAll();
    $servicesByWO = [];
    foreach ($allServices as $s) {
        $servicesByWO[$s["wo_id"]][] = ["id" => (string)$s["id"], "itemId" => $s["item_id"], "code" => $s["code"], "name" => $s["name"], "description" => $s["description"], "price" => (float)$s["price"], "qty" => (int)$s["qty"]];
    }
    foreach ($rows as &$r) {
        $r["woNumber"] = $r["wo_number"]; $r["customerRefId"] = $r["customer_ref_id"]; $r["customerId"] = $r["customer_id"]; $r["customerName"] = $r["customer_name"];
        $r["vehicleRefId"] = $r["vehicle_ref_id"]; $r["plateNumber"] = $r["plate_number"]; $r["vehicleInfo"] = $r["vehicle_info"];
        $r["branchId"] = $r["branch_id"]; $r["invoiceId"] = $r["invoice_id"]; $r["invoiceNumber"] = $r["invoice_number"];
        $r["total"] = (float)$r["total"];
        $r["findings"] = $r["findings"] ?? null;
        $r["estimateTotal"] = isset($r["estimate_total"]) ? (float)$r["estimate_total"] : null;
        $r["approvedAt"] = $r["approved_at"] ?? null;
        $r["continuedFromWoId"] = $r["continued_from_wo_id"] ?? null;
        $r["continuedFromWoNumber"] = $r["continued_from_wo_number"] ?? null;
        $r["continuedFromBranchName"] = $r["continued_from_branch_name"] ?? null;
        $r["continuedToWoId"] = $r["continued_to_wo_id"] ?? null;
        $r["continuedToWoNumber"] = $r["continued_to_wo_number"] ?? null;
        $r["continuedToBranchName"] = $r["continued_to_branch_name"] ?? null;
        $r["services"] = $servicesByWO[$r["id"]] ?? [];
    }
    $data["workOrders"] = $rows;

    $rows = $pdo->query("SELECT * FROM sales_invoices ORDER BY date DESC")->fetchAll();
    foreach ($rows as &$r) {
        $r["invoiceNumber"] = $r["invoice_number"]; $r["customerRefId"] = $r["customer_ref_id"]; $r["customerId"] = $r["customer_id"]; $r["customerName"] = $r["customer_name"]; $r["vehicleInfo"] = $r["vehicle_info"];
        $r["total"] = (float)$r["total"]; $r["payment"] = (float)$r["payment"]; $r["age"] = (int)$r["age"];
        $r["woId"] = $r["wo_id"]; $r["woNumber"] = $r["wo_number"]; $r["branchId"] = $r["branch_id"];
    }
    $data["invoices"] = $rows;

    $rows = $pdo->query("SELECT * FROM goods_receipts ORDER BY date DESC")->fetchAll();
    $allItems = $pdo->query("SELECT * FROM goods_receipt_items")->fetchAll();
    $itemsByReceipt = [];
    foreach ($allItems as $i) {
        $itemsByReceipt[$i["receipt_id"]][] = ["id" => (string)$i["id"], "itemId" => $i["item_id"], "itemCode" => $i["item_code"], "itemName" => $i["item_name"], "qty" => (int)$i["qty"], "unit" => $i["unit"], "qtyInvoiced" => (int)$i["qty_invoiced"]];
    }
    foreach ($rows as &$r) {
        $r["receiptNumber"] = $r["receipt_number"]; $r["supplierId"] = $r["supplier_id"]; $r["supplierName"] = $r["supplier_name"]; $r["doNumber"] = $r["do_number"];
        $r["branchId"] = $r["branch_id"]; $r["receivedBy"] = $r["received_by"]; $r["createdAt"] = $r["created_at"];
        $r["items"] = $itemsByReceipt[$r["id"]] ?? [];
    }
    $data["goodsReceipts"] = $rows;

    $rows = $pdo->query("SELECT * FROM purchase_invoices ORDER BY date DESC")->fetchAll();
    $allPIItems = $pdo->query("SELECT * FROM purchase_invoice_items")->fetchAll();
    $allPayments = $pdo->query("SELECT * FROM purchase_payments")->fetchAll();
    $piItemsById = []; $paymentsById = [];
    foreach ($allPIItems as $i) {
        $piItemsById[$i["invoice_id"]][] = ["id" => (string)$i["id"], "receiptId" => $i["receipt_id"], "receiptNumber" => $i["receipt_number"], "itemId" => $i["item_id"], "itemCode" => $i["item_code"], "itemName" => $i["item_name"], "qty" => (int)$i["qty"], "unit" => $i["unit"], "unitPrice" => (float)$i["unit_price"], "discount" => (float)$i["discount"], "subtotal" => (float)$i["subtotal"]];
    }
    foreach ($allPayments as $p) {
        $paymentsById[$p["invoice_id"]][] = ["id" => $p["id"], "paymentNumber" => $p["payment_number"], "date" => $p["date"], "amount" => (float)$p["amount"], "paymentMethod" => $p["payment_method"], "bankAccount" => $p["bank_account"], "notes" => $p["notes"]];
    }
    foreach ($rows as &$r) {
        $r["invoiceNumber"] = $r["invoice_number"]; $r["dueDate"] = $r["due_date"]; $r["supplierId"] = $r["supplier_id"]; $r["supplierName"] = $r["supplier_name"]; $r["supplierInvoiceNumber"] = $r["supplier_invoice_number"];
        $r["subtotal"] = (float)$r["subtotal"]; $r["discount"] = (float)$r["discount"]; $r["tax"] = (float)$r["tax"]; $r["total"] = (float)$r["total"]; $r["paidAmount"] = (float)$r["paid_amount"];
        $r["branchId"] = $r["branch_id"]; $r["createdAt"] = $r["created_at"];
        $r["items"] = $piItemsById[$r["id"]] ?? [];
        $r["payments"] = $paymentsById[$r["id"]] ?? [];
        $r["receiptIds"] = array_values(array_unique(array_map(function($x) { return $x["receiptId"]; }, $r["items"])));
    }
    $data["purchaseInvoices"] = $rows;

    respondSuccess($data, "All data loaded");
} catch (Exception $e) { respondError("Failed", 500, $e->getMessage()); }
';

    return $files;
}
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Dokter AC Mobil - API Installer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: linear-gradient(135deg, #1e40af, #1e3a8a); min-height: 100vh; padding: 40px 20px; }
    .container { max-width: 640px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
    .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 32px; text-align: center; }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .content { padding: 32px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-weight: 600; color: #374151; margin-bottom: 6px; font-size: 14px; }
    input[type=text], input[type=password] { width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
    input:focus { outline: none; border-color: #2563eb; }
    .btn { width: 100%; padding: 14px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #1d4ed8; }
    .alert { padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #34d399; }
    .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
    .alert-info { background: #dbeafe; color: #1e40af; border: 1px solid #60a5fa; }
    .logs { background: #1f2937; color: #10b981; padding: 16px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; max-height: 300px; overflow-y: auto; margin-top: 16px; }
    .logs .log-item { margin-bottom: 4px; }
    .step { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px; margin-bottom: 8px; font-size: 14px; }
    .step-num { width: 24px; height: 24px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; flex-shrink: 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
    .warning { background: #fef3c7; color: #92400e; padding: 12px 16px; border-radius: 8px; border: 1px solid #fbbf24; margin-top: 20px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 API Installer</h1>
      <p>Dokter AC Mobil - Backend Setup</p>
    </div>
    <div class="content">
      <?php if ($installed): ?>
        <div class="alert alert-success">
          <strong>✅ Instalasi Berhasil!</strong><br>
          Semua file backend PHP sudah dibuat di folder <code>api/</code>.
        </div>
        <div class="logs">
          <?php foreach ($logs as $log): ?>
            <div class="log-item"><?= htmlspecialchars($log) ?></div>
          <?php endforeach; ?>
        </div>
        <div class="alert alert-info" style="margin-top: 20px;">
          <strong>📋 Langkah Selanjutnya:</strong>
          <div class="step" style="margin-top: 12px;"><span class="step-num">1</span> Test API di: <a href="api/info" target="_blank"><strong>https://<?= $_SERVER['HTTP_HOST'] ?>/api/info</strong></a></div>
          <div class="step"><span class="step-num">2</span> Upload file <strong>index.html</strong> dan <strong>.htaccess</strong> ke public_html/</div>
          <div class="step"><span class="step-num">3</span> Buka aplikasi di: <a href="/">https://<?= $_SERVER['HTTP_HOST'] ?></a></div>
          <div class="step"><span class="step-num">4</span> Login: <strong>admin</strong> / <strong>admin123</strong></div>
        </div>
        <div class="warning">
          ⚠️ <strong>PENTING:</strong> Hapus file <code>api-installer.php</code> ini setelah selesai untuk keamanan!
        </div>
      <?php else: ?>
        <?php if (!empty($errors)): ?>
          <div class="alert alert-error">
            <strong>❌ Ada Error:</strong>
            <ul style="margin: 8px 0 0 20px;">
              <?php foreach ($errors as $err): ?>
                <li><?= htmlspecialchars($err) ?></li>
              <?php endforeach; ?>
            </ul>
          </div>
        <?php endif; ?>
        <?php if (!empty($logs)): ?>
          <div class="logs">
            <?php foreach ($logs as $log): ?>
              <div class="log-item"><?= htmlspecialchars($log) ?></div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>

        <div class="alert alert-info">
          <strong>📝 Prasyarat:</strong> Database MySQL sudah dibuat dan tabel sudah di-import via phpMyAdmin.
        </div>

        <form method="POST">
          <div class="form-group">
            <label>Database Host</label>
            <input type="text" name="db_host" value="<?= htmlspecialchars($_POST['db_host'] ?? 'localhost') ?>" required>
          </div>
          <div class="form-group">
            <label>Database Name * <span style="color:#6b7280; font-weight:400;">(contoh: hokimoro_dokterac)</span></label>
            <input type="text" name="db_name" value="<?= htmlspecialchars($_POST['db_name'] ?? '') ?>" placeholder="hokimoro_dokterac" required>
          </div>
          <div class="form-group">
            <label>Database Username * <span style="color:#6b7280; font-weight:400;">(contoh: hokimoro_admindrac)</span></label>
            <input type="text" name="db_user" value="<?= htmlspecialchars($_POST['db_user'] ?? '') ?>" placeholder="hokimoro_admindrac" required>
          </div>
          <div class="form-group">
            <label>Database Password *</label>
            <input type="password" name="db_pass" value="<?= htmlspecialchars($_POST['db_pass'] ?? '') ?>" placeholder="password DB Anda" required>
          </div>
          <button type="submit" class="btn">🚀 Install Backend API Sekarang</button>
        </form>
      <?php endif; ?>
    </div>
    <div class="footer">
      Dokter AC Mobil v1.0 - Auto Installer
    </div>
  </div>
</body>
</html>
