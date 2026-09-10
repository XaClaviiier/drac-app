<?php
declare(strict_types=1);
// Exercise the real endpoint with isolated SQLite storage and authorization adapters.
class AdjustmentPersistenceDatabase extends PDO {
 function __construct(){parent::__construct('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$this->sqliteCreateFunction('NOW',fn()=>date('Y-m-d H:i:s'));}
 function prepare(string $query,array $options=[]):PDOStatement|false{return parent::prepare(str_replace(' FOR UPDATE','',$query),$options);}
}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);$pdo=new AdjustmentPersistenceDatabase();
$pdo->exec("CREATE TABLE roles(id TEXT,code TEXT,name TEXT,is_active INTEGER);
CREATE TABLE items(id TEXT,code TEXT,name TEXT,unit TEXT,type TEXT,is_active INTEGER);
INSERT INTO items VALUES('I1','BF-1055','Barang contoh','CAN','Persediaan',1);
CREATE TABLE warehouses(id TEXT,branch_id TEXT,is_active INTEGER,name TEXT);
INSERT INTO warehouses VALUES('W1','BR1',1,'Gudang contoh');
CREATE TABLE warehouse_stocks(warehouse_id TEXT,item_id TEXT,quantity INTEGER);
INSERT INTO warehouse_stocks VALUES('W1','I1',8);
CREATE TABLE stock_count_results(adjustment_id TEXT);
CREATE TABLE stock_adjustments(id TEXT,adjustment_number TEXT,adjustment_type TEXT,adjustment_date TEXT,status TEXT,batch_key TEXT,notes TEXT,created_by TEXT,created_at TEXT,posted_by TEXT,posted_at TEXT);
CREATE TABLE stock_adjustment_items(id INTEGER PRIMARY KEY,adjustment_id TEXT,item_id TEXT,warehouse_id TEXT,item_code TEXT,item_name TEXT,unit TEXT,quantity INTEGER,unit_cost NUMERIC,target_quantity INTEGER,stock_before INTEGER,line_notes TEXT);");
if(isset($input['seed'])){
 $pdo->exec("INSERT INTO stock_adjustments(id,adjustment_number,adjustment_type,adjustment_date,status,notes) VALUES('DOC','ADJ-2609-0001','opening_balance','2026-09-10','Draft','');");
 $row=$input['seed'];
 $pdo->prepare('INSERT INTO stock_adjustment_items(adjustment_id,item_id,warehouse_id,item_code,item_name,unit,quantity,unit_cost,target_quantity,stock_before,line_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute(['DOC','I1','W1','BF-1055','Barang contoh','CAN',$row['quantity']??-8,$row['unitCost']??1200.25,$row['targetQuantity']??0,$row['stockBefore']??8,$row['lineNotes']??'Hitung fisik']);
}
$pdo->prepare('UPDATE warehouse_stocks SET quantity=?')->execute([$input['current']??8]);
function requireAuthenticatedUser(PDO $pdo):array{return ['id'=>'OWNER','is_owner'=>1];}
function getAccessibleBranchIds(PDO $pdo,array $actor):array{return ['BR1'];}
function getInput():array{global $input;return $input['payload']??[];}
function lockInventoryMutation(PDO $pdo):void{}
function lockInventoryMutationAuthorization(PDO $pdo,array $actor,string $permission):array{return ['actor'=>$actor];}
function assertLockedInventoryOwnerOrAdministrator(array $authorization):void{}
function lockActiveInventoryWarehouses(PDO $pdo,array $ids):array{return ['W1'=>['id'=>'W1','branch_id'=>'BR1','is_active'=>1]];}
function lockInventoryWarehousesForAuthorization(PDO $pdo,array $authorization,array $ids,string $message,int $status):array{return lockActiveInventoryWarehouses($pdo,$ids);}
function lockStockOpnameResultForAdjustment(PDO $pdo,string $id):?array{return null;}
function assertLockedInventoryBranchAccess(array $authorization,string $branch):void{if($branch!=='BR1')throw new DomainException('Forbidden',403);}
// The exact integer parser is covered separately by adjustment-values.test.mjs.
function parseBoundedDecimalInteger(mixed $value,string $min,string $max,string $label):int{if((!is_int($value)&&!is_string($value))||!preg_match('/^-?\d+$/',(string)$value)||(float)$value<(float)$min||(float)$value>(float)$max)throw new InvalidArgumentException($label);return (int)$value;}
function transactionExceptionStatus(Throwable $e,int $fallback):int{return $e->getCode()?:$fallback;}
function adjustWarehouseStock(PDO $pdo,string $warehouse,string $branch,string $item,int $delta):void{
 $stmt=$pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?');$stmt->execute([$warehouse,$item]);if((int)$stmt->fetchColumn()+$delta<0)throw new DomainException('Stok kurang',409);
 $pdo->prepare('UPDATE warehouse_stocks SET quantity=quantity+? WHERE warehouse_id=? AND item_id=?')->execute([$delta,$warehouse,$item]);
}
function adjustWarehouseStockAllowNegative(PDO $pdo,string $warehouse,string $branch,string $item,int $delta):void{adjustWarehouseStock($pdo,$warehouse,$branch,$item,$delta);}
function recordStockMovement(...$args):void{}
function result(bool $success,mixed $data,string $message,int $status):never{
 global $pdo;echo json_encode(['success'=>$success,'data'=>$data,'message'=>$message,'status'=>$status,'lines'=>$pdo->query('SELECT * FROM stock_adjustment_items')->fetchAll(),'stock'=>(int)$pdo->query('SELECT quantity FROM warehouse_stocks')->fetchColumn(),'documents'=>$pdo->query('SELECT * FROM stock_adjustments')->fetchAll()]);exit;
}
function respondSuccess(mixed $data=null,string $message=''):never{result(true,$data,$message,200);}
function respondError(string $message,int $status=400):never{result(false,null,$message,$status);}
$method=$input['method']??'POST';$id=$method==='POST'?null:'DOC';
require __DIR__.'/../../api/endpoints/stock-adjustments.php';
