<?php
// Backup/restore transaksi lintas tabel. Hanya Owner (dibatasi router).
$sheetTables = [
    'Pelanggan' => 'customers',
    'Kendaraan' => 'vehicles',
    'WO' => 'work_orders',
    'Detail_WO' => 'work_order_services',
    'Faktur' => 'sales_invoices',
    'Detail_Faktur' => 'sales_invoice_items',
    'Pembayaran' => 'customer_payments',
];

$readBackup = static function () use ($pdo): array {
    $result = [];
    foreach ([
        'Pelanggan'=>'customers', 'Kendaraan'=>'vehicles', 'WO'=>'work_orders',
        'Detail_WO'=>'work_order_services', 'Faktur'=>'sales_invoices',
        'Detail_Faktur'=>'sales_invoice_items', 'Pembayaran'=>'customer_payments',
    ] as $sheet=>$table) {
        $order = in_array($table, ['work_order_services','sales_invoice_items'], true) ? 'id' : (in_array($table, ['work_orders','sales_invoices','customer_payments'], true) ? 'date' : 'id');
        $result[$sheet] = $pdo->query("SELECT * FROM {$table} ORDER BY {$order}")->fetchAll();
    }
    return $result;
};

$validate = static function (array $sheets) use ($pdo): array {
    $errors=[]; $warnings=[]; $counts=[]; $duplicates=[];
    foreach (['Pelanggan','Kendaraan','WO','Detail_WO','Faktur','Detail_Faktur','Pembayaran'] as $name) {
        if (!isset($sheets[$name]) || !is_array($sheets[$name])) $errors[]="Sheet {$name} tidak ditemukan";
        $counts[$name]=is_array($sheets[$name]??null)?count($sheets[$name]):0;
    }
    $ids=[];
    foreach (['Pelanggan','Kendaraan','WO','Faktur','Pembayaran'] as $name) {
        foreach (($sheets[$name]??[]) as $i=>$row) {
            $id=trim((string)($row['id']??''));
            if($id==='')$errors[]="{$name} baris ".($i+2).": ID kosong";
            elseif(isset($ids[$name][$id]))$errors[]="{$name}: ID {$id} duplikat dalam file";
            $ids[$name][$id]=true;
        }
    }
    $customerIds=array_fill_keys(array_map(fn($r)=>(string)($r['id']??''),$sheets['Pelanggan']??[]),true);
    $vehicleIds=array_fill_keys(array_map(fn($r)=>(string)($r['id']??''),$sheets['Kendaraan']??[]),true);
    $woIds=array_fill_keys(array_map(fn($r)=>(string)($r['id']??''),$sheets['WO']??[]),true);
    $invoiceIds=array_fill_keys(array_map(fn($r)=>(string)($r['id']??''),$sheets['Faktur']??[]),true);
    foreach(($sheets['Kendaraan']??[]) as $i=>$r) if(!empty($r['customer_id'])&&!isset($customerIds[(string)$r['customer_id']]))$errors[]='Kendaraan baris '.($i+2).': customer_id tidak ada di Pelanggan';
    foreach(($sheets['WO']??[]) as $i=>$r){
        if(!empty($r['customer_ref_id'])&&!isset($customerIds[(string)$r['customer_ref_id']]))$errors[]='WO baris '.($i+2).': customer_ref_id tidak ditemukan';
        if(!empty($r['vehicle_ref_id'])&&!isset($vehicleIds[(string)$r['vehicle_ref_id']]))$errors[]='WO baris '.($i+2).': vehicle_ref_id tidak ditemukan';
    }
    foreach(($sheets['Detail_WO']??[]) as $i=>$r)if(empty($r['wo_id'])||!isset($woIds[(string)$r['wo_id']]))$errors[]='Detail_WO baris '.($i+2).': wo_id tidak ditemukan';
    foreach(($sheets['Faktur']??[]) as $i=>$r)if(!empty($r['wo_id'])&&!isset($woIds[(string)$r['wo_id']]))$errors[]='Faktur baris '.($i+2).': wo_id tidak ditemukan';
    foreach(($sheets['Detail_Faktur']??[]) as $i=>$r)if(empty($r['invoice_id'])||!isset($invoiceIds[(string)$r['invoice_id']]))$errors[]='Detail_Faktur baris '.($i+2).': invoice_id tidak ditemukan';
    $paymentTotals=[];foreach(($sheets['Pembayaran']??[]) as $i=>$r){$invoice=(string)($r['invoice_id']??'');if(!$invoice||!isset($invoiceIds[$invoice]))$errors[]='Pembayaran baris '.($i+2).': invoice_id tidak ditemukan';$paymentTotals[$invoice]=($paymentTotals[$invoice]??0)+(float)($r['amount']??0);}
    foreach(($sheets['Faktur']??[]) as $i=>$r){$total=(float)($r['total']??0);$paid=$paymentTotals[(string)($r['id']??'')]??0;if($paid>$total+0.01)$errors[]='Faktur baris '.($i+2).': pembayaran melebihi total faktur';}
    foreach(['customers'=>'Pelanggan','vehicles'=>'Kendaraan','work_orders'=>'WO','sales_invoices'=>'Faktur','customer_payments'=>'Pembayaran'] as $table=>$name){
        if(empty($ids[$name]))continue;$placeholders=implode(',',array_fill(0,count($ids[$name]),'?'));$stmt=$pdo->prepare("SELECT id FROM {$table} WHERE id IN ({$placeholders})");$stmt->execute(array_keys($ids[$name]));$duplicates[$name]=count($stmt->fetchAll());
    }
    return ['valid'=>count($errors)===0,'errors'=>$errors,'warnings'=>$warnings,'counts'=>$counts,'existing'=>$duplicates,'existingTotal'=>array_sum($duplicates)];
};

