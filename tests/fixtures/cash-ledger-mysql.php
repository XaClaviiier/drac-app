<?php
// Opt-in disposable MySQL only. Never loads api/config.php or application credentials.
$port=(int)getenv('DRAC_CASH_TEST_MYSQL_PORT');
if($port<1024||$port===3306)throw new RuntimeException('Use an isolated MySQL port via DRAC_CASH_TEST_MYSQL_PORT');
$db=$argv[1]??'';
if(!preg_match('/^drac_cash_test_[a-z0-9_]+$/D',$db))throw new RuntimeException('Unsafe test database name');
$input=json_decode($argv[2]??'{}',true,512,JSON_THROW_ON_ERROR);
$options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false];
$dsn='mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4';
$admin=new PDO($dsn,'root','',$options);
if(($input['op']??'')==='drop'){$admin->exec("DROP DATABASE IF EXISTS `$db`");echo '{}';exit;}
if(($input['op']??'')==='init')$admin->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo=new PDO($dsn.';dbname='.$db,'root','',$options);
$pdo->exec("SET time_zone='+08:00'");date_default_timezone_set('Asia/Makassar');
require __DIR__.'/../../api/helpers.php';
function generateId(){return bin2hex(random_bytes(12));}
function getInput(){global $input;return $input['payload']??[];}
function respondSuccess($data=null,$message=''){echo json_encode(['success'=>true,'data'=>$data,'message'=>$message],JSON_THROW_ON_ERROR);exit;}
function respondError($message,$status=400,$error=null){echo json_encode(['success'=>false,'message'=>$message,'status'=>$status,'error'=>$error],JSON_THROW_ON_ERROR);exit;}
if(($input['op']??'')==='init'){
    $tables=[
      'branches'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40),name VARCHAR(120),is_active TINYINT DEFAULT 1',
      'users'=>'id VARCHAR(64) PRIMARY KEY,username VARCHAR(60),name VARCHAR(100),role_id VARCHAR(64),branch_id VARCHAR(64),is_owner TINYINT,is_active TINYINT',
      'roles'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40),name VARCHAR(100),permissions TEXT,is_active TINYINT DEFAULT 1',
      'api_sessions'=>'token_hash VARCHAR(64),user_id VARCHAR(64),expires_at DATETIME,revoked_at DATETIME,last_activity DATETIME',
      'user_branch_access'=>'user_id VARCHAR(64),branch_id VARCHAR(64)',
      'chart_of_accounts'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40) UNIQUE,name VARCHAR(120),account_type VARCHAR(30),detail_type VARCHAR(60),normal_balance VARCHAR(10),parent_id VARCHAR(64),is_active TINYINT DEFAULT 1,notes TEXT,revision INT DEFAULT 0',
      'cash_accounts'=>'id VARCHAR(64) PRIMARY KEY,code VARCHAR(40) UNIQUE,name VARCHAR(120),account_type VARCHAR(20),branch_id VARCHAR(64),ledger_account_id VARCHAR(64),bank_name VARCHAR(100),account_number VARCHAR(60),account_holder VARCHAR(120),is_active TINYINT DEFAULT 1',
      'branch_account_settings'=>'branch_id VARCHAR(64) PRIMARY KEY,cash_account_id VARCHAR(64),bank_account_id VARCHAR(64),qris_account_id VARCHAR(64),deposit_destination_account_id VARCHAR(64),receivable_coa_id VARCHAR(64),service_revenue_coa_id VARCHAR(64),goods_revenue_coa_id VARCHAR(64),inventory_coa_id VARCHAR(64)',
      'app_settings'=>'id INT PRIMARY KEY,settings_json TEXT',
      'purchase_invoices'=>'id VARCHAR(64) PRIMARY KEY,invoice_number VARCHAR(60),total DECIMAL(18,2),paid_amount DECIMAL(18,2) DEFAULT 0,branch_id VARCHAR(64),status VARCHAR(30),supplier_id VARCHAR(64)',
      'purchase_payments'=>'id VARCHAR(64) PRIMARY KEY,payment_number VARCHAR(60),invoice_id VARCHAR(64),date DATE,amount DECIMAL(18,2),payment_method VARCHAR(30),account_id VARCHAR(64),bank_account VARCHAR(64),notes TEXT,branch_id VARCHAR(64)',
      'sales_invoices'=>'id VARCHAR(64) PRIMARY KEY,invoice_number VARCHAR(60),date DATE,total DECIMAL(18,2),payment DECIMAL(18,2) DEFAULT 0,payment_date DATE,payment_method VARCHAR(30),status VARCHAR(30),branch_id VARCHAR(64),customer_id VARCHAR(64),wo_id VARCHAR(64)',
      'customer_payments'=>'id VARCHAR(64) PRIMARY KEY,payment_number VARCHAR(40) UNIQUE,invoice_id VARCHAR(64),date DATE,amount DECIMAL(18,2),payment_method VARCHAR(30),account_id VARCHAR(64),account_name VARCHAR(120),notes TEXT,branch_id VARCHAR(64),created_by VARCHAR(64),created_by_name VARCHAR(120),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'work_orders'=>'id VARCHAR(64) PRIMARY KEY,invoice_id VARCHAR(64),status VARCHAR(30)',
      'goods_receipts'=>'id VARCHAR(64) PRIMARY KEY,source_type VARCHAR(30),shipping_cost DECIMAL(15,0)',
      'branch_deposits'=>"id VARCHAR(64) PRIMARY KEY,deposit_number VARCHAR(40),date DATE,branch_id VARCHAR(64),source_account_id VARCHAR(64),destination_account_id VARCHAR(64),amount DECIMAL(18,2),status VARCHAR(30),notes TEXT,proof_url TEXT,created_by VARCHAR(64),created_by_name VARCHAR(120),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,verified_by VARCHAR(64),verified_by_name VARCHAR(120),verified_at DATETIME",
      'journal_entries'=>"id VARCHAR(64) PRIMARY KEY,entry_date DATE,entry_number VARCHAR(60) UNIQUE,description VARCHAR(500),branch_id VARCHAR(64),source_type VARCHAR(40),source_id VARCHAR(64),party_type VARCHAR(20),party_id VARCHAR(64),posted TINYINT DEFAULT 1,status VARCHAR(20) DEFAULT 'Posted',created_by VARCHAR(64),posted_by VARCHAR(64),posted_at DATETIME,reversal_of_id VARCHAR(64),void_reason VARCHAR(500)",
      'journal_lines'=>'id VARCHAR(64) PRIMARY KEY,journal_id VARCHAR(64),account_id VARCHAR(64),debit DECIMAL(18,2),credit DECIMAL(18,2),memo VARCHAR(500),INDEX idx_account(account_id),INDEX idx_journal(journal_id)',
      'journal_postings'=>"id VARCHAR(64) PRIMARY KEY,journal_id VARCHAR(64),source_type VARCHAR(40),source_id VARCHAR(64),posting_key VARCHAR(60),status VARCHAR(20),UNIQUE KEY uq_posting(source_type,source_id,posting_key)",
      'cash_ledger_repair_audit'=>"id BIGINT AUTO_INCREMENT PRIMARY KEY,journal_id VARCHAR(64),repair_key VARCHAR(100),snapshot_json LONGTEXT,UNIQUE KEY uq_repair(journal_id,repair_key)",
    ];
    foreach($tables as $table=>$definition)$pdo->exec("CREATE TABLE `$table` ($definition) ENGINE=InnoDB");
    $pdo->exec("INSERT INTO branches(id,code,name) VALUES('B1','B1','Cabang Satu'),('B2','B2','Cabang Dua');INSERT INTO users VALUES('owner','owner','Owner',NULL,'B1',1,1);INSERT INTO user_branch_access VALUES('staff','B1');");
    $pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))')->execute([hash('sha256','cash-test-session'),'owner']);
    $insert=$pdo->prepare('INSERT INTO chart_of_accounts(id,code,name,account_type,detail_type,normal_balance) VALUES(?,?,?,?,?,?)');
    foreach([['LC','1101','Kas','Asset','Kas & Bank','Debit'],['LB','1102','Bank','Asset','Kas & Bank','Debit'],['LC2','1103','Kas Cabang Dua','Asset','Kas & Bank','Debit'],['FREE','1104','Kas Baru','Asset','Kas & Bank','Debit'],['AR','110301','Piutang','Asset','Piutang Usaha','Debit'],['AP','210101','Utang','Liability','Utang Usaha','Credit'],['EXP','6001','Beban','Expense','Beban','Debit'],['EQ','3001','Modal','Equity','Modal','Credit']] as $row)$insert->execute($row);
    $pdo->exec("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id) VALUES('CASH','CASH','Kas Cabang Satu','cash','B1','LC'),('BANK','BANK','Bank Pusat','bank',NULL,'LB'),('CASH2','CASH2','Kas Cabang Dua','cash','B2','LC2');INSERT INTO branch_account_settings(branch_id,cash_account_id,bank_account_id,deposit_destination_account_id,receivable_coa_id) VALUES('B1','CASH','BANK','BANK','AR');INSERT INTO purchase_invoices(id,invoice_number,total,branch_id,supplier_id) VALUES('PI','PI-001',1000,'B1','SUP');");
    $pdo->prepare("INSERT INTO sales_invoices(id,invoice_number,date,total,branch_id,customer_id) VALUES('SI','SI-001',?,1000,'B1','CUSTOMER')")->execute([date('Y-m-d')]);
    respondSuccess(['today'=>date('Y-m-d')]);
}
$_SERVER['HTTP_AUTHORIZATION']='Bearer cash-test-session';
$requestUser=($input['restricted']??false)?['id'=>'staff','is_owner'=>0,'branch_id'=>'B1']:['id'=>'owner','is_owner'=>1,'name'=>'Owner'];
$method=$input['method']??'GET';$id=$input['id']??null;$action=$input['action']??null;$_GET=$input['query']??[];
if(($input['op']??'')==='sql'){$stmt=$pdo->prepare($input['sql']);$stmt->execute($input['params']??[]);respondSuccess($stmt->columnCount()?$stmt->fetchAll():[]);}
if(($input['op']??'')==='journal'){
    $d=$input['payload'];$jid=$d['id']??generateId();
    $pdo->prepare('INSERT INTO journal_entries(id,entry_date,entry_number,description,branch_id,source_type,source_id,posted,status) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$jid,$d['date']??date('Y-m-d'),$jid,$d['description']??'Test',$d['branchId']??'B1',$d['sourceType']??'manual',$d['sourceId']??null,$d['posted']??1,$d['status']??'Posted']);
    foreach($d['lines'] as $line)$pdo->prepare('INSERT INTO journal_lines(id,journal_id,account_id,debit,credit,memo) VALUES(?,?,?,?,?,?)')->execute([generateId(),$jid,$line[0],$line[1],$line[2],$line[3]??'Test']);
    if(isset($d['sourceId']))$pdo->prepare("INSERT INTO journal_postings VALUES(?,?,?,?,?,'Posted')")->execute([generateId(),$jid,$d['sourceType'],$d['sourceId'],$d['postingKey']??'PAYMENT']);
    respondSuccess(['id'=>$jid]);
}
if(($input['op']??'')==='repair'){$pdo->beginTransaction();try{$count=repairSupplierPaymentJournals($pdo);if(!empty($input['rollback']))$pdo->rollBack();else $pdo->commit();respondSuccess(['repaired'=>$count]);}catch(Throwable $e){$pdo->rollBack();throw $e;}}
if(($input['op']??'')==='summary')respondSuccess(branchCashSummary($pdo,$requestUser));
if(($input['op']??'')==='cash_details_bootstrap'){ensureCashAccountDetails($pdo);respondSuccess();}
$endpoint=$input['endpoint']??'';
if(!in_array($endpoint,['chart-of-accounts','cash-accounts','cash-bank-report','purchase-invoices','customer-payments','branch-deposits','general-ledger','opening-balances'],true))throw new RuntimeException('Unknown fixture endpoint');
require __DIR__.'/../../api/endpoints/'.$endpoint.'.php';
