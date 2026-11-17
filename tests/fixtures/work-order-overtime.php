<?php
require __DIR__.'/../../api/work-order-overtime.php';
$actor = ['id'=>'U1','name'=>'Operator'];
$normal = new DateTimeImmutable('2026-11-01T10:00:00+08:00');
$night = new DateTimeImmutable('2026-11-01T18:00:00+08:00');
$result = [];
foreach ([['normalRejected','Proses','working',$normal], ['waitingRejected','Proses','parts',$night], ['completedRejected','Selesai','working',$night]] as [$key,$status,$stage,$now]) {
    try { appendWorkOrderOverTime([], $status, $stage, false, 'start', $actor, $now); $result[$key] = false; }
    catch (DomainException $error) { $result[$key] = true; }
}
$logs = appendWorkOrderOverTime([], 'Proses', 'working', false, 'start', $actor, $night);
$result['active'] = workOrderOverTimeActive($logs, $night);
$result['nextMorning'] = workOrderOverTimeActive($logs, new DateTimeImmutable('2026-11-02T08:00:00+08:00'));
$logs = appendWorkOrderOverTime($logs, 'Proses', 'working', false, 'start', $actor, $night);
$result['oneStart'] = count($logs);
$stop = new DateTimeImmutable('2026-11-01T20:00:00+08:00');
$logs = appendWorkOrderOverTime($logs, 'Proses', 'working', false, 'stop', $actor, $stop);
$logs = appendWorkOrderOverTime($logs, 'Proses', 'working', false, 'stop', $actor, $stop);
$result['oneStop'] = count($logs);
$result['actor'] = $logs[0]['byUserId'];
$result['ended'] = workOrderOverTimeActive($logs, $stop);
echo json_encode($result);