if($method==='GET') respondSuccess(['generatedAt'=>date(DATE_ATOM),'sheets'=>$readBackup()]);
$input=getInput();$sheets=$input['sheets']??[];$report=$validate(is_array($sheets)?$sheets:[]);
if($method==='POST'&&$id==='preview')respondSuccess($report,$report['valid']?'File valid dan siap diimpor':'Validasi menemukan kesalahan');
if($method!=='POST'||$id!=='import')respondError('Endpoint tidak tersedia',404);
if(!$report['valid'])respondError('Import dibatalkan karena file tidak valid',422,json_encode($report['errors']));
$mode=($input['mode']??'insert')==='upsert'?'upsert':'insert';
if($mode==='insert'&&($report['existingTotal']??0)>0)respondError('Mode Tambah Baru dibatalkan karena ada ID yang sudah tersedia. Gunakan Perbarui Data atau perbaiki file.',422);
$pdo->exec("CREATE TABLE IF NOT EXISTS transaction_restore_snapshots(id VARCHAR(64) PRIMARY KEY,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,created_by VARCHAR(64),payload_json LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$snapshotId='restore-'.date('YmdHis').'-'.substr(generateId(),0,8);
$pdo->beginTransaction();
try{
    $pdo->prepare('INSERT INTO transaction_restore_snapshots(id,created_by,payload_json) VALUES(?,?,?)')->execute([$snapshotId,$requestUser['id']??null,json_encode($readBackup(),JSON_UNESCAPED_UNICODE)]);
    foreach($sheetTables as $sheet=>$table){
        $cols=$pdo->query("SHOW COLUMNS FROM {$table}")->fetchAll();$allowed=array_column($cols,'Field');$primary=[];foreach($cols as $c)if($c['Key']==='PRI')$primary[]=$c['Field'];
        foreach(($sheets[$sheet]??[]) as $row){
            $clean=array_intersect_key($row,array_flip($allowed));if(!$clean)continue;$names=array_keys($clean);$quoted=implode(',',array_map(fn($c)=>"`{$c}`",$names));$marks=implode(',',array_fill(0,count($names),'?'));
            $sql="INSERT INTO {$table} ({$quoted}) VALUES ({$marks})";
            if($mode==='upsert'){$updates=array_values(array_diff($names,$primary));if($updates)$sql.=' ON DUPLICATE KEY UPDATE '.implode(',',array_map(fn($c)=>"`{$c}`=VALUES(`{$c}`)",$updates));}
            $pdo->prepare($sql)->execute(array_map(fn($v)=>$v===''?null:$v,array_values($clean)));
        }
    }
    $pdo->commit();respondSuccess(['snapshotId'=>$snapshotId,'counts'=>$report['counts'],'totalRows'=>array_sum($report['counts']),'mode'=>$mode],'Restore transaksi berhasil');
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();respondError('Restore dibatalkan; database tidak berubah',422,$e->getMessage());}
