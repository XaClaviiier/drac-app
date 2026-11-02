<?php
// Production correction, authorization and stock helpers with a fail-closed PDO double.
// This exercises rollback semantics, not MySQL locking/concurrency.
require __DIR__.'/../../api/helpers.php';
require __DIR__.'/../../api/warehouse-transfer-correction.php';
class CorrectionStatement extends PDOStatement {
 private array $rows=[];
 public function __construct(private CorrectionDB $db,private string $sql){}
 public function execute(?array $params=null):bool{$this->rows=$this->db->run($this->sql,$params??[]);return true;}
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $orientation=PDO::FETCH_ORI_NEXT,int $offset=0):mixed{return array_shift($this->rows)??false;}
 public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->rows;}
 public function fetchColumn(int $column=0):mixed{$r=$this->fetch();return $r===false?false:array_values($r)[$column];}
}
class CorrectionDB extends PDO{
 public array $state,$initial,$actor,$warehouses;
 private array $snapshot=[];
 public function __construct(public array $input){
  $this->actor=['id'=>'admin','name'=>'Admin','is_active'=>1,'is_owner'=>0,'role_id'=>'role','branch_id'=>'BS'];
  $this->warehouses=['S'=>['id'=>'S','name'=>'Cakalang','branch_id'=>'BS','is_active'=>1,'is_system'=>0],'D'=>['id'=>'D','name'=>'Perintis','branch_id'=>'BD','is_active'=>1,'is_system'=>0]];
  $line=['item_id'=>'A','item_name'=>'Barang A','qty_sent'=>5,'qty_received'=>5];
  $this->state=['header'=>['id'=>'T','transfer_number'=>'TRF-1','status'=>$input['status']??'Diterima','revision'=>0,'source_warehouse_id'=>'S','destination_warehouse_id'=>'D'],'lines'=>[$line],'stock'=>['S:A'=>10,'D:A'=>$input['destinationStock']??5,'S:B'=>10,'D:B'=>0],'branch'=>['BS:A'=>10,'BD:A'=>$input['destinationStock']??5,'BS:B'=>10,'BD:B'=>0],'movements'=>[],'logs'=>[]];
  $this->initial=$this->state;
 }
 public function prepare(string $query,array $options=[]):PDOStatement|false{return new CorrectionStatement($this,$query);}
 public function beginTransaction():bool{$this->snapshot=$this->state;return true;}
 public function commit():bool{return true;}
 public function rollBack():bool{$this->state=$this->snapshot;return true;}
 public function run(string $sql,array $p):array{
  $q=preg_replace('/\s+/',' ',trim($sql));
  if($q==='SELECT * FROM users WHERE id=? FOR UPDATE')return [$this->actor];
  if(str_contains($q,'FROM roles WHERE'))return [['id'=>'role','code'=>$this->input['role']??'ADM','name'=>$this->input['role']??'Admin','permissions'=>'["item:edit"]','is_active'=>1]];
  if(str_contains($q,'FROM user_branch_access'))return array_map(fn($b)=>['user_id'=>'admin','branch_id'=>$b],$this->input['branches']??['BS','BD']);
  if(str_starts_with($q,'SELECT * FROM warehouses WHERE id IN'))return array_values($this->warehouses);
  if(str_starts_with($q,'SELECT id,is_active FROM branches WHERE id IN'))return array_map(fn($id)=>['id'=>$id,'is_active'=>1],$p);
  if(str_starts_with($q,'SELECT id,branch_id,is_active FROM warehouses'))return [$this->warehouses[$p[0]]];
  if($q==='SELECT * FROM warehouse_transfers WHERE id=? FOR UPDATE')return [$this->state['header']];
  if(str_starts_with($q,'SELECT * FROM warehouse_transfer_items'))return array_values($this->state['lines']);
  if(str_contains($q,'FROM items WHERE id IN'))return array_map(fn($id)=>['id'=>$id,'code'=>$id,'name'=>'Barang '.$id,'category_name'=>'Parts','unit'=>'PCS','type'=>'Persediaan','is_active'=>!in_array($id,$this->input['inactive']??[],true)],$p);
  if($q==='SELECT type FROM items WHERE id=?')return [['Persediaan']];
  if(str_starts_with($q,'SELECT quantity FROM warehouse_stocks'))return [[$this->state['stock'][$p[0].':'.$p[1]]??0]];
  if(str_starts_with($q,'INSERT INTO warehouse_stocks')){$this->state['stock'][$p[0].':'.$p[1]]+=$p[2];return [];}
  if(str_starts_with($q,'INSERT INTO branch_item_stocks')){$this->state['branch'][$p[0].':'.$p[1]]+=$p[2];return [];}
  if(str_starts_with($q,'UPDATE items i JOIN'))return [];
  if(str_starts_with($q,'INSERT INTO stock_movements')){$this->state['movements'][]=$p;return [];}
  if(str_starts_with($q,'DELETE FROM warehouse_transfer_items')){$this->state['lines']=array_values(array_filter($this->state['lines'],fn($row)=>$row['item_id']!==$p[1]));return [];}
  if(str_starts_with($q,'UPDATE warehouse_transfer_items')){foreach($this->state['lines'] as &$row)if($row['item_id']===$p[3]){$row['qty_sent']=$p[0];$row['qty_received']=$p[1];}return [];}
  if(str_starts_with($q,'INSERT INTO warehouse_transfer_items')){$this->state['lines'][]=['item_id'=>$p[1],'item_name'=>$p[3],'qty_sent'=>$p[6],'qty_received'=>$p[7]];return [];}
  if(str_starts_with($q,'UPDATE warehouse_transfers SET revision')){$this->state['header']['revision']++;return [];}
  if(str_starts_with($q,'INSERT INTO transaction_activity_logs')){if(!empty($this->input['failAudit']))throw new RuntimeException('Injected audit failure');$this->state['logs'][]=$p;return [];}
  throw new LogicException('Unexpected SQL: '.$q);
 }
}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$db=new CorrectionDB($input);$results=[];
foreach($input['requests']??[['revision'=>0,'reason'=>'Salah input','items'=>[['itemId'=>'A','qty'=>7]]]] as $request){
 $db->beginTransaction();
 try{correctReceivedWarehouseTransfer($db,$db->actor,'T',$request);$db->commit();$results[]=['success'=>true];}
 catch(Throwable $e){$db->rollBack();$results[]=['success'=>false,'message'=>$e->getMessage(),'code'=>$e->getCode()];}
}
echo json_encode(['results'=>$results,'initial'=>$db->initial,'state'=>$db->state],JSON_THROW_ON_ERROR);
