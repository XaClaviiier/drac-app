<?php
// Disposable localhost database only; never loads application configuration.
$port = (int)getenv('DRAC_USAGE_TEST_MYSQL_PORT');
if ($port < 1024 || $port === 3306) throw new RuntimeException('Set an isolated DRAC_USAGE_TEST_MYSQL_PORT');
$db = $argv[1] ?? '';
if (!preg_match('/^drac_usage_test_[a-z0-9_]+$/D',$db)) throw new RuntimeException('Unsafe test database');
$input = json_decode($argv[2] ?? '{}',true,512,JSON_THROW_ON_ERROR);
$options = [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false];
$dsn = 'mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4';
$admin = new PDO($dsn,'root','',$options);
if (($input['op'] ?? '') === 'drop') { $admin->exec("DROP DATABASE IF EXISTS `$db`"); echo '{}'; exit; }
if (($input['op'] ?? '') === 'init') $admin->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo = new PDO($dsn.';dbname='.$db,'root','',$options);
$pdo->exec("SET time_zone='+08:00'"); date_default_timezone_set('Asia/Makassar');
require_once __DIR__.'/../../api/helpers.php';
require_once __DIR__.'/../../api/item-usage.php';
require_once __DIR__.'/inventory-revaluation-schema.php';
function generateId() { return bin2hex(random_bytes(12)); }
function getInput() { global $input; return $input['payload'] ?? []; }
function respondSuccess($data=null,$message='') { echo json_encode(['success'=>true,'data'=>$data,'message'=>$message],JSON_THROW_ON_ERROR); exit; }
function respondError($message,$status=400,$error=null) { http_response_code($status); echo json_encode(['success'=>false,'message'=>$message,'status'=>$status,'error'=>$error],JSON_THROW_ON_ERROR); exit; }
if (($input['op'] ?? '') === 'init') {
    $tables = [
        'branches'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40),name VARCHAR(120),is_active TINYINT DEFAULT 1',
        'warehouses'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40),name VARCHAR(120),branch_id VARCHAR(64),is_active TINYINT DEFAULT 1,is_system TINYINT DEFAULT 0,is_default TINYINT DEFAULT 1,is_sellable TINYINT DEFAULT 1',
        'items'=>"id VARCHAR(64) PRIMARY KEY,code VARCHAR(100),name VARCHAR(255),unit VARCHAR(30),category_name VARCHAR(100),type VARCHAR(40) DEFAULT 'Persediaan',is_active TINYINT DEFAULT 1,purchase_price DECIMAL(18,4) DEFAULT 0,branch_id VARCHAR(64),stock INT DEFAULT 0,sellable_stock INT DEFAULT 0",
        'warehouse_stocks'=>'warehouse_id VARCHAR(64),item_id VARCHAR(64),quantity INT DEFAULT 0,reserved_quantity INT DEFAULT 0,stock_version BIGINT DEFAULT 0,PRIMARY KEY(warehouse_id,item_id)',
        'branch_item_stocks'=>'branch_id VARCHAR(64),item_id VARCHAR(64),stock INT,sellable_stock INT,PRIMARY KEY(branch_id,item_id)',
        'stock_movements'=>"id VARCHAR(64) PRIMARY KEY,movement_sequence BIGINT UNSIGNED AUTO_INCREMENT UNIQUE,item_id VARCHAR(64),source_warehouse_id VARCHAR(64),destination_warehouse_id VARCHAR(64),quantity INT,unit_cost DECIMAL(18,4),movement_type VARCHAR(30),reference_type VARCHAR(40),reference_id VARCHAR(64),reference_number VARCHAR(60),reversal_of_id VARCHAR(64),correction_group_id VARCHAR(64),idempotency_key VARCHAR(180) UNIQUE,notes TEXT,occurred_at DATETIME,created_by VARCHAR(64),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,is_voided TINYINT DEFAULT 0",
        'inventory_operation_locks'=>'lock_key VARCHAR(64) PRIMARY KEY',
        'users'=>'id VARCHAR(64) PRIMARY KEY,username VARCHAR(60),name VARCHAR(120),role_id VARCHAR(64),branch_id VARCHAR(64),is_owner TINYINT DEFAULT 0,is_active TINYINT DEFAULT 1',
        'roles'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40),name VARCHAR(100),permissions TEXT,is_active TINYINT DEFAULT 1',
        'user_branch_access'=>'user_id VARCHAR(64),branch_id VARCHAR(64)',
        'api_sessions'=>'token_hash VARCHAR(64),user_id VARCHAR(64),expires_at DATETIME,revoked_at DATETIME,last_activity DATETIME',
        'user_login_rules'=>'user_id VARCHAR(64),idle_timeout_minutes INT',
        'chart_of_accounts'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40) UNIQUE,name VARCHAR(120),account_type VARCHAR(30),detail_type VARCHAR(60),normal_balance VARCHAR(10),parent_id VARCHAR(64),is_active TINYINT DEFAULT 1',
        'app_settings'=>'id INT PRIMARY KEY,settings_json TEXT',
        'branch_account_settings'=>'branch_id VARCHAR(64) PRIMARY KEY,receivable_coa_id VARCHAR(64),service_revenue_coa_id VARCHAR(64),goods_revenue_coa_id VARCHAR(64),inventory_coa_id VARCHAR(64),inventory_usage_coa_id VARCHAR(64)',
        'journal_entries'=>"id VARCHAR(64) PRIMARY KEY,entry_date DATE,entry_number VARCHAR(60) UNIQUE,description VARCHAR(500),branch_id VARCHAR(64),source_type VARCHAR(40),source_id VARCHAR(64),party_type VARCHAR(20),party_id VARCHAR(64),posted TINYINT DEFAULT 1,status VARCHAR(20) DEFAULT 'Posted',created_by VARCHAR(64),posted_by VARCHAR(64),posted_at DATETIME,reversal_of_id VARCHAR(64),void_reason VARCHAR(500)",
        'journal_lines'=>'id VARCHAR(64) PRIMARY KEY,journal_id VARCHAR(64),account_id VARCHAR(64),debit DECIMAL(18,2),credit DECIMAL(18,2),memo VARCHAR(500)',
        'journal_postings'=>'id VARCHAR(64) PRIMARY KEY,journal_id VARCHAR(64),source_type VARCHAR(40),source_id VARCHAR(64),posting_key VARCHAR(60),status VARCHAR(20),UNIQUE KEY uq_posting(source_type,source_id,posting_key)',
        'transaction_activity_logs'=>'id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,entity_type VARCHAR(40),entity_id VARCHAR(64),entity_number VARCHAR(80),action_type VARCHAR(20),reason VARCHAR(255),snapshot_json LONGTEXT,user_id VARCHAR(20),user_name VARCHAR(150),created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        'sales_invoices'=>'id VARCHAR(64) PRIMARY KEY,invoice_number VARCHAR(60)',
        'customer_payments'=>'id VARCHAR(64) PRIMARY KEY,payment_number VARCHAR(60)',
        'purchase_invoices'=>'id VARCHAR(64) PRIMARY KEY,invoice_number VARCHAR(60)',
        'purchase_payments'=>'id VARCHAR(64) PRIMARY KEY,payment_number VARCHAR(60)',
        'customers'=>'id VARCHAR(64) PRIMARY KEY,name VARCHAR(120)',
        'suppliers'=>'id VARCHAR(64) PRIMARY KEY,name VARCHAR(120)',
    ];
    foreach ($tables as $table=>$definition) $pdo->exec("CREATE TABLE `$table` ($definition) ENGINE=InnoDB");
    ensureItemUsageSchema($pdo);
    ensureRevaluationTestTables($pdo);
    $pdo->exec("INSERT INTO inventory_operation_locks VALUES('global');
        INSERT INTO branches VALUES('B1','C','CAKALANG',1),('B2','D','PERINTIS',1),('0','Z','Cabang Nol',1);
        INSERT INTO warehouses(id,code,name,branch_id) VALUES('W1','CK','GUDANG CAKALANG','B1'),('W2','PR','GUDANG PERINTIS','B2'),('W0','Z','GUDANG NOL','0');
        INSERT INTO users(id,username,name,role_id,branch_id,is_owner) VALUES('owner','preview','Owner Preview','ADMIN','B1',1),('staff','staff','Petugas Cakalang','STAFF','B1',0),('zero','zero','Petugas Nol','STAFF','0',0);
        INSERT INTO user_branch_access VALUES('staff','B1'),('zero','0');
        INSERT INTO user_login_rules VALUES('staff',0),('zero',0);
        INSERT INTO items(id,code,name,unit,category_name,purchase_price,branch_id,stock,sellable_stock) VALUES('I1','FRE-1401022','FREON IGAS R134A COOL MASTER [FR-1022]','PCS','FREON',150000,'B1',13,13),('I2','CLN-001','CAIRAN PEMBERSIH EVAPORATOR','BOTOL','BAHAN',25000.125,'B1',8,8),('I3','ZERO-001','BAHAN TANPA BIAYA','PCS','BAHAN',0,'B1',5,5);
        INSERT INTO warehouse_stocks(warehouse_id,item_id,quantity) VALUES('W1','I1',13),('W1','I2',8),('W1','I3',5),('W2','I1',9),('W0','I1',4);
        INSERT INTO branch_item_stocks VALUES('B1','I1',13,13),('B1','I2',8,8),('B1','I3',5,5),('B2','I1',9,9),('0','I1',4,4);
        INSERT INTO chart_of_accounts(id,code,name,account_type,parent_id) VALUES('INV','110401','Persediaan Barang','Asset',NULL),('EXP','600020','Beban Operasional Lainnya','Expense',NULL),('EXP2','6000.CK-01','BIAYA OPERASIONAL CAKALANG','Expense',NULL),('PARENT','6000','Beban Umum','Expense',NULL),('CHILD','600001','Beban Detail','Expense','PARENT');");
    $permissions = array_map(static fn($action)=>'item_usage:'.$action,['view','create','edit','post','cancel','delete']);
    $insertRole = $pdo->prepare('INSERT INTO roles(id,code,name,permissions) VALUES(?,?,?,?)');
    $insertRole->execute(['STAFF','STF','Petugas',json_encode($permissions)]);
    $insertRole->execute(['ADMIN','ADM','Administrator','["item:view","item:create","item:edit","item:delete"]']);
    foreach (['owner','staff','zero'] as $userId) $pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at,last_activity) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 DAY),NOW())')->execute([hash('sha256','usage-test-'.$userId),$userId]);
    $pdo->prepare('INSERT INTO app_settings VALUES(1,?)')->execute([json_encode(['defaultAccounts'=>['inventoryCoaId'=>'INV','inventoryUsageCoaId'=>'EXP','inventoryAdjustmentCoaId'=>'EXP']])]);
    foreach ([['W1','B1','I1',13,150000],['W1','B1','I2',8,25000.125],['W1','B1','I3',5,0],['W2','B2','I1',9,170000],['W0','0','I1',4,160000]] as [$warehouse,$branch,$item,$qty,$cost]) {
        recordStockMovement($pdo,$item,null,$warehouse,$qty,'receipt','opening_balance',null,'SALDO-AWAL','Saldo awal pengujian','owner',date('Y-m-d').' 00:00:00',null,null,null,$cost);
    }
    respondSuccess(['today'=>date('Y-m-d')]);
}
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer usage-test-'.($input['user'] ?? 'owner');
$method = $input['method'] ?? 'GET'; $id = $input['id'] ?? null; $_GET = $input['query'] ?? [];
if (($input['op'] ?? '') === 'connect') return;
if (($input['op'] ?? '') === 'hpp-bootstrap') { ensureRevaluationTestTables($pdo); respondSuccess(); }
if (($input['op'] ?? '') === 'hpp-cost') { respondSuccess(estimateInventoryUnitCost($pdo,$input['itemId']??'I1',$input['warehouseId']??'W1',$input['date']??date('Y-m-d'))); }
if (($input['op'] ?? '') === 'sql') { $stmt=$pdo->prepare($input['sql']); $stmt->execute($input['params'] ?? []); respondSuccess($stmt->columnCount() ? $stmt->fetchAll() : []); }
if (($input['op'] ?? '') === 'permissions') { grantInitialItemUsagePermissions($pdo); respondSuccess(); }
if (($input['op'] ?? '') === 'bootstrap') {
    runVersionedApiBootstrap($pdo,'test_item_usage_schema','ensureItemUsageSchema');
    runVersionedApiBootstrap($pdo,'test_item_usage_permissions','grantInitialItemUsagePermissions');
    respondSuccess();
}
if (in_array($input['endpoint'] ?? '', ['journal-entries','stock-movements','stock-adjustments'], true)) {
    $requestUser = requireAuthenticatedUser($pdo);
    require __DIR__.'/../../api/endpoints/'.$input['endpoint'].'.php';
    exit;
}
require __DIR__.'/../../api/endpoints/item-usages.php';
