<?php
declare(strict_types=1);
require __DIR__.'/../../api/helpers.php';
require __DIR__.'/../../api/stock-adjustment-values.php';
class AdjustmentValueDatabase extends PDO {
    function __construct() {parent::__construct('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);}
    function prepare(string $query,array $options=[]): PDOStatement|false {return parent::prepare(str_replace(' FOR UPDATE','',$query),$options);}
}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$pdo=new AdjustmentValueDatabase();
$pdo->exec('CREATE TABLE warehouse_stocks(warehouse_id TEXT,item_id TEXT,quantity INTEGER)');
$pdo->prepare('INSERT INTO warehouse_stocks VALUES(?,?,?)')->execute(['W1','I1',$input['current']??8]);
try {
    $pdo->beginTransaction();
    $values=adjustmentLineValues($pdo,$input['row'],'W1','I1');
    $pdo->commit();
    echo json_encode(['success'=>true,'values'=>$values]);
} catch(Throwable $error) {
    if($pdo->inTransaction())$pdo->rollBack();
    echo json_encode(['success'=>false,'status'=>$error->getCode(),'message'=>$error->getMessage()]);
}
