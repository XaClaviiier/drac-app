<?php
// Persistent isolated SQLite adapter; exercise the production endpoint across requests.
class OpnameDatabase extends PDO {
    function __construct(string $path){parent::__construct('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$this->sqliteCreateFunction('NOW',fn()=>date('Y-m-d H:i:s'));$this->sqliteCreateFunction('CONCAT',fn(...$parts)=>implode('',$parts));}
    function prepare(string $sql,array $options=[]):PDOStatement|false{return parent::prepare(str_replace([' FOR UPDATE',' COLLATE utf8mb4_unicode_ci'],'',$sql),$options);}
    function query(string $sql,?int $fetchMode=null,mixed ...$args):PDOStatement|false{return parent::query(str_replace(' COLLATE utf8mb4_unicode_ci','',$sql));}
}
$fixtureInput=json_decode($argv[2],true,512,JSON_THROW_ON_ERROR);$pdo=new OpnameDatabase($argv[1]);
if(!($pdo->query("SELECT name FROM sqlite_master WHERE name='items'")->fetchColumn())){
    $pdo->exec("CREATE TABLE items(id TEXT PRIMARY KEY,code TEXT,name TEXT,unit TEXT,type TEXT,is_active INTEGER,category_name TEXT,category_id TEXT);
    INSERT INTO items VALUES('I1','BRG-001','Barang satu','PCS','Persediaan',1,'Umum','C1'),('I2','BRG-002','Barang dua','PCS','Persediaan',1,'Umum','C1'),('I3','BRG-003','Barang tiga','PCS','Persediaan',1,'Umum','C1');
    CREATE TABLE sales_invoice_items(item_id TEXT,qty INTEGER);
    CREATE TABLE warehouses(id TEXT PRIMARY KEY,code TEXT,name TEXT,branch_id TEXT,is_active INTEGER,is_system INTEGER);
    INSERT INTO warehouses VALUES('W1','G1','Gudang satu','BR1',1,0),('W2','G2','Gudang lain','BR2',1,0);
    CREATE TABLE branches(id TEXT,name TEXT,is_active INTEGER);INSERT INTO branches VALUES('BR1','Cabang satu',1);
    CREATE TABLE warehouse_stocks(warehouse_id TEXT,item_id TEXT,quantity INTEGER,stock_version INTEGER);INSERT INTO warehouse_stocks VALUES('W1','I1',5,1),('W1','I2',10,1),('W1','I3',5,1);
    CREATE TABLE stock_count_orders(id TEXT PRIMARY KEY,order_number TEXT UNIQUE,order_date TEXT,start_date TEXT,end_date TEXT,warehouse_id TEXT,branch_id TEXT,category_id TEXT,include_zero_unused INTEGER,assigned_user_id TEXT,assigned_user_name TEXT,status TEXT,notes TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,entry_mode TEXT,revision INTEGER);
    CREATE TABLE stock_count_results(id TEXT PRIMARY KEY,result_number TEXT,order_id TEXT,result_date TEXT,status TEXT,adjustment_id TEXT,adjustment_number TEXT,notes TEXT,created_by TEXT,posted_by TEXT,posted_at TEXT);
    CREATE TABLE stock_count_result_items(id INTEGER PRIMARY KEY AUTOINCREMENT,result_id TEXT,item_id TEXT,item_code TEXT,item_name TEXT,category_name TEXT,unit TEXT,system_quantity INTEGER,system_version INTEGER,count_1 INTEGER,count_2 INTEGER,final_quantity INTEGER,variance INTEGER,movement_in INTEGER DEFAULT 0,movement_out INTEGER DEFAULT 0,is_manual INTEGER DEFAULT 0);
    CREATE TABLE stock_adjustments(id TEXT PRIMARY KEY,adjustment_number TEXT,adjustment_type TEXT,adjustment_date TEXT,status TEXT,notes TEXT,created_by TEXT,posted_by TEXT,posted_at TEXT);
    CREATE TABLE stock_adjustment_items(id INTEGER PRIMARY KEY,adjustment_id TEXT,item_id TEXT,warehouse_id TEXT,item_code TEXT,item_name TEXT,unit TEXT,quantity INTEGER,target_quantity INTEGER,stock_before INTEGER);
    CREATE TABLE stock_movements(id TEXT PRIMARY KEY,item_id TEXT,source_warehouse_id TEXT,destination_warehouse_id TEXT,quantity INTEGER,movement_type TEXT,reference_type TEXT,reference_id TEXT,reference_number TEXT,notes TEXT,created_by TEXT,occurred_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,is_voided INTEGER DEFAULT 0,reversal_of_id TEXT);
    CREATE TABLE stock_opname_audit(id INTEGER PRIMARY KEY,order_id TEXT,order_number TEXT,actor_id TEXT,action TEXT,snapshot TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);");
}
function requireAuthenticatedUser(PDO $pdo):array{return ['id'=>'OWNER','name'=>'Pemeriksa','is_owner'=>1];}
function getAccessibleBranchIds(PDO $pdo,array $actor):array{return ['BR1'];}
function getInput():array{global $fixtureInput;return $fixtureInput['payload']??[];}
function lockInventoryMutation(PDO $pdo):void{}
function lockInventoryMutationAuthorization(PDO $pdo,array $actor,string $permission):array{$auth=['actor'=>$actor];assertLockedInventoryPermission($auth,$permission);return $auth;}
function assertLockedInventoryPermission(array $auth,string $permission):void{global $fixtureInput;if(in_array($permission,$fixtureInput['deny']??[],true))throw new DomainException('Izin ditolak',403);}
function lockInventoryWarehousesForAuthorization(PDO $pdo,array $auth,array $ids,string $message,int $code):array{if($ids!==['W1'])throw new DomainException($message,$code);return lockActiveInventoryWarehouses($pdo,$ids);}
function lockActiveInventoryWarehouses(PDO $pdo,array $ids):array{$stmt=$pdo->prepare('SELECT * FROM warehouses WHERE id=?');$stmt->execute([$ids[0]]);$row=$stmt->fetch();if(!$row['is_active'])throw new InvalidArgumentException('Gudang nonaktif');return [$ids[0]=>$row];}
// Parser helper follows the production exact-integer domain; real helper has separate tests.
function parseBoundedDecimalInteger(mixed $value,string $min,string $max,string $label):int{if((!is_int($value)&&!is_string($value))||!preg_match('/^-?\d+$/D',(string)$value)||(float)$value<(float)$min||(float)$value>(float)$max)throw new InvalidArgumentException($label);return (int)$value;}
function normalizeBoundedDecimalInteger(mixed $value,string $min,string $max,string $label):string{return (string)parseBoundedDecimalInteger($value,$min,$max,$label);}
function adjustWarehouseStockAllowNegative(PDO $pdo,string $warehouse,string $branch,string $item,int $delta):void{$pdo->prepare('UPDATE warehouse_stocks SET quantity=quantity+?,stock_version=stock_version+1 WHERE warehouse_id=? AND item_id=?')->execute([$delta,$warehouse,$item]);}
function recordStockMovement(PDO $pdo,string $item,?string $source,?string $dest,int $qty,string $type,string $refType,?string $refId,?string $number,string $notes,?string $actor,?string $date):void{
    global $fixtureInput;if(!empty($fixtureInput['failMovement']))throw new RuntimeException('Simulated movement failure');
    $pdo->prepare('INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,reference_type,reference_id,reference_number,notes,created_by,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute([bin2hex(random_bytes(8)),$item,$source,$dest,$qty,$type,$refType,$refId,$number,$notes,$actor,$date]);
}
function response(bool $success,mixed $data,string $message,int $status):never{
    global $pdo;$tables=[];foreach(['warehouse_stocks','stock_count_orders','stock_count_results','stock_count_result_items','stock_adjustments','stock_adjustment_items','stock_movements','stock_opname_audit'] as $table)$tables[$table]=$pdo->query('SELECT * FROM '.$table)->fetchAll();
    echo json_encode(['success'=>$success,'data'=>$data,'message'=>$message,'status'=>$status,'tables'=>$tables]);exit;
}
function respondSuccess(mixed $data=null,string $message=''):never{response(true,$data,$message,200);}
function respondError(string $message,int $status=400):never{response(false,null,$message,$status);}
if(isset($fixtureInput['bump'])){$pdo->prepare('UPDATE warehouse_stocks SET quantity=quantity+?,stock_version=stock_version+1 WHERE item_id=?')->execute([$fixtureInput['bump']['delta'],$fixtureInput['bump']['itemId']]);respondSuccess();}
if(isset($fixtureInput['seedActivity'])){
    $pdo->exec("UPDATE warehouse_stocks SET quantity=0 WHERE item_id='I3'");
    foreach($fixtureInput['seedActivity'] as $when){
        recordStockMovement($pdo,'I3',null,'W1',2,'adjustment','test','T','T','Activity','OWNER',$when);
        recordStockMovement($pdo,'I3','W1',null,2,'adjustment','test','T','T','Activity','OWNER',$when);
    }
    respondSuccess();
}
$method=$fixtureInput['method']??'POST';$id=$fixtureInput['id']??null;$_GET=$fixtureInput['query']??[];
require __DIR__.'/../../api/endpoints/stock-opnames.php';
