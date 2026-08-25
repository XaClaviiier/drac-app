<?php
// ==========================================================
// DOKTER AC MOBIL - Database Configuration
// ==========================================================
// GANTI value di bawah dengan info database cPanel Anda!
// ==========================================================

// Kredensial wajib berasal dari environment hosting; jangan simpan secret di Git.
define('DB_HOST', getenv('DRAC_DB_HOST') ?: '');
define('DB_NAME', getenv('DRAC_DB_NAME') ?: '');
define('DB_USER', getenv('DRAC_DB_USER') ?: '');
define('DB_PASS', getenv('DRAC_DB_PASS') ?: '');

// ==========================================================
// CORS - agar frontend bisa akses API
// ==========================================================
date_default_timezone_set('Asia/Makassar');

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://cerdikapp.my.id',
    'https://www.cerdikapp.my.id',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ==========================================================
// Connect to Database
// ==========================================================
try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    // Seluruh audit operasional memakai WITA. Tanpa zona sesi yang sama,
    // CURRENT_TIMESTAMP MySQL dapat terbaca lebih awal daripada status_log PHP.
    $pdo->exec("SET time_zone = '+08:00'");
} catch (PDOException $e) {
    error_log('DRAC database connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed'
    ]);
    exit;
}

// ==========================================================
// Helper Functions
// ==========================================================
function respond($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function respondSuccess($data = null, $message = 'Success') {
    respond(['success' => true, 'message' => $message, 'data' => $data]);
}

function respondError($message = 'Error', $status = 400, $error = null) {
    respond(['success' => false, 'message' => $message, 'error' => $error], $status);
}

function getInput() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function generateId() {
    return uniqid();
}

function nowDate() {
    return date('Y-m-d');
}

function nowDateTime() {
    return date('Y-m-d H:i:s');
}

/**
 * Membuat nomor dokumen secara atomik.
 * Wajib dipanggil di dalam transaction aktif.
 */
function nextDocumentNumber(PDO $pdo, string $type, string $branchId, ?string $date = null): string {
    $date = $date ?: date('Y-m-d');
    $prefix = $type === 'work_order' ? 'WO-' : 'INV-';
    $branchCodes = ['BR-001' => 'D', 'BR-002' => 'C', 'BR-003' => 'M'];
    $digits = 3;

    $settingsTable = $pdo->query("SHOW TABLES LIKE 'app_settings'")->fetch();
    if ($settingsTable) {
        $row = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
        $settings = $row ? json_decode($row['settings_json'], true) : null;
        if (is_array($settings)) {
            $branchCodes = $settings['branchDocumentCodes'] ?? $branchCodes;
            $documents = $settings['documents'] ?? [];
            $prefix = $type === 'work_order'
                ? ($documents['workOrderPrefix'] ?? $prefix)
                : ($documents['invoicePrefix'] ?? $prefix);
            $digits = max(3, min(6, (int)($documents['sequenceDigits'] ?? 3)));
        }
    }

    $sequenceDate = $type === 'sales_invoice' ? date('Y-01-01', strtotime($date)) : $date;
    $increment = $pdo->prepare("
        INSERT INTO document_sequences (document_type, branch_id, sequence_date, last_sequence)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1
    ");
    $increment->execute([$type, $branchId, $sequenceDate]);

    $select = $pdo->prepare("
        SELECT last_sequence FROM document_sequences
        WHERE document_type = ? AND branch_id = ? AND sequence_date = ?
    ");
    $select->execute([$type, $branchId, $sequenceDate]);
    $sequence = (int)$select->fetchColumn();

    $dateCode = date('ymd', strtotime($date));
    $branchCode = strtoupper($branchCodes[$branchId] ?? 'X');
    if ($type === 'sales_invoice') {
        $branchNumbers = ['BR-001' => '3', 'BR-002' => '2', 'BR-003' => '1'];
        return $branchCode . date('y', strtotime($date)) . ($branchNumbers[$branchId] ?? '0')
            . str_pad((string)$sequence, 3, '0', STR_PAD_LEFT);
    }
    return $prefix . $branchCode . $dateCode . str_pad((string)$sequence, $digits, '0', STR_PAD_LEFT);
}

/**
 * Mengubah stok item pada satu cabang dan menjaga kolom legacy tetap sinkron.
 */
function adjustBranchStock(PDO $pdo, string $branchId, string $itemId, int $delta): void {
    $itemStmt = $pdo->prepare("SELECT type FROM items WHERE id = ?");
    $itemStmt->execute([$itemId]);
    $item = $itemStmt->fetch();
    if (!$item || $item['type'] !== 'Persediaan') return;

    $currentStmt = $pdo->prepare("
        SELECT stock, sellable_stock FROM branch_item_stocks
        WHERE branch_id = ? AND item_id = ?
        FOR UPDATE
    ");
    $currentStmt->execute([$branchId, $itemId]);
    $current = $currentStmt->fetch();

    if ($delta < 0) {
        if (!$current || (int)$current['stock'] + $delta < 0 || (int)$current['sellable_stock'] + $delta < 0) {
            throw new Exception("Stok item {$itemId} di cabang {$branchId} tidak mencukupi");
        }
    }

    $stmt = $pdo->prepare("
        INSERT INTO branch_item_stocks (branch_id, item_id, stock, sellable_stock)
        VALUES (?, ?, GREATEST(0, ?), GREATEST(0, ?))
        ON DUPLICATE KEY UPDATE
            stock = GREATEST(0, stock + VALUES(stock)),
            sellable_stock = GREATEST(0, sellable_stock + VALUES(sellable_stock))
    ");

    if ($delta >= 0) {
        $stmt->execute([$branchId, $itemId, $delta, $delta]);
    } else {
        $decrement = $pdo->prepare("
            UPDATE branch_item_stocks
            SET stock = GREATEST(0, stock + ?),
                sellable_stock = GREATEST(0, sellable_stock + ?)
            WHERE branch_id = ? AND item_id = ?
        ");
        $decrement->execute([$delta, $delta, $branchId, $itemId]);
    }

    $sync = $pdo->prepare("
        UPDATE items i
        JOIN branch_item_stocks s ON s.item_id = i.id AND s.branch_id = i.branch_id
        SET i.stock = s.stock, i.sellable_stock = s.sellable_stock
        WHERE i.id = ? AND i.branch_id = ?
    ");
    $sync->execute([$itemId, $branchId]);
}
