<?php
// Disposable real MySQL; no application configuration or credentials loaded.
require __DIR__.'/../../api/helpers.php';
if (getenv('DRAC_TEST_ISOLATED_MYSQL') !== '1') throw new RuntimeException('Isolated MySQL opt-in required');
$options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false];
$dsn='mysql:host=127.0.0.1;port=3306;charset=utf8mb4';
$user=getenv('DB_USER')?:'root'; $password=getenv('DB_PASSWORD')?:'';
$admin=new PDO($dsn,$user,$password,$options);
if (!str_starts_with($admin->query('SELECT VERSION()')->fetchColumn(),'5.7.')) throw new RuntimeException('MySQL 5.7 required');
$db='drac_snapshot_test_'.getmypid();
$admin->exec("CREATE DATABASE `$db`");
class ReportSnapshotStatement extends PDOStatement {
    protected function __construct(private object $hook) {}
    public function execute(?array $params=null):bool {
        $ok=parent::execute($params);
        if ($this->hook->armed && str_contains($this->queryString,'FROM warehouse_stocks')) {
            $this->hook->armed=false;
            // Real second-connection atomic receipt commit after the balance SELECT.
            $this->hook->writer->beginTransaction();
            $this->hook->writer->exec("UPDATE warehouse_stocks SET quantity=quantity+5");
            $this->hook->writer->exec("INSERT INTO stock_movements VALUES ('ITEM',NULL,'WH',5,'receipt','2026-09-02 12:00:00','2026-09-02 12:00:00',0)");
            $this->hook->writer->commit();
            $this->hook->commits++;
        }
        return $ok;
    }
}
try {
    $writer=new PDO($dsn.';dbname='.$db,$user,$password,$options);
    $reader=new PDO($dsn.';dbname='.$db,$user,$password,$options);
    $writer->exec('CREATE TABLE warehouse_stocks(warehouse_id VARCHAR(20),item_id VARCHAR(20),quantity INT) ENGINE=InnoDB');
    $writer->exec('CREATE TABLE stock_movements(item_id VARCHAR(20),source_warehouse_id VARCHAR(20),destination_warehouse_id VARCHAR(20),quantity INT,movement_type VARCHAR(30),occurred_at DATETIME,created_at DATETIME,is_voided TINYINT) ENGINE=InnoDB');
    $hook=(object)['writer'=>$writer,'armed'=>false,'commits'=>0];
    $reader->setAttribute(PDO::ATTR_STATEMENT_CLASS,[ReportSnapshotStatement::class,[$hook]]);
    foreach (['REPEATABLE READ','READ COMMITTED'] as $isolation) foreach ([false,true] as $transaction) {
        $writer->exec('DELETE FROM warehouse_stocks'); $writer->exec('DELETE FROM stock_movements');
        $writer->exec("INSERT INTO warehouse_stocks VALUES ('WH','ITEM',10)");
        $reader->exec('SET SESSION TRANSACTION ISOLATION LEVEL '.$isolation);
        if ($transaction) $reader->beginTransaction();
        $hook->armed=true;
        $result=historicalWarehouseQuantitiesFromLedger($reader,'WH','2026-09-01');
        if ($result['ITEM']!==10) throw new RuntimeException('Expected historical 10, got '.$result['ITEM'].' '.$isolation);
        if ($reader->inTransaction()!==$transaction) throw new RuntimeException('Caller transaction changed');
        if ($reader->query('SELECT @@tx_isolation')->fetchColumn()!==str_replace(' ','-',$isolation)) throw new RuntimeException('Isolation changed');
        if ($transaction) $reader->rollBack();
        if ((int)$writer->query('SELECT quantity FROM warehouse_stocks')->fetchColumn()!==15) throw new RuntimeException('Writer did not commit');
        echo json_encode(['isolation'=>$isolation,'existing_transaction'=>$transaction,'historical'=>$result['ITEM'],'committed_current'=>15]).PHP_EOL;
    }
    if ($hook->commits!==4) throw new RuntimeException('Missing interleavings');
} finally {
    if (isset($reader)&&$reader->inTransaction()) $reader->rollBack();
    $admin->exec("DROP DATABASE `$db`");
}
