<?php
$actor = requireUserPermission($pdo, 'report:view');

function bonusPeriodRange(string $period): array {
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) throw new InvalidArgumentException('Periode bonus tidak valid.');
    $start = $period . '-01';
    $end = date('Y-m-t', strtotime($start));
    return [$start, $end];
}

function bonusMetricValue(array $row, string $metric): float {
    return (float)($row[$metric] ?? 0);
}

function buildBonusCalculation(PDO $pdo, string $period, string $branchId, float $pool): array {
    [$start, $end] = bonusPeriodRange($period);
    $users = $pdo->prepare("SELECT u.id,u.name,COALESCE(r.name,'') role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.is_active=1 AND COALESCE(u.is_owner,0)=0 AND (u.branch_id=? OR EXISTS(SELECT 1 FROM user_branch_access uba WHERE uba.user_id=u.id AND uba.branch_id=?)) AND (EXISTS(SELECT 1 FROM technician_attendance ta WHERE ta.user_id=u.id AND ta.branch_id=? AND ta.attendance_date BETWEEN ? AND ?) OR EXISTS(SELECT 1 FROM work_orders w WHERE w.technician_id=u.id AND w.branch_id=? AND w.date BETWEEN ? AND ?)) ORDER BY u.name");
    $users->execute([$branchId,$branchId,$branchId,$start,$end,$branchId,$start,$end]);
    $technicians = $users->fetchAll();

    $rulesStmt = $pdo->prepare("SELECT * FROM bonus_rules WHERE is_active=1 AND (branch_id IS NULL OR branch_id='' OR branch_id=?) AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>=?) ORDER BY created_at,id");
    $rulesStmt->execute([$branchId,$end,$start]);
    $rules = $rulesStmt->fetchAll();
    $rows = [];
    foreach ($technicians as $technician) {
        $userId = (string)$technician['id'];
        $attendance = $pdo->prepare("SELECT SUM(status='Hadir') attendance_days,SUM(status='Alpha') absence_days,COALESCE(SUM(late_minutes),0) late_minutes FROM technician_attendance WHERE user_id=? AND branch_id=? AND attendance_date BETWEEN ? AND ?");
        $attendance->execute([$userId,$branchId,$start,$end]);
        $metrics = $attendance->fetch() ?: [];
        $wo = $pdo->prepare("SELECT COUNT(*) completed_work_orders FROM work_orders WHERE technician_id=? AND branch_id=? AND date BETWEEN ? AND ? AND status='Selesai'");
        $wo->execute([$userId,$branchId,$start,$end]);
        $metrics['completed_work_orders'] = (float)$wo->fetchColumn();
        $revenue = $pdo->prepare("SELECT COALESCE(SUM(p.amount),0) FROM customer_payments p JOIN sales_invoices i ON i.id COLLATE utf8mb4_unicode_ci=p.invoice_id COLLATE utf8mb4_unicode_ci JOIN work_orders w ON w.id COLLATE utf8mb4_unicode_ci=i.wo_id COLLATE utf8mb4_unicode_ci WHERE w.technician_id=? AND p.branch_id=? AND p.date BETWEEN ? AND ?");
        $revenue->execute([$userId,$branchId,$start,$end]);
        $metrics['paid_revenue'] = (float)$revenue->fetchColumn();
        foreach (['attendance_days','absence_days','late_minutes'] as $key) $metrics[$key] = (float)($metrics[$key] ?? 0);

        $points = 0.0; $fixed = 0.0; $details = [];
        foreach ($rules as $rule) {
            $metricValue = bonusMetricValue($metrics,(string)$rule['metric']);
            $threshold = (float)$rule['threshold_value'];
            $operator = (string)$rule['operator_symbol'];
            $matched = $operator === 'lte' ? $metricValue <= $threshold : ($operator === 'eq' ? $metricValue == $threshold : $metricValue >= $threshold);
            $units = 0.0;
            if ($rule['calculation_mode'] === 'threshold') $units = $matched ? 1 : 0;
            elseif ((string)$rule['metric'] === 'paid_revenue' && $threshold > 0) $units = floor($metricValue / $threshold);
            elseif ((string)$rule['metric'] === 'late_minutes' && $threshold > 0) $units = floor($metricValue / $threshold);
            else $units = $metricValue;
            $result = $units * (float)$rule['result_value'];
            if ($rule['result_type'] === 'fixed') $fixed += $result; else $points += $result;
            $details[] = ['ruleId'=>$rule['id'],'name'=>$rule['name'],'metric'=>$rule['metric'],'metricValue'=>$metricValue,'units'=>$units,'resultType'=>$rule['result_type'],'result'=>$result];
        }
        $rows[] = ['userId'=>$userId,'userName'=>$technician['name'],'roleName'=>$technician['role_name'],'metrics'=>$metrics,'points'=>max(0,$points),'rawPoints'=>$points,'fixedBonus'=>max(0,$fixed),'ruleDetails'=>$details];
    }
    $totalPoints = array_sum(array_column($rows,'points'));
    $totalFixed = array_sum(array_column($rows,'fixedBonus'));
    $distributable = max(0,$pool-$totalFixed);
    foreach ($rows as &$row) {
        $row['poolBonus'] = $totalPoints > 0 ? round($distributable * $row['points'] / $totalPoints) : 0;
        $row['bonus'] = round($row['fixedBonus'] + $row['poolBonus']);
    }
    unset($row);
    return ['period'=>$period,'branchId'=>$branchId,'bonusPool'=>$pool,'totalPoints'=>$totalPoints,'totalFixed'=>$totalFixed,'totalBonus'=>array_sum(array_column($rows,'bonus')),'technicians'=>$rows];
}

