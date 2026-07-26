<?php
// ==========================================================
// DOKTER AC MOBIL - Database Configuration
// ==========================================================
// GANTI value di bawah dengan info database cPanel Anda!
// ==========================================================

define('DB_HOST', 'localhost');
define('DB_NAME', 'GANTI_NAMA_DATABASE');      // contoh: bengkel_dokterac
define('DB_USER', 'GANTI_USER_DATABASE');       // contoh: bengkel_admin
define('DB_PASS', 'GANTI_PASSWORD_DATABASE');   // password DB Anda

// ==========================================================
// CORS - agar frontend bisa akses API
// ==========================================================
header("Access-Control-Allow-Origin: *");
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
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'error' => $e->getMessage()
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
