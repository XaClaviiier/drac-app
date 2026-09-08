<?php
// Actual endpoints/helpers; controlled PDO only, no config, credentials or MySQL.
// This verifies PHP dispatch/authorization and bound writes, not SQL engine/locks.
declare(strict_types=1);
require __DIR__.'/../../api/helpers.php';
final class ScopedZeroStatement extends PDOStatement {
    private array $rows=[];
    public function __construct(private ScopedZeroPDO $db, private string $sql) {}
    public function execute(?array $params=null): bool { $this->rows=$this->db->run($this->sql,$params??[]); return true; }
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0): mixed { return array_shift($this->rows)??false; }
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args): array { return $this->rows; }
    public function fetchColumn(int $column=0): mixed { $row=$this->fetch(); return $row===false?false:array_values($row)[$column]; }
}
final class ScopedZeroPDO extends PDO {
    public array $contacts=[],$receipts=[],$lines=[],$queries=[];
    public bool $transaction=false,$committed=false,$rolledBack=false;
    private array $snapshot=[];
    public function __construct(public array $input,public array $actor) { $this->contacts=$input['rows']??[]; }
    public function prepare(string $query,array $options=[]): PDOStatement|false { return new ScopedZeroStatement($this,$query); }
    public function query(string $query,?int $fetchMode=null,mixed ...$fetchModeArgs): PDOStatement|false { $s=$this->prepare($query);$s->execute();return $s; }
    public function exec(string $statement): int|false { if(!str_starts_with($statement,'CREATE TABLE IF NOT EXISTS customer_contact_logs'))throw new LogicException($statement);return 0; }
    public function beginTransaction(): bool { $this->snapshot=[$this->receipts,$this->lines];$this->transaction=true;return true; }
    public function inTransaction(): bool { return $this->transaction; }
    public function commit(): bool { $this->committed=true;$this->transaction=false;return true; }
    public function rollBack(): bool { [$this->receipts,$this->lines]=$this->snapshot;$this->rolledBack=true;$this->transaction=false;return true; }
    private function receiver(bool $locked=false): array {
        $r=array_replace(['id'=>'receiver','name'=>'Receiver','branch_id'=>'0','is_active'=>1,'is_owner'=>0,'role_id'=>'role'], $this->input['receiver']??[]);
        return $locked?array_replace($r,$this->input['lockedReceiver']??[]):$r;
    }
    public function run(string $sql,array $p): array {
        $q=preg_replace('/\s+/',' ',trim($sql));$this->queries[]=['sql'=>$q,'params'=>$p,'transaction'=>$this->transaction];
        if(str_contains($q,'FOR UPDATE')&&!$this->transaction)throw new LogicException('Lock outside transaction');
        $role=['id'=>'role','code'=>'STAFF','name'=>'Staff','is_active'=>$this->input['roleActive']??1,'permissions'=>json_encode($this->input['permissions']??['customer:view','receipt:create'])];
        if(str_starts_with($q,'SELECT u.* FROM api_sessions'))return [$this->actor];
        if(str_contains($q,'AS idle_expired'))return [['idle_expired'=>0,'idle_timeout_minutes'=>30]];
        if(str_starts_with($q,'UPDATE api_sessions SET last_activity'))return [];
        if(str_starts_with($q,'SELECT ')&&str_contains($q,' FROM roles WHERE'))return [$role];
        if($q==='SELECT id FROM branches ORDER BY id')return array_map(fn($id)=>['id'=>$id],['0','00','0123','123','BR-1']);
        if(str_contains($q,'FROM user_branch_access')) {
            $rows=[];foreach($p as $uid)foreach(($uid==='receiver'?($this->input['receiverMemberships']??[]):($this->input['memberships']??[])) as $bid)$rows[]=['user_id'=>$uid,'branch_id'=>$bid];return $rows;
        }
        if(str_starts_with($q,'INSERT INTO customer_contact_logs')) {
            $columns=['id','customer_id','customer_name','phone','template_type','message_text','vehicle_id','vehicle_info','work_order_id','work_order_number','invoice_id','invoice_number','branch_id','created_by','created_by_name'];
            $this->contacts[]=array_combine($columns,$p)+['created_at'=>'2026-09-08 12:00:00'];return [];
        }
        if(str_starts_with($q,'SELECT * FROM customer_contact_logs'))return array_values(array_filter($this->contacts,fn($r)=>!$p||$r['customer_id']===$p[0]));
        if(str_contains($q,'FROM information_schema.COLUMNS'))return [[1]];
        if($q==='SELECT is_active FROM branches WHERE id=? LIMIT 1')return [['is_active'=>1]];
        if($q==='SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=1')return $p===['warehouse',$this->input['body']['branchId']]?[['id'=>'warehouse']]:[];
        if($q==='SELECT id,name,branch_id,is_active,is_owner FROM users WHERE id=? LIMIT 1')return ($this->input['missingReceiver']??false)?[]:[$this->receiver()];
        if($q==='SELECT * FROM users WHERE id=? FOR UPDATE')return [$this->actor];
        if(str_starts_with($q,'SELECT * FROM users WHERE id IN'))return [$this->receiver(true)];
        if(str_contains($q,'FROM inventory_operation_locks'))return [['lock_key'=>'global']];
        if($q==='SELECT CONNECTION_ID()')return [[1]];
        if(str_starts_with($q,'SELECT IS_USED_LOCK'))return [[null]];
        if(str_starts_with($q,'SELECT * FROM warehouses WHERE id IN'))return [['id'=>'warehouse','branch_id'=>$this->input['body']['branchId'],'is_active'=>1,'is_system'=>0]];
        if(str_starts_with($q,'SELECT id,is_active FROM branches WHERE id IN'))return [['id'=>$p[0],'is_active'=>1]];
        if(str_starts_with($q,'SELECT id,code,name,category_name,unit,type,is_active FROM items'))return [['id'=>'item','code'=>'ITEM','name'=>'Item','unit'=>'pcs','type'=>'Persediaan','is_active'=>1]];
        if(str_starts_with($q,'INSERT IGNORE INTO goods_receipt_sequences')||str_starts_with($q,'UPDATE goods_receipt_sequences'))return [];
        if(str_starts_with($q,'SELECT last_number FROM goods_receipt_sequences')||str_starts_with($q,'SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number'))return [[0]];
        if($q==='SELECT 1 FROM goods_receipts WHERE receipt_number=? LIMIT 1')return [];
        if(str_starts_with($q,'INSERT INTO goods_receipts ')) { $this->receipts[]=$p;return []; }
        if(str_starts_with($q,'INSERT INTO goods_receipt_items ')) { $this->lines[]=$p;return []; }
        throw new LogicException('Unexpected SQL: '.$q);
    }
}
// Deterministic ID generation replaces the config bootstrap utility only.
function generateId(): string { return 'fixture-generated-id'; }
function getInput(): array { return $GLOBALS['input']['body']??[]; }
function scopedZeroFinish(array $response): never {
    $db=$GLOBALS['pdo'];echo json_encode($response+['contacts'=>$db->contacts,'receipts'=>$db->receipts,'lines'=>$db->lines,'committed'=>$db->committed,'rolledBack'=>$db->rolledBack,'queries'=>$db->queries],JSON_THROW_ON_ERROR);exit;
}
function respondSuccess(mixed $data=null,string $message=''): never { scopedZeroFinish(['status'=>200,'data'=>$data,'message'=>$message]); }
function respondError(string $message,int $status=400): never { scopedZeroFinish(['status'=>$status,'message'=>$message]); }
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$actor=array_replace(['id'=>'actor','name'=>'Actor','username'=>'actor','role_id'=>'role','is_owner'=>0,'is_active'=>1,'branch_id'=>null],$input['actor']??[]);
$pdo=new ScopedZeroPDO($input,$actor);
$_SERVER['HTTP_AUTHORIZATION']='Bearer fixture-not-a-real-session';
$method=$input['method']??'POST';$id=$input['id']??null;$requestUser=$actor;
$endpoint=$input['endpoint']??'customer-contacts';
if(!in_array($endpoint,['customer-contacts','goods-receipts'],true))throw new LogicException('Invalid fixture endpoint');
require __DIR__.'/../../api/endpoints/'.$endpoint.'.php';
