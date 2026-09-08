<?php
// Real endpoint, authorization, stock arithmetic and journal helpers. SQL is a
// fail-closed in-memory PDO double, not a MySQL persistence/concurrency test.
declare(strict_types=1);
require __DIR__.'/../../api/helpers.php';
final class ReceiptZeroSourceStatement extends PDOStatement {
    private array $rows=[];
    public function __construct(private ReceiptZeroSourcePDO $db,private string $sql) {}
    public function execute(?array $params=null):bool {$this->rows=$this->db->run($this->sql,$params??[]);return true;}
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed {return array_shift($this->rows)??false;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array {return $this->rows;}
    public function fetchColumn(int $column=0):mixed {$r=$this->fetch();return $r===false?false:array_values($r)[$column];}
}
final class ReceiptZeroSourcePDO extends PDO {
    public array $state,$initial,$queries=[],$warehouses;
    public bool $transaction=false,$committed=false,$rolledBack=false;
    private array $snapshot=[];
    public function __construct(public array $input,public array $actor) {
        $source=$input['source']??'0';$received=($input['oldStatus']??'Draft')==='Diterima';$qty=$received?4:0;
        $this->warehouses=['src'=>['id'=>'src','branch_id'=>$source,'is_active'=>1,'is_system'=>0],'dst'=>['id'=>'dst','branch_id'=>'DEST','is_active'=>1,'is_system'=>0]];
        $row=['id'=>'receipt','receipt_number'=>'GR-TEST','date'=>'2026-09-08','status'=>$input['oldStatus']??'Draft','branch_id'=>'DEST','warehouse_id'=>'dst','source_type'=>'Transfer Gudang','source_warehouse_id'=>'src','source_branch_id'=>$source,'received_by_id'=>'receiver','received_by'=>'Receiver','supplier_id'=>null];
        $movement=['id'=>'old-movement','item_id'=>'item','source_warehouse_id'=>'src','destination_warehouse_id'=>'dst','quantity'=>4,'reference_type'=>'goods_receipt','reference_id'=>'receipt','is_voided'=>0];
        $stocks=['src'=>$input['sourceStock']??(20-$qty),'dst'=>$input['destinationStock']??$qty];
        $this->state=['receipt'=>($input['method']??'PUT')==='POST'?null:$row,'lines'=>[['item_id'=>'item','qty'=>4,'qty_invoiced'=>0]],'warehouse'=>$stocks,'branch'=>['b:'.$source=>[$stocks['src'],$stocks['src']],'b:DEST'=>[$stocks['dst'],$stocks['dst']]],'itemStock'=>$stocks['src'],'movements'=>$received?[$movement]:[],'logs'=>[],'versions'=>['src'=>0,'dst'=>0]];
        if(($input['method']??'PUT')==='POST')$this->state['lines']=[];
        $this->initial=$this->state;
    }
    public function prepare(string $query,array $options=[]):PDOStatement|false {return new ReceiptZeroSourceStatement($this,$query);}
    public function query(string $query,?int $fetchMode=null,mixed ...$fetchModeArgs):PDOStatement|false {$s=$this->prepare($query);$s->execute();return $s;}
    public function beginTransaction():bool {$this->snapshot=$this->state;$this->transaction=true;return true;}
    public function inTransaction():bool {return $this->transaction;}
    public function commit():bool {$this->transaction=false;$this->committed=true;return true;}
    public function rollBack():bool {$this->state=$this->snapshot;$this->transaction=false;$this->rolledBack=true;return true;}
    public function run(string $sql,array $p):array {
        $q=preg_replace('/\s+/',' ',trim($sql));$this->queries[]=['sql'=>$q,'params'=>$p,'transaction'=>$this->transaction];
        if(str_contains($q,'FOR UPDATE')&&!$this->transaction)throw new LogicException('Lock outside transaction');
        if(preg_match('/^(INSERT|UPDATE|DELETE) /',$q)&&!$this->transaction)throw new LogicException('Write outside transaction');
        $role=['id'=>'role','code'=>'STAFF','name'=>'Staff','is_active'=>1,'permissions'=>json_encode($this->input['permissions']??['receipt:create','receipt:edit','receipt:delete'])];
        $receiver=['id'=>'receiver','name'=>'Receiver','branch_id'=>'DEST','role_id'=>'role','is_active'=>1,'is_owner'=>0];
        if(str_contains($q,'FROM information_schema.COLUMNS'))return [[1]];
        if(str_starts_with($q,'SELECT ')&&str_contains($q,' FROM roles WHERE'))return [$role];
        if(str_contains($q,'FROM user_branch_access')) {
            $rows=[];foreach($p as $uid)foreach(($uid==='receiver'?['DEST']:($this->transaction?($this->input['lockedMemberships']??$this->input['memberships']??['DEST',$this->input['source']??'0']):($this->input['memberships']??['DEST',$this->input['source']??'0']))) as $bid)$rows[]=['user_id'=>$uid,'branch_id'=>$bid];return $rows;
        }
        if($q==='SELECT * FROM users WHERE id=? FOR UPDATE')return [$this->actor];
        if(str_starts_with($q,'SELECT * FROM users WHERE id IN')||str_starts_with($q,'SELECT id,name,branch_id,is_active,is_owner FROM users'))return [$receiver];
        if(str_contains($q,'FROM inventory_operation_locks'))return [['lock_key'=>'global']];
        if($q==='SELECT CONNECTION_ID()')return [[1]];
        if(str_starts_with($q,'SELECT IS_USED_LOCK'))return [[null]];
        if(str_starts_with($q,'SELECT * FROM warehouses WHERE id IN'))return array_values(array_intersect_key($this->warehouses,array_flip($p)));
        if(str_starts_with($q,'SELECT id,is_active FROM branches WHERE id IN'))return array_map(fn($id)=>['id'=>$id,'is_active'=>1],$p);
        if($q==='SELECT is_active FROM branches WHERE id=? LIMIT 1')return [[1]];
        if($q==='SELECT code FROM branches WHERE id=?')return [['code'=>'B'.$p[0]]];
        if(str_starts_with($q,'SELECT id FROM warehouses WHERE id=? AND branch_id=?'))return isset($this->warehouses[$p[0]])&&$this->warehouses[$p[0]]['branch_id']===$p[1]?[['id'=>$p[0]]]:[];
        if(str_starts_with($q,'SELECT id,branch_id')&&str_contains($q,'FROM warehouses WHERE id=?'))return isset($this->warehouses[$p[0]])?[$this->warehouses[$p[0]]]:[];
        if(str_starts_with($q,'SELECT received_by_id FROM goods_receipts'))return $this->state['receipt']&&in_array('DEST',array_slice($p,1),true)?[['received_by_id'=>'receiver']]:[];
        if($q==='SELECT * FROM goods_receipts WHERE id=? FOR UPDATE')return $this->state['receipt']?[$this->state['receipt']]:[];
        if($q==='SELECT * FROM goods_receipt_items WHERE receipt_id = ?')return $this->state['lines'];
        if(str_starts_with($q,'SELECT COUNT(*) FROM purchase_invoice_items'))return [[$this->input['linkedInvoices']??0]];
        if($q==='SELECT type FROM items WHERE id=?')return [['type'=>'Persediaan']];
        if(str_starts_with($q,'SELECT ')&&str_contains($q,' FROM items WHERE'))return [['id'=>'item','code'=>'ITEM','name'=>'Item','unit'=>'pcs','type'=>'Persediaan','is_active'=>1]];
        if(str_starts_with($q,'SELECT quantity FROM warehouse_stocks'))return [[$this->state['warehouse'][$p[0]]]];
        if(str_starts_with($q,'INSERT INTO warehouse_stocks(')) {$this->state['warehouse'][$p[0]]+=$p[2];$this->state['versions'][$p[0]]++;return [];}
        if(str_starts_with($q,'INSERT INTO branch_item_stocks(')) {$this->state['branch']['b:'.$p[0]][0]+=$p[2];$this->state['branch']['b:'.$p[0]][1]+=$p[3];return [];}
        if(str_starts_with($q,'UPDATE items i JOIN branch_item_stocks')) {if($p[1]===($this->input['source']??'0'))$this->state['itemStock']=$this->state['branch']['b:'.$p[1]][0];return [];}
        if(str_starts_with($q,'INSERT INTO goods_receipts ')) {$cols=['id','receipt_number','date','supplier_id','supplier_name','do_number','delivery_method','delivery_other','shipping_notes','source_type','source_warehouse_id','source_branch_id','transfer_number','status','notes','branch_id','warehouse_id','received_by','received_by_id'];$this->state['receipt']=array_combine($cols,$p);return [];}
        if(str_starts_with($q,'UPDATE goods_receipts SET')) {$cols=['receipt_number','date','supplier_id','supplier_name','do_number','delivery_method','delivery_other','shipping_notes','status','notes','branch_id','warehouse_id','received_by','received_by_id'];$this->state['receipt']=array_replace($this->state['receipt'],array_combine($cols,array_slice($p,0,14)));return [];}
        if(str_starts_with($q,'DELETE FROM goods_receipt_items')) {$this->state['lines']=[];return [];}
        if(str_starts_with($q,'INSERT INTO goods_receipt_items ')) {$this->state['lines'][]=['item_id'=>$p[1],'qty'=>$p[4],'qty_invoiced'=>$p[6]];return [];}
        if(str_starts_with($q,'DELETE FROM goods_receipts ')) {$this->state['receipt']=null;$this->state['lines']=[];return [];}
        if(str_starts_with($q,'INSERT INTO transaction_activity_logs')) {$this->state['logs'][]=$p;return [];}
        if(str_starts_with($q,'UPDATE stock_movements SET is_voided=1')) {foreach($this->state['movements'] as &$m)$m['is_voided']=1;return [];}
        if(str_starts_with($q,'SELECT id FROM stock_movements WHERE idempotency_key'))return [];
        if(str_starts_with($q,'INSERT INTO stock_movements(')) {$cols=['id','item_id','source_warehouse_id','destination_warehouse_id','quantity','unit_cost','movement_type','reference_type','reference_id','reference_number','reversal_of_id','correction_group_id','idempotency_key','notes','occurred_at','created_by'];$this->state['movements'][]=array_combine($cols,$p)+['is_voided'=>0];return [];}
        if(str_starts_with($q,'INSERT IGNORE INTO goods_receipt_sequences')||str_starts_with($q,'UPDATE goods_receipt_sequences'))return [];
        if(str_starts_with($q,'SELECT last_number FROM goods_receipt_sequences')||str_starts_with($q,'SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number'))return [[0]];
        if(str_starts_with($q,'SELECT transfer_number FROM goods_receipts')||$q==='SELECT 1 FROM goods_receipts WHERE receipt_number=? LIMIT 1')return [];
        throw new LogicException('Unexpected SQL: '.$q);
    }
}
function generateId():string {return 'receipt';}
function getInput():array {return $GLOBALS['input']['body'];}
function receiptZeroSourceFinish(array $response):never {$db=$GLOBALS['pdo'];echo json_encode($response+['state'=>$db->state,'initial'=>$db->initial,'committed'=>$db->committed,'rolledBack'=>$db->rolledBack,'queries'=>$db->queries],JSON_THROW_ON_ERROR);exit;}
function respondSuccess(mixed $data=null,string $message=''):never {receiptZeroSourceFinish(['status'=>200,'data'=>$data,'message'=>$message]);}
function respondError(string $message,int $status=400,mixed $detail=null):never {receiptZeroSourceFinish(['status'=>$status,'message'=>$message,'detail'=>$detail]);}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$actor=['id'=>'actor','name'=>'Actor','role_id'=>'role','is_owner'=>0,'is_active'=>1,'branch_id'=>null];
$pdo=new ReceiptZeroSourcePDO($input,$actor);$method=$input['method']??'PUT';$id='receipt';$requestUser=$actor;
require __DIR__.'/../../api/endpoints/goods-receipts.php';
