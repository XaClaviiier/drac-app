<?php
// ==========================================================
// DOKTER AC MOBIL - Main API Router
// ==========================================================
date_default_timezone_set('Asia/Makassar');
require_once 'config.php';
require_once 'helpers.php';
ensureApiSupportTables($pdo);

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Split route into parts
$parts = explode('/', trim($route, '/'));
$resource = $parts[0] ?? '';
$id = $parts[1] ?? null;
$action = $parts[2] ?? null;

// Login adalah satu-satunya endpoint publik. Semua data bisnis harus melalui
// sesi server yang aktif; pemeriksaan di endpoint tetap dipertahankan sebagai
// lapisan tambahan untuk aturan yang lebih spesifik.
$requestUser = null;
if ($resource !== 'login') {
    $requestUser = requireAuthenticatedUser($pdo);
}

// Master Supplier hanya boleh dikelola Owner atau role Administrator.
// Permission biasa tetap diperiksa setelah pembatasan role ini.
if ($requestUser && $resource === 'suppliers' && empty($requestUser['is_owner'])) {
    $roleStmt = $pdo->prepare('SELECT code,name FROM roles WHERE id=? AND is_active=1 LIMIT 1');
    $roleStmt->execute([$requestUser['role_id'] ?? '']);
    $supplierRole = $roleStmt->fetch();
    $roleCode = strtoupper(trim((string)($supplierRole['code'] ?? '')));
    $roleName = strtolower(trim((string)($supplierRole['name'] ?? '')));
    if ($roleCode !== 'ADM' && $roleName !== 'administrator') {
        respondError('Menu Supplier hanya tersedia untuk Owner dan Administrator', 403);
    }
}

// Hak akses dasar per modul dan metode HTTP. Endpoint dengan alur khusus
// (pembayaran, AI, sesi) melakukan pemeriksaan tambahan di dalam endpoint.
$permissionByResource = [
    'branches' => 'branch', 'roles' => 'role', 'users' => 'user',
    'customers' => 'customer', 'customer-people' => 'customer', 'vehicles' => 'vehicle',
    'suppliers' => 'supplier', 'items' => 'item',
    'item-categories' => 'item', 'item-brands' => 'item', 'warehouses' => 'item', 'stock-movements' => 'item', 'stock-adjustments' => 'item',
    'warehouse-transfers' => 'item', 'stock-count-report' => 'report', 'stock-opnames' => 'item',
    'work-orders' => 'wo', 'sales-invoices' => 'invoice',
    'goods-receipts' => 'receipt', 'purchase-invoices' => 'purchase',
];
if ($requestUser && isset($permissionByResource[$resource])) {
    $operationByMethod = ['GET' => 'view', 'POST' => 'create', 'PUT' => 'edit', 'PATCH' => 'edit', 'DELETE' => 'delete'];
    $operation = $operationByMethod[$method] ?? null;
    if ($operation !== null) {
        $permission = ($resource === 'purchase-invoices' && $action === 'payments')
            ? 'purchase:pay'
            : (($resource === 'customer-people' && $method !== 'GET')
                ? 'customer:edit'
                : $permissionByResource[$resource] . ':' . $operation);
        // Petugas penerimaan boleh membuat master barang sementara. Barang ini
        // tetap Pending sampai diverifikasi Administrator/Owner.
        if ($resource === 'items' && $method === 'POST' && !authenticatedUserHasPermission($pdo, $requestUser, $permission)) {
            $permission = 'receipt:create';
        }
        requireAuthenticatedUserPermission($pdo, $requestUser, $permission);
    }
}

if ($requestUser && $resource === 'settings') {
    requireAuthenticatedUserPermission($pdo, $requestUser, $method === 'GET' ? 'settings:view' : 'settings:edit');
}
if ($requestUser && $resource === 'ai-settings') {
    // Status/model AI diperlukan oleh semua pemakai Asisten AI. API key tetap
    // tidak pernah dikirim dan perubahan konfigurasi hanya untuk pengelola.
    requireAuthenticatedUserPermission($pdo, $requestUser, $method === 'GET' ? 'ai:view' : 'settings:edit');
}
if ($requestUser && $resource === 'ai-chat') {
    requireAuthenticatedUserPermission($pdo, $requestUser, 'ai:view');
}
if ($requestUser && $resource === 'quick-invoices') {
    requireAuthenticatedUserPermission($pdo, $requestUser, 'invoice:create');
}
if ($requestUser && $resource === 'receipt-ai-settings') {
    requireAuthenticatedUserPermission($pdo, $requestUser, $method === 'GET' ? 'invoice:view' : 'settings:edit');
}
if ($requestUser && $resource === 'historical-entries') {
    requireAuthenticatedUserPermission($pdo, $requestUser, 'invoice:create');
}
if ($requestUser && $resource === 'receipt-ocr') {
    requireAuthenticatedUserPermission($pdo, $requestUser, 'invoice:create');
}
if ($requestUser && in_array($resource, ['chart-of-accounts', 'cash-accounts', 'branch-account-settings', 'branch-deposits', 'performance-bonus'], true)) {
    requireAuthenticatedUserPermission($pdo, $requestUser, $method === 'GET' ? 'report:view' : 'settings:edit');
}
if ($requestUser && $resource === 'transaction-backup' && empty($requestUser['is_owner'])) {
    respondError('Backup dan restore transaksi hanya dapat dilakukan Owner', 403);
}