function performancePayload(PDO $pdo, string $period, string $branchId, array $actor): array {
    [$start,$end] = bonusPeriodRange($period);
    $users = $pdo->prepare("SELECT u.id,u.name,COALESCE(r.name,'') roleName,u.branch_id branchId FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.is_active=1 AND COALESCE(u.is_owner,0)=0 AND (?='ALL' OR u.branch_id=? OR EXISTS(SELECT 1 FROM user_branch_access uba WHERE uba.user_id=u.id AND uba.branch_id=?)) ORDER BY u.name");
    $users->execute([$branchId,$branchId,$branchId]);
    $attendance = $pdo->prepare("SELECT id,attendance_date attendanceDate,user_id userId,user_name userName,branch_id branchId,status,check_in checkIn,check_out checkOut,late_minutes lateMinutes,notes FROM technician_attendance WHERE attendance_date BETWEEN ? AND ? AND (?='ALL' OR branch_id=?) ORDER BY attendance_date DESC,user_name");
    $attendance->execute([$start,$end,$branchId,$branchId]);
    $rulesStmt = $pdo->prepare("SELECT id,name,metric,calculation_mode calculationMode,operator_symbol operatorSymbol,threshold_value thresholdValue,result_type resultType,result_value resultValue,branch_id branchId,is_active isActive,valid_from validFrom,valid_until validUntil FROM bonus_rules WHERE (?='ALL' OR branch_id IS NULL OR branch_id='' OR branch_id=?) ORDER BY is_active DESC,created_at,id");
    $rulesStmt->execute([$branchId,$branchId]);
    $rules = $rulesStmt->fetchAll();
    foreach ($rules as &$rule) { $rule['thresholdValue']=(float)$rule['thresholdValue'];$rule['resultValue']=(float)$rule['resultValue'];$rule['isActive']=(bool)$rule['isActive']; } unset($rule);
    $runs = $pdo->prepare("SELECT r.*,b.name branch_name FROM bonus_runs r LEFT JOIN branches b ON b.id=r.branch_id WHERE (?='ALL' OR r.branch_id=?) ORDER BY r.period DESC,r.created_at DESC");
    $runs->execute([$branchId,$branchId]);
    $runRows=$runs->fetchAll();
    foreach($runRows as &$run){$run['branchId']=$run['branch_id'];$run['branchName']=$run['branch_name'];$run['bonusPool']=(float)$run['bonus_pool'];$run['totalPoints']=(float)$run['total_points'];$run['totalBonus']=(float)$run['total_bonus'];$run['createdByName']=$run['created_by_name'];$run['snapshot']=json_decode($run['snapshot_json'],true);unset($run['snapshot_json']);}unset($run);

    $daily=[];
    $wo=$pdo->prepare("SELECT date,COUNT(*) vehicles,SUM(status='Selesai') completed,COALESCE(SUM(total),0) wo_value FROM work_orders WHERE date BETWEEN ? AND ? AND (?='ALL' OR branch_id=?) GROUP BY date");$wo->execute([$start,$end,$branchId,$branchId]);
    $emptyDay=fn($date)=>['date'=>$date,'vehicles'=>0,'completed'=>0,'woValue'=>0,'invoiceValue'=>0,'paid'=>0,'cashReceived'=>0,'deposited'=>0,'unsubmittedDaily'=>0,'technicians'=>[]];
    foreach($wo->fetchAll() as $row){$daily[$row['date']]=$emptyDay($row['date']);$daily[$row['date']]['vehicles']=(int)$row['vehicles'];$daily[$row['date']]['completed']=(int)$row['completed'];$daily[$row['date']]['woValue']=(float)$row['wo_value'];}
    $invoice=$pdo->prepare("SELECT date,COALESCE(SUM(total),0) invoice_value FROM sales_invoices WHERE date BETWEEN ? AND ? AND (?='ALL' OR branch_id=?) GROUP BY date");$invoice->execute([$start,$end,$branchId,$branchId]);foreach($invoice->fetchAll() as $row){$daily[$row['date']]=$daily[$row['date']]??$emptyDay($row['date']);$daily[$row['date']]['invoiceValue']=(float)$row['invoice_value'];}
    $payments=$pdo->prepare("SELECT date,COALESCE(SUM(amount),0) paid,COALESCE(SUM(CASE WHEN payment_method='Tunai' THEN amount ELSE 0 END),0) cash_received FROM customer_payments WHERE date BETWEEN ? AND ? AND (?='ALL' OR branch_id=?) GROUP BY date");$payments->execute([$start,$end,$branchId,$branchId]);foreach($payments->fetchAll() as $row){$daily[$row['date']]=$daily[$row['date']]??$emptyDay($row['date']);$daily[$row['date']]['paid']=(float)$row['paid'];$daily[$row['date']]['cashReceived']=(float)$row['cash_received'];}
    $deposits=$pdo->prepare("SELECT date,COALESCE(SUM(amount),0) deposited FROM branch_deposits WHERE date BETWEEN ? AND ? AND status IN ('Dikirim','Terverifikasi') AND (?='ALL' OR branch_id=?) GROUP BY date");$deposits->execute([$start,$end,$branchId,$branchId]);foreach($deposits->fetchAll() as $row){$daily[$row['date']]=$daily[$row['date']]??$emptyDay($row['date']);$daily[$row['date']]['deposited']=(float)$row['deposited'];}
    $present=$pdo->prepare("SELECT attendance_date,user_name FROM technician_attendance WHERE attendance_date BETWEEN ? AND ? AND status='Hadir' AND (?='ALL' OR branch_id=?) ORDER BY user_name");$present->execute([$start,$end,$branchId,$branchId]);foreach($present->fetchAll() as $row){$daily[$row['attendance_date']]=$daily[$row['attendance_date']]??$emptyDay($row['attendance_date']);$daily[$row['attendance_date']]['technicians'][]=$row['user_name'];}
    foreach($daily as &$day)$day['unsubmittedDaily']=max(0,$day['cashReceived']-$day['deposited']);unset($day);
    krsort($daily);
    return ['period'=>$period,'users'=>$users->fetchAll(),'attendance'=>$attendance->fetchAll(),'rules'=>$rules,'runs'=>$runRows,'daily'=>array_values($daily),'depositSummary'=>branchCashSummary($pdo,$actor),'calculation'=>$branchId==='ALL'?null:buildBonusCalculation($pdo,$period,$branchId,0)];
}

