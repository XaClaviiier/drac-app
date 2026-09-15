<?php
// Dedicated disposable MySQL only. Never load api/config.php or application credentials.
$port = getenv('CUSTOMER_IMPORT_TEST_PORT');
if (!$port || !preg_match('/^\d{4,5}$/D', $port) || $port === '3306') throw new RuntimeException('Dedicated CUSTOMER_IMPORT_TEST_PORT required (not 3306).');
$pdo = new PDO('mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
$pdo->exec('CREATE DATABASE IF NOT EXISTS drac_customer_import_test');
$pdo->exec('USE drac_customer_import_test');
require_once __DIR__ . '/../../api/customer-import.php';
require_once __DIR__ . '/../../api/helpers.php';
function generateId() { return bin2hex(random_bytes(8)); }
function respond($data, $status=200) { http_response_code($status); header('Content-Type: application/json'); echo json_encode($data); exit; }
function respondSuccess($data=null, $message='OK') { respond(['success'=>true,'data'=>$data,'message'=>$message]); }
function respondError($message='Error', $status=400, $error=null) { respond(['success'=>false,'message'=>$message,'error'=>$error],$status); }
function getInput() { return json_decode(file_get_contents('php://input'),true) ?: []; }
function setupCustomerImportTest(PDO $pdo) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach (['customers','branches','customer_people','customer_person_roles','customer_import_runs','customer_master_audit_logs','roles','user_branch_access'] as $table) $pdo->exec("DROP TABLE IF EXISTS {$table}");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->exec("CREATE TABLE branches(id VARCHAR(20) PRIMARY KEY, is_active INT NOT NULL DEFAULT 1)");
    $pdo->exec("INSERT INTO branches VALUES ('BR-TEST',1),('0',1),('00',1),('INACTIVE',0)");
    // Match shipped base schema field sizes and constraints.
    $pdo->exec("CREATE TABLE customers(id VARCHAR(20) PRIMARY KEY,customer_code VARCHAR(20) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,phone VARCHAR(30),email VARCHAR(100),address TEXT,branch_id VARCHAR(20) NOT NULL, first_seen_branch_id VARCHAR(20),company_name VARCHAR(150) NOT NULL DEFAULT '',account_type VARCHAR(20) NOT NULL DEFAULT 'Pribadi',primary_contact_id VARCHAR(64),billing_contact_id VARCHAR(64),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(branch_id) REFERENCES branches(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE customer_people(id VARCHAR(64) PRIMARY KEY,customer_id VARCHAR(20),name VARCHAR(150),phone VARCHAR(30),email VARCHAR(150),relationship_label VARCHAR(80),is_active INT)");
    $pdo->exec("CREATE TABLE customer_person_roles(person_id VARCHAR(64),role_code VARCHAR(20),PRIMARY KEY(person_id,role_code))");
    $pdo->exec("CREATE TABLE customer_master_audit_logs(id BIGINT AUTO_INCREMENT PRIMARY KEY,entity_type VARCHAR(30),entity_id VARCHAR(64),action_type VARCHAR(30),before_json LONGTEXT,after_json LONGTEXT,user_id VARCHAR(64),user_name VARCHAR(150))");
    $pdo->exec("CREATE TABLE roles(id VARCHAR(20) PRIMARY KEY, code VARCHAR(20),name VARCHAR(100),is_active INT DEFAULT 1,permissions LONGTEXT)");
    $pdo->exec("INSERT INTO roles(id,code,name,permissions) VALUES('allowed','ADM','Administrator','[\"customer:create\",\"customer:view\"]'),('denied','NO','No access','[]')");
    $pdo->exec("CREATE TABLE user_branch_access(user_id VARCHAR(64),branch_id VARCHAR(20))");
    $pdo->exec("INSERT INTO user_branch_access VALUES('test-user','BR-TEST'),('zero-user','0')");
    ensureCustomerImportSchema($pdo); ensureCustomerImportSchema($pdo);
}

if (PHP_SAPI !== 'cli') {
    // Synthetic actor is limited to this fixture server bound to loopback.
    $actor = $_SERVER['HTTP_X_TEST_ACTOR'] ?? 'allowed';
    if ($actor === 'anonymous') respondError('Unauthenticated',401);
    $requestUser = ['id'=>$actor === 'zero' ? 'zero-user':'test-user','name'=>'Fixture','role_id'=>$actor==='denied'?'denied':'allowed','is_owner'=>0];
    $method = $_SERVER['REQUEST_METHOD']; $id = basename(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if ($id === 'customers' && $method === 'GET') $id = null;
    try { require __DIR__ . '/../../api/endpoints/customers.php'; }
    catch (Throwable $e) { respondError($e->getMessage(),500); }
    exit;
}
$input = json_decode(stream_get_contents(STDIN),true) ?: [];
try {
    switch ($input['action'] ?? '') {
        case 'setup': setupCustomerImportTest($pdo); echo json_encode(['ok'=>true]); break;
        case 'snapshot':
            $out=[]; foreach (['customers','customer_people','customer_person_roles','customer_import_runs','customer_master_audit_logs'] as $table) $out[$table]=$pdo->query("SELECT * FROM {$table}")->fetchAll(); echo json_encode($out); break;
        case 'failure': $pdo->exec("CREATE TRIGGER fail_import BEFORE INSERT ON customer_people FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected persistence failure'"); echo '{}'; break;
        case 'clear-failure': $pdo->exec('DROP TRIGGER fail_import'); echo '{}'; break;
        case 'corrupt': $pdo->exec("UPDATE customers SET categories='[\"CHANGED\"]'"); echo '{}'; break;
        case 'preview':
            $result=customerImportClassify(customerImportValidateRows($input['rows']),$pdo->query('SELECT id,name,phone FROM customers')->fetchAll());
            echo json_encode(['rows'=>$result,'digest'=>customerImportDigest($result,$input['branchId'],$input['source'])]); break;
        case 'execute':
            echo json_encode(customerImportExecute($pdo,customerImportValidateRows($input['rows']),$input['branchId'],$input['source'],$input['runId'],$input['digest'],['id'=>'test-user','name'=>'Fixture'])); break;
        default: throw new RuntimeException('Unknown fixture action');
    }
} catch (Throwable $e) { echo json_encode(['error'=>$e->getMessage()]); }