// ==========================================================
// ROUTING
// ==========================================================
try {
    switch ($resource) {
        // ----- AUTH -----
        case 'login':
            require 'endpoints/auth.php';
            break;
        case 'logout':
            require 'endpoints/logout.php';
            break;

        // ----- BRANCHES -----
        case 'branches':
            require 'endpoints/branches.php';
            break;

        // ----- ROLES -----
        case 'roles':
            require 'endpoints/roles.php';
            break;

        // ----- USERS -----
        case 'users':
            require 'endpoints/users.php';
            break;
        case 'user-sessions':
            require 'endpoints/user-sessions.php';
            break;
        case 'warehouses':
            require 'endpoints/warehouses.php';
            break;
        case 'stock-movements':
            require 'endpoints/stock-movements.php';
            break;
        case 'stock-adjustments':
            require 'endpoints/stock-adjustments.php';
            break;
        case 'warehouse-transfers':
            require 'endpoints/warehouse-transfers.php';
            break;
        case 'stock-count-report':
            require 'endpoints/stock-count-report.php';
            break;
        case 'stock-opnames':
            require 'endpoints/stock-opnames.php';
            break;

        // ----- CUSTOMERS -----
        case 'customers':
            require 'endpoints/customers.php';
            break;
        case 'customer-contacts':
            require 'endpoints/customer-contacts.php';
            break;
        case 'customer-people':
            require 'endpoints/customer-people.php';
            break;

        // ----- VEHICLES -----
        case 'vehicles':
            require 'endpoints/vehicles.php';
            break;
        case 'vehicle-catalog':
            require 'endpoints/vehicle-catalog.php';
            break;

        // ----- SUPPLIERS -----
        case 'suppliers':
            require 'endpoints/suppliers.php';
            break;

        // ----- ITEMS -----
        case 'items':
            require 'endpoints/items.php';
            break;

        // ----- ITEM CATEGORIES -----
        case 'item-categories':
            require 'endpoints/item-categories.php';
            break;
        case 'item-brands':
            require 'endpoints/item-brands.php';
            break;

        // ----- WORK ORDERS -----
        case 'work-orders':
            require 'endpoints/work-orders.php';
            break;

        // ----- SALES INVOICES -----
        case 'sales-invoices':
            require 'endpoints/sales-invoices.php';
            break;
        case 'customer-payments':
            require 'endpoints/customer-payments.php';
            break;
        case 'quick-invoices':
            require 'endpoints/quick-invoices.php';
            break;
        case 'historical-entries':
            require 'endpoints/historical-entries.php';
            break;
        case 'receipt-ocr':
            require 'endpoints/receipt-ocr.php';
            break;
        case 'cash-accounts':
            require 'endpoints/cash-accounts.php';
            break;
        case 'branch-deposits':
            require 'endpoints/branch-deposits.php';
            break;
        case 'chart-of-accounts':
            require 'endpoints/chart-of-accounts.php';
            break;
        case 'branch-account-settings':
            require 'endpoints/branch-account-settings.php';
            break;
        case 'performance-bonus':
            require 'endpoints/performance-bonus.php';
            break;
        case 'data-maintenance':
            require 'endpoints/data-maintenance.php';
            break;
        case 'transaction-backup':
            require 'endpoints/transaction-backup.php';
            break;

        // ----- GOODS RECEIPTS -----
        case 'goods-receipts':
            require 'endpoints/goods-receipts.php';
            break;

        // ----- PURCHASE INVOICES -----
        case 'purchase-invoices':
            require 'endpoints/purchase-invoices.php';
            break;

        // ----- ALL DATA (untuk load awal) -----
        case 'all-data':
            require 'endpoints/all-data.php';
            break;

        case 'settings':
            require 'endpoints/settings.php';
            break;

        case 'ai-settings':
            require 'endpoints/ai-settings.php';
            break;

        case 'receipt-ai-settings':
            require 'endpoints/receipt-ai-settings.php';
            break;

        case 'ai-chat':
            require 'endpoints/ai-chat.php';
            break;

        // ----- API INFO -----
        case '':
        case 'info':
            respondSuccess([
                'app' => 'Dokter AC Mobil API',
                'version' => '1.0.0',
                'endpoints' => [
                    'POST /login',
                    'GET /branches',
                    'GET /roles',
                    'GET|POST|PUT|DELETE /users',
                    'GET|POST|PUT|DELETE /customers',
                    'GET|POST|PUT|DELETE /vehicles',
                    'GET|POST|PUT|DELETE /suppliers',
                    'GET|POST|PUT|DELETE /items',
                    'GET|POST|PUT|DELETE /item-categories',
                    'GET|POST|PUT|DELETE /work-orders',
                    'GET|POST|PUT|DELETE /sales-invoices',
                    'GET|POST|PUT|DELETE /goods-receipts',
                    'GET|POST|PUT|DELETE /purchase-invoices',
                    'GET /all-data (load semua data sekaligus)',
                ]
            ]);
            break;

        default:
            respondError('Endpoint not found: ' . $resource, 404);
    }
} catch (Throwable $e) {
    respondError('Server error', 500, $e->getMessage());
}
