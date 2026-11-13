<?php
if($method!=='GET')respondError('Method not allowed',405);
$from=trim((string)($_GET['from']??date('Y-m-01')));
$to=trim((string)($_GET['to']??date('Y-m-d')));
$branchId=trim((string)($_GET['branchId']??''));
foreach([$from,$to] as $date) {
    $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$parsed||$parsed->format('Y-m-d')!==$date)respondError('Tanggal laporan tidak valid',422);
}
if($from>$to)respondError('Rentang tanggal tidak valid',422);
$pdo->beginTransaction();
try {
    $report=cashLedgerReport($pdo,$requestUser,$from,$to,$branchId);
    $pdo->commit();respondSuccess($report);
} catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
