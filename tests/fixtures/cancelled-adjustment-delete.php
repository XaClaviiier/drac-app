<?php
// Exercise the real DELETE endpoint with SQLite; MySQL locking is not simulated.
declare(strict_types=1);
final class AdjustmentDeleteDatabase extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]); }
    public function prepare(string $query, array $options=[]): PDOStatement|false {
        $query=str_replace(' FOR UPDATE','',$query);
        $query=str_replace("LEFT(notes,CHAR_LENGTH(?)+1)=CONCAT(?,' ')","substr(notes,1,length(?)+1)=(? || ' ')",$query);
        return parent::prepare($query,$options);
    }
}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$pdo=new AdjustmentDeleteDatabase();
$pdo->exec("CREATE TABLE roles(id TEXT,code TEXT,name TEXT,is_active INTEGER);
CREATE TABLE stock_adjustments(id TEXT,adjustment_number TEXT,status TEXT,batch_key TEXT);
CREATE TABLE stock_adjustment_items(id TEXT,adjustment_id TEXT,item_id TEXT,warehouse_id TEXT,quantity INTEGER);
CREATE TABLE stock_movements(id TEXT,item_id TEXT,source_warehouse_id TEXT,destination_warehouse_id TEXT,quantity INTEGER,is_voided INTEGER,reference_type TEXT,reference_id TEXT,notes TEXT);
CREATE TABLE stock_adjustment_maintenance_logs(adjustment_id TEXT,adjustment_number TEXT,previous_status TEXT,reason TEXT,snapshot_json TEXT,deleted_by TEXT,deleted_by_name TEXT);
CREATE TABLE transaction_activity_logs(entity_type TEXT,entity_id TEXT,entity_number TEXT,action_type TEXT,reason TEXT,snapshot_json TEXT,user_id TEXT,user_name TEXT);
CREATE TABLE warehouse_stocks(warehouse_id TEXT,item_id TEXT,quantity INTEGER);
INSERT INTO warehouse_stocks VALUES('W1','I1',27);
INSERT INTO stock_adjustment_items VALUES('L1','ADJ1','I1','W1',10);");
$pdo->prepare('INSERT INTO stock_adjustments VALUES(?,?,?,?)')->execute(['ADJ1','ADJ-2608-0001',$input['status']??'Cancelled',null]);
$pdo->prepare('UPDATE stock_adjustment_items SET quantity=?')->execute([$input['quantity']??10]);
$pdo->prepare('UPDATE warehouse_stocks SET quantity=?')->execute([$input['stock']??27]);
foreach($input['movements']??[] as $row) {
    $row=array_merge(['id'=>'M1','item_id'=>'I1','source_warehouse_id'=>null,'destination_warehouse_id'=>'W1','quantity'=>10,'is_voided'=>0,'reference_type'=>'stock_adjustment','reference_id'=>'ADJ1','notes'=>'Penyesuaian ADJ-2608-0001'],$row);
    $pdo->prepare('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?,?,?)')->execute(array_values($row));
}
function requireAuthenticatedUser(PDO $pdo): array { return ['id'=>'OWNER','is_owner'=>1,'name'=>'Owner']; }
function getInput(): array { return []; }
function lockInventoryMutation(PDO $pdo): void {}
function lockInventoryMutationAuthorization(PDO $pdo,array $actor,string $permission): array { return ['actor'=>$actor]; }
function assertLockedInventoryOwnerOrAdministrator(array $authorization): void {}
function lockInventoryWarehousesForAuthorization(PDO $pdo,array $authorization,array $ids,string $message,int $status): array {
    if(!$ids)throw new DomainException('Empty warehouse scope',404);
    return ['W1'=>['branch_id'=>'BR1']];
}
// Stock storage adapter; validates the endpoint's correction direction and rollback.
function adjustWarehouseStock(PDO $pdo,string $warehouseId,string $branchId,string $itemId,int $delta): void {
    $stmt=$pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?');
    $stmt->execute([$warehouseId,$itemId]);
    if($delta<0&&(int)$stmt->fetchColumn()+$delta<0)throw new DomainException('Stok tidak mencukupi');
    $pdo->prepare('UPDATE warehouse_stocks SET quantity=quantity+? WHERE warehouse_id=? AND item_id=?')->execute([$delta,$warehouseId,$itemId]);
}
function lockStockOpnameResultForAdjustment(PDO $pdo,string $id): ?array { global $input; return !empty($input['linked'])?['id'=>'RESULT1']:null; }
function transactionExceptionStatus(Throwable $e,int $fallback): int { return $e->getCode()?:$fallback; }
function finishResult(bool $success,string $message): never {
    global $pdo;
    echo json_encode(['success'=>$success,'message'=>$message,
        'documents'=>$pdo->query('SELECT * FROM stock_adjustments')->fetchAll(),
        'movements'=>$pdo->query('SELECT * FROM stock_movements')->fetchAll(),
        'logs'=>$pdo->query('SELECT * FROM transaction_activity_logs')->fetchAll(),
        'stocks'=>$pdo->query('SELECT * FROM warehouse_stocks')->fetchAll()]);
    exit;
}
function respondSuccess(mixed $data=null,string $message=''): never { finishResult(true,$message); }
function respondError(string $message,int $status=400): never { finishResult(false,$message); }
$method='DELETE';$id='ADJ1';
require __DIR__.'/../../api/endpoints/stock-adjustments.php';
