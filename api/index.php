<?php
// ==========================================================
// DOKTER AC MOBIL - Main API Router
// ==========================================================
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

// ==========================================================
// ROUTING
// ==========================================================
try {
    switch ($resource) {
        // ----- AUTH -----
        case 'login':
            require 'endpoints/auth.php';
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
        case 'warehouses':
            require 'endpoints/warehouses.php';
            break;
        case 'stock-movements':
            require 'endpoints/stock-movements.php';
            break;

        // ----- CUSTOMERS -----
        case 'customers':
            require 'endpoints/customers.php';
            break;

        // ----- VEHICLES -----
        case 'vehicles':
            require 'endpoints/vehicles.php';
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

        // ----- WORK ORDERS -----
        case 'work-orders':
            require 'endpoints/work-orders.php';
            break;

        // ----- SALES INVOICES -----
        case 'sales-invoices':
            require 'endpoints/sales-invoices.php';
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
