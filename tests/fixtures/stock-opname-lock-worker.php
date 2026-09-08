<?php
declare(strict_types=1);

if(PHP_SAPI!=='cli')exit(2);
$mode=trim((string)($argv[1]??''));
$userIds=array_values(array_filter(explode(',',(string)($argv[2]??''))));
$orderId=trim((string)($argv[3]??''));
$resultId=trim((string)($argv[4]??''));
$adjustmentId=trim((string)($argv[5]??''));
$signalDirectory=trim((string)($argv[6]??''));
if(!in_array($mode,['post','cancel','observe-without-mutex'],true)||!$userIds||$orderId===''||$resultId===''||$adjustmentId===''||!is_dir($signalDirectory)){
    fwrite(STDERR,"Argumen worker tidak lengkap.\n");exit(2);
}

$host=getenv('DRAC_TEST_MYSQL_HOST')?:'127.0.0.1';
$database=getenv('DRAC_TEST_MYSQL_DATABASE')?:'drac_verify';
$user=getenv('DRAC_TEST_MYSQL_USER')?:'root';
$password=getenv('DRAC_TEST_MYSQL_PASSWORD')?:'root';
$pdo=new PDO("mysql:host={$host};dbname={$database};charset=utf8mb4",$user,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
require_once dirname(__DIR__,2).'/api/helpers.php';
$signal=static function(string $name,string $value='ready')use($signalDirectory):void{
    if(file_put_contents($signalDirectory.DIRECTORY_SEPARATOR.$name,$value,LOCK_EX)===false)throw new RuntimeException("Gagal menulis marker {$name}");
};
$readState=static function()use($pdo,$resultId,$adjustmentId):string{
    $result=$pdo->prepare('SELECT status FROM stock_count_results WHERE id=?');$result->execute([$resultId]);
    $adjustment=$pdo->prepare('SELECT status FROM stock_adjustments WHERE id=?');$adjustment->execute([$adjustmentId]);
    $quantity=$pdo->query("SELECT quantity FROM warehouse_stocks WHERE warehouse_id='WH-1' AND item_id='ITEM-1'")->fetchColumn();
    return (string)$result->fetchColumn().':'.(string)$adjustment->fetchColumn().':'.(string)$quantity;
};

if($mode==='observe-without-mutex'){$signal('negative-control',$readState());exit(0);}

$pdo->exec('SET SESSION innodb_lock_wait_timeout=10');
$pdo->beginTransaction();
try{
    $connectionId=(string)$pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    if($mode==='cancel')$signal('cancel-attempting',$connectionId);
    lockInventoryMutation($pdo);
    if($mode==='cancel')$signal('cancel-acquired',$connectionId);
    $permission=$mode==='post'?'stock_opname:post':'stock_adjustment:edit';
    lockInventoryMutationAuthorization($pdo,['id'=>$userIds[0]],$permission,array_slice($userIds,1));

    if($mode==='post'){
        $order=$pdo->prepare('SELECT id FROM stock_count_orders WHERE id=? FOR UPDATE');$order->execute([$orderId]);
        if($order->fetchColumn()===false)throw new RuntimeException('Order fixture tidak ditemukan');
        $result=$pdo->prepare('SELECT id FROM stock_count_results WHERE id=? AND order_id=? FOR UPDATE');$result->execute([$resultId,$orderId]);
        if($result->fetchColumn()===false)throw new RuntimeException('Result fixture tidak ditemukan');
        $stock=$pdo->query("SELECT quantity FROM warehouse_stocks WHERE warehouse_id='WH-1' AND item_id='ITEM-1' FOR UPDATE");
        if($stock->fetchColumn()===false)throw new RuntimeException('Stock fixture tidak ditemukan');
        $adjustment=$pdo->prepare('SELECT id FROM stock_adjustments WHERE id=? FOR UPDATE');$adjustment->execute([$adjustmentId]);
        if($adjustment->fetchColumn()===false)throw new RuntimeException('Adjustment fixture tidak ditemukan');
        $signal('post-ready',$connectionId);
        $deadline=microtime(true)+10;
        while(!is_file($signalDirectory.DIRECTORY_SEPARATOR.'release')){
            if(microtime(true)>$deadline)throw new RuntimeException('Release marker timeout');
            usleep(50000);
        }
        $pdo->exec("UPDATE warehouse_stocks SET quantity=quantity+1 WHERE warehouse_id='WH-1' AND item_id='ITEM-1'");
        $pdo->prepare("UPDATE stock_adjustments SET status='Posted' WHERE id=?")->execute([$adjustmentId]);
        $pdo->prepare("UPDATE stock_count_results SET status='Posted' WHERE id=?")->execute([$resultId]);
        $pdo->prepare("UPDATE stock_count_orders SET status='Selesai' WHERE id=?")->execute([$orderId]);
        $pdo->commit();$signal('post-complete');exit(0);
    }

    $state=explode(':',$readState());
    $signal('cancel-observed',$state[0].':'.$state[1]);
    $adjustment=$pdo->prepare('SELECT id FROM stock_adjustments WHERE id=? FOR UPDATE');$adjustment->execute([$adjustmentId]);
    if($adjustment->fetchColumn()===false)throw new RuntimeException('Adjustment fixture tidak ditemukan');
    if(lockStockOpnameResultForAdjustment($pdo,$adjustmentId)){
        $pdo->rollBack();fwrite(STDERR,"linked-stock-opname-adjustment\n");exit(3);
    }
    throw new RuntimeException('Fixture adjustment tidak terhubung ke hasil Stok Opname');
}catch(Throwable $error){
    if($pdo->inTransaction())$pdo->rollBack();
    fwrite(STDERR,$error->getMessage()."\n");exit(1);
}