try {
    if ($method === 'GET') {
        $period=$_GET['period']??date('Y-m');$branchId=$_GET['branchId']??'ALL';
        if ($branchId === 'ALL') {
            requireUserPermission($pdo, 'all_branches');
        } else {
            requireAccessibleBranch($pdo, $actor, $branchId);
        }
        respondSuccess(performancePayload($pdo,$period,$branchId,$actor));
    }
    if ($method === 'POST') {
        $d=getInput();$type=$d['type']??'';
        if ($type==='attendance') {
            requireAccessibleBranch($pdo,$actor,(string)($d['branchId']??''));
            $user=$pdo->prepare("SELECT name FROM users WHERE id=? AND is_active=1");$user->execute([$d['userId']??'']);$name=$user->fetchColumn();if(!$name)throw new InvalidArgumentException('Pengguna tidak ditemukan.');
            $rowId=generateId();$stmt=$pdo->prepare("INSERT INTO technician_attendance(id,attendance_date,user_id,user_name,branch_id,status,check_in,check_out,late_minutes,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),check_in=VALUES(check_in),check_out=VALUES(check_out),late_minutes=VALUES(late_minutes),notes=VALUES(notes),updated_at=NOW()");
            $stmt->execute([$rowId,$d['attendanceDate'],$d['userId'],$name,$d['branchId'],$d['status']??'Hadir',($d['checkIn']??'')?:null,($d['checkOut']??'')?:null,max(0,(int)($d['lateMinutes']??0)),($d['notes']??'')?:null,$actor['id']??null]);respondSuccess(null,'Kehadiran disimpan');
        }
        if ($type==='rule') {
            requireUserPermission($pdo,'settings:edit');$ruleBranch=($d['branchId']??'')?:null;if($ruleBranch)requireAccessibleBranch($pdo,$actor,(string)$ruleBranch);$ruleId=generateId();$stmt=$pdo->prepare("INSERT INTO bonus_rules(id,name,metric,calculation_mode,operator_symbol,threshold_value,result_type,result_value,branch_id,is_active,valid_from,valid_until,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");$stmt->execute([$ruleId,$d['name'],$d['metric'],$d['calculationMode']??'per_unit',$d['operatorSymbol']??'gte',(float)($d['thresholdValue']??0),$d['resultType']??'points',(float)($d['resultValue']??0),$ruleBranch,!empty($d['isActive'])?1:0,($d['validFrom']??'')?:null,($d['validUntil']??'')?:null,$actor['id']??null]);respondSuccess(['id'=>$ruleId],'Rule bonus dibuat');
        }
        if ($type==='calculate') {
            if (($d['branchId']??'ALL')==='ALL') throw new InvalidArgumentException('Pilih satu cabang untuk menghitung bonus.');
            requireAccessibleBranch($pdo,$actor,(string)$d['branchId']);
            $calc=buildBonusCalculation($pdo,$d['period'],$d['branchId'],max(0,(float)($d['bonusPool']??0)));$runId=generateId();$pdo->prepare("INSERT INTO bonus_runs(id,period,branch_id,bonus_pool,total_points,total_bonus,status,snapshot_json,created_by,created_by_name) VALUES(?,?,?,?,?,?,'Draft',?,?,?)")->execute([$runId,$d['period'],$d['branchId'],$calc['bonusPool'],$calc['totalPoints'],$calc['totalBonus'],json_encode($calc),$actor['id']??null,$actor['name']??null]);respondSuccess(['id'=>$runId,'calculation'=>$calc],'Perhitungan bonus disimpan sebagai Draft');
        }
        respondError('Jenis data tidak valid',422);
    }
    if ($method === 'PUT') {
        if(!$id)respondError('ID wajib',422);$d=getInput();$type=$d['type']??'';
        if($type==='rule'){requireUserPermission($pdo,'settings:edit');$ruleBranch=($d['branchId']??'')?:null;if($ruleBranch)requireAccessibleBranch($pdo,$actor,(string)$ruleBranch);$pdo->prepare("UPDATE bonus_rules SET name=?,metric=?,calculation_mode=?,operator_symbol=?,threshold_value=?,result_type=?,result_value=?,branch_id=?,is_active=?,valid_from=?,valid_until=? WHERE id=?")->execute([$d['name'],$d['metric'],$d['calculationMode'],$d['operatorSymbol'],(float)$d['thresholdValue'],$d['resultType'],(float)$d['resultValue'],$ruleBranch,!empty($d['isActive'])?1:0,($d['validFrom']??'')?:null,($d['validUntil']??'')?:null,$id]);respondSuccess(null,'Rule bonus diperbarui');}
        if($type==='runStatus'){if(empty($actor['is_owner']))respondError('Hanya Owner dapat menyetujui atau membayar bonus',403);$status=$d['status']??'';if(!in_array($status,['Disetujui','Dibayar'],true))throw new InvalidArgumentException('Status tidak valid.');$pdo->prepare("UPDATE bonus_runs SET status=?,approved_by_name=IF(?='Disetujui',?,approved_by_name),approved_at=IF(?='Disetujui',NOW(),approved_at),paid_at=IF(?='Dibayar',NOW(),paid_at) WHERE id=?")->execute([$status,$status,$actor['name']??null,$status,$status,$id]);respondSuccess(null,'Status bonus diperbarui');}
        respondError('Jenis data tidak valid',422);
    }
    if ($method === 'DELETE') {
        if(!$id)respondError('ID wajib',422);requireUserPermission($pdo,'settings:edit');
        $pdo->prepare("DELETE FROM technician_attendance WHERE id=?")->execute([$id]);
        $pdo->prepare("DELETE FROM bonus_rules WHERE id=? AND id NOT LIKE 'BONUS-%'")->execute([$id]);
        respondSuccess(null,'Data dihapus');
    }
    respondError('Method not allowed',405);
} catch (InvalidArgumentException $e) { respondError($e->getMessage(),422); }
