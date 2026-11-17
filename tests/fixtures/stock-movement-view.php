<?php
// Runs the real read endpoint against a read-only PDO double; no database changes.
declare(strict_types=1);
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
final class MovementViewStatement extends PDOStatement {
    private array $rows=[];
    public function __construct(private MovementViewPDO $db,private string $sql) {}
    public function execute(?array $params=null):bool {$this->rows=$this->db->read($this->sql,$params??[]);return true;}
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed {return array_shift($this->rows)??false;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array {return $this->rows;}
    public function fetchColumn(int $column=0):mixed {$row=$this->fetch();return $row===false?false:array_values($row)[$column];}
}
final class MovementViewPDO extends PDO {
    public array $queries=[];
    public array $warehouses=['W1'=>['branch'=>'B1','name'=>'Gudang Cakalang'],'W2'=>['branch'=>'B1','name'=>'Gudang Perintis'],'W3'=>['branch'=>'B2','name'=>'Gudang Terbatas']];
    public function __construct(public array $input) {}
    public function prepare(string $query,array $options=[]):PDOStatement|false {return new MovementViewStatement($this,$query);}
    public function read(string $sql,array $params):array {
        $this->queries[]=preg_replace('/\s+/',' ',trim($sql));
        if(!str_starts_with(trim($sql),'SELECT '))throw new LogicException('Unexpected mutation: '.$sql);
        if(str_contains($sql,'SELECT branch_id FROM warehouses'))return isset($this->warehouses[$params[0]])?[['branch'=>$this->warehouses[$params[0]]['branch']]]:[];
        if(str_contains($sql,'SELECT COALESCE(quantity,0) FROM warehouse_stocks'))return [['quantity'=>($this->input['stocks']??['W1'=>13,'W2'=>2])[$params[1]]??0]];
        if(str_contains($sql,'SUM(ws.quantity)')){
            $total=0;foreach(($this->input['stocks']??['W1'=>13,'W2'=>2]) as $warehouse=>$quantity)if(in_array($this->warehouses[$warehouse]['branch'],array_slice($params,1),true))$total+=$quantity;
            return [['quantity'=>$total]];
        }
        if(str_contains($sql,'SELECT m.*,i.name item_name')){
            $rows=[];
            foreach($this->input['rows'] as $row){
                if(!empty($row['is_voided'])||($params&&$row['item_id']!==$params[0]))continue;
                $source=$this->warehouses[$row['source_warehouse_id']??'']??[];$destination=$this->warehouses[$row['destination_warehouse_id']??'']??[];
                $rows[]=array_merge($row,['item_name'=>'Kompresor AC','source_name'=>$source['name']??null,'source_branch_id'=>$source['branch']??null,'destination_name'=>$destination['name']??null,'destination_branch_id'=>$destination['branch']??null]);
            }
            usort($rows,fn($a,$b)=>strcmp($b['occurred_at']??$b['created_at'],$a['occurred_at']??$a['created_at'])?:$b['movement_sequence']<=>$a['movement_sequence']);
            return str_contains($sql,'LIMIT 200')?array_slice($rows,0,200):$rows;
        }
        throw new LogicException('Unmocked query: '.$sql);
    }
}
function requireAuthenticatedUser(PDO $pdo):array {return ['id'=>'reader'];}
function getAccessibleBranchIds(PDO $pdo,array $actor):array {return $pdo->input['branches']??['B1'];}
function authenticatedUserIsOwnerOrAdministrator(PDO $pdo,array $actor):bool {return $pdo->input['admin']??true;}
function authenticatedUserHasPermission(PDO $pdo,array $actor,string $permission):bool {return in_array($permission,$pdo->input['permissions']??[],true);}
function respondSuccess(mixed $data,string $message=''):never {global $pdo;echo json_encode(['status'=>200,'data'=>$data,'queries'=>$pdo->queries],JSON_THROW_ON_ERROR);exit;}
function respondError(string $message,int $status=400):never {echo json_encode(['status'=>$status,'message'=>$message],JSON_THROW_ON_ERROR);exit;}
$pdo=new MovementViewPDO($input);$method='GET';$_GET=$input['query']??['itemId'=>'I1'];
require __DIR__.'/../../api/endpoints/stock-movements.php';
