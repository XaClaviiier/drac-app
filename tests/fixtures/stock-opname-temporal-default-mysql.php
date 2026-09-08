<?php
// CI-only, real MySQL 5.7 roundtrips; never loads application config/credentials.
// MYSQL_CONTAINER is the existing CI service. Only this disposable DB is used.
require __DIR__.'/../../api/helpers.php';
$local=getenv('DRAC_TEST_ISOLATED_MYSQL')==='1';
if (!$local && (getenv('CI') !== 'true' || !getenv('MYSQL_CONTAINER'))) throw new RuntimeException('Requires isolated opt-in or CI container');
$pdo=new PDO('mysql:host=127.0.0.1;dbname=drac_temporal_defaults;charset=utf8mb4','root',$local?'':'root',[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES=>false,
]);
if (!str_starts_with((string)$pdo->query('SELECT VERSION()')->fetchColumn(),'5.7.')) throw new RuntimeException('MySQL 5.7 required');
$pdo->exec("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
$pdo->exec("SET SESSION time_zone='+00:00'");
function runTemporalSqlFile(string $name): void {
    $file=realpath(__DIR__.'/../../database/'.$name);
    $command=['docker','exec','-i',getenv('MYSQL_CONTAINER'),'mysql','--init-command=SET SESSION sql_mode=\'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION\'','-uroot','-proot','drac_temporal_defaults'];
    if (getenv('DRAC_TEST_ISOLATED_MYSQL')==='1') $command=[getenv('DRAC_TEST_MYSQL_CLI'),'--no-defaults','--host=127.0.0.1','--user=root',"--init-command=SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone='+00:00'",'drac_temporal_defaults'];
    $process=proc_open($command,[0=>['file',$file,'r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
    if (!is_resource($process)) throw new RuntimeException('Could not start MySQL CLI');
    $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);
    fclose($pipes[1]);fclose($pipes[2]);
    if (proc_close($process)!==0) throw new RuntimeException($name." failed: ".$err.$out);
}
function temporalDefinitions(PDO $pdo): array {
    $create=$pdo->query('SHOW CREATE TABLE stock_count_result_items')->fetch()['Create Table'];
    preg_match_all('/^  `(added_at|added_by)` .*$/m',$create,$lines);
    if (count($lines[0])!==2) throw new RuntimeException('Expected both adopted definitions');
    return $lines[0];
}
function temporalCheck(bool $ok,string $message): void { if (!$ok) throw new RuntimeException($message); }
$cases=[];
foreach (['DATETIME','TIMESTAMP'] as $type) {
    foreach (['','(0)','(3)','(6)'] as $precision) {
        foreach ([false,true] as $update) {
            $cases[]=$type.$precision.' NOT NULL DEFAULT CURRENT_TIMESTAMP'.$precision.($update?' ON UPDATE CURRENT_TIMESTAMP'.$precision:'')." COMMENT 'adopted temporal'";
        }
    }
}
$cases[]="DATETIME NOT NULL DEFAULT '2026-08-10 12:34:56' COMMENT 'literal date'";
$cases[]='DATETIME NULL DEFAULT NULL';
$roundtrips=0;
foreach (['standalone','runtime'] as $path) {
    foreach ($cases as $definition) {
        foreach (['stock_count_result_items','stock_count_results','stock_count_orders','stock_opname_schema_value_backups','stock_opname_schema_ownership','app_schema_migrations','inventory_operation_locks','inventory_import_batches'] as $table) $pdo->exec('DROP TABLE IF EXISTS `'.$table.'`');
        $pdo->exec('CREATE TABLE stock_count_orders(id VARCHAR(30) PRIMARY KEY,start_date DATE NOT NULL,category_id VARCHAR(20) NULL) ENGINE=InnoDB');
        $pdo->exec('CREATE TABLE stock_count_results(id VARCHAR(30) PRIMARY KEY,order_id VARCHAR(30) NOT NULL,result_date DATE NOT NULL) ENGINE=InnoDB');
        $pdo->exec("CREATE TABLE stock_count_result_items(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,result_id VARCHAR(30) NOT NULL,item_id VARCHAR(20) NOT NULL,system_quantity INT NOT NULL DEFAULT 0,added_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CURRENT_TIMESTAMP' COMMENT 'literal token',added_at ".$definition.') ENGINE=InnoDB');
        $value='2026-08-10 12:34:56'.(str_contains($definition,'(6)')?'.123456':(str_contains($definition,'(3)')?'.123':''));
        $pdo->exec("INSERT INTO stock_count_result_items(result_id,item_id,added_at) VALUES('R','I','$value')");
        $before=temporalDefinitions($pdo);
        $prior=null;
        // migrate + rerun, rollback + rerun, then re-migrate and rollback again.
        foreach ([1,2] as $cycle) {
            if ($path==='runtime') {
                foreach (['added_at','added_by'] as $column) {
                    ensureOwnedStockOpnameColumn($pdo,'stock_count_result_items',$column,$column==='added_at'?'DATETIME NULL':'VARCHAR(20) NULL');
                    ensureOwnedStockOpnameColumn($pdo,'stock_count_result_items',$column,$column==='added_at'?'DATETIME NULL':'VARCHAR(20) NULL');
                }
                // Execute the production normalization block unchanged on real MySQL.
                // This targeted fixture is not a full endpoint/bootstrap integration test.
                $source=file_get_contents(__DIR__.'/../../api/helpers.php');
                $start=strpos($source,'    $pdo->exec("ALTER TABLE stock_count_result_items MODIFY added_by');
                $end=strpos($source,'    ensureCanonicalStockCountResultItemIndex($pdo);',$start);
                temporalCheck($start!==false&&$end!==false,'Runtime normalization block missing');
                eval(substr($source,$start,$end-$start));
                temporalCheck($pdo->query('SELECT added_at FROM stock_count_result_items')->fetchColumn()===$value,'Runtime temporal value lost: '.$definition);
                $prior=$pdo->query("SELECT component_name,prior_definition FROM stock_opname_schema_ownership ORDER BY component_name")->fetchAll();
            }
            runTemporalSqlFile('migrate_stock_opname_history.sql');
            temporalCheck($pdo->query('SELECT added_at FROM stock_count_result_items')->fetchColumn()===$value,'Migrated temporal value lost: '.$path.' '.$definition);
            $captured=$pdo->query("SELECT component_name,prior_definition FROM stock_opname_schema_ownership WHERE component_name IN ('added_at','added_by') ORDER BY component_name")->fetchAll();
            temporalCheck(count($captured)===2,'Both columns must be captured');
            if ($path==='runtime') temporalCheck($captured===$prior,'Standalone migration overwrote runtime ownership');
            temporalCheck(str_contains($captured[1]['prior_definition'],"DEFAULT 'CURRENT_TIMESTAMP'"),'VARCHAR default must stay quoted');
            if (str_contains($definition,'DEFAULT CURRENT_TIMESTAMP')) temporalCheck(str_contains($captured[0]['prior_definition'],'DEFAULT CURRENT_TIMESTAMP')&&!str_contains($captured[0]['prior_definition'],"DEFAULT 'CURRENT_TIMESTAMP"),'Temporal default was quoted');
            runTemporalSqlFile('migrate_stock_opname_history.sql');
            $again=$pdo->query("SELECT component_name,prior_definition FROM stock_opname_schema_ownership WHERE component_name IN ('added_at','added_by') ORDER BY component_name")->fetchAll();
            temporalCheck($again===$captured,'Rerun changed original ownership');
            foreach ([1,2] as $rollback) {
                runTemporalSqlFile('rollback_stock_opname_history.sql');
                temporalCheck($pdo->query('SELECT added_at FROM stock_count_result_items')->fetchColumn()===$value,'Rollback temporal value lost: '.$path.' '.$definition);
                temporalCheck(temporalDefinitions($pdo)===$before,$path.' definition roundtrip failed: '.$definition);
                temporalCheck((int)$pdo->query('SELECT COUNT(*) FROM stock_count_result_items')->fetchColumn()===1,'Legacy row lost');
            }
        }
        $roundtrips++;
        echo 'PASS '.$path.' '.$definition."\n";
    }
}
temporalCheck($roundtrips===count($cases)*2,'Missing roundtrip cases');
echo 'Verified '.$roundtrips." MySQL 5.7 standalone/runtime cases (two migration/rollback cycles each).\n";
