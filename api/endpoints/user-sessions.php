<?php
$actor=requireOwner($pdo);

if($method==='GET'){
    $sessions=$pdo->query("
        SELECT s.token_hash session_id,s.user_id,s.expires_at,s.created_at,s.last_activity,s.ip_address,s.user_agent,
               u.name,u.username,u.is_owner,b.name branch_name
        FROM api_sessions s JOIN users u ON u.id=s.user_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN branches b ON b.id=u.branch_id
        WHERE s.revoked_at IS NULL AND s.expires_at>NOW()
        ORDER BY s.last_activity DESC,s.created_at DESC
    ")->fetchAll();
    foreach($sessions as &$s){
        $s['sessionId']=$s['session_id'];$s['userId']=$s['user_id'];$s['branchName']=$s['branch_name'];
        $s['expiresAt']=$s['expires_at'];$s['createdAt']=$s['created_at'];$s['lastActivity']=$s['last_activity'];
        $s['ipAddress']=$s['ip_address'];$s['userAgent']=$s['user_agent'];$s['isOwner']=(bool)$s['is_owner'];
        $s['status']=strtotime($s['last_activity']??$s['created_at'])>=time()-300?'online':'idle';
    }
    $rules=$pdo->query("SELECT * FROM user_login_rules")->fetchAll();
    foreach($rules as &$r){$r['userId']=$r['user_id'];$r['sessionHours']=(int)$r['session_hours'];$r['scheduleMode']=$r['schedule_mode'];$r['schedule']=$r['schedule_json']?json_decode($r['schedule_json'],true):[];$r['maxDevices']=max(1,min(2,(int)($r['max_devices']??(!empty($r['single_device'])?1:2))));$r['autoLogout']=(bool)$r['auto_logout'];$r['idleTimeoutMinutes']=(int)$r['idle_timeout_minutes'];}
    $logs=$pdo->query("SELECT * FROM login_audit_logs ORDER BY created_at DESC LIMIT 100")->fetchAll();
    foreach($logs as &$l){$l['userId']=$l['user_id'];$l['eventType']=$l['event_type'];$l['ipAddress']=$l['ip_address'];$l['userAgent']=$l['user_agent'];$l['createdAt']=$l['created_at'];}
    respondSuccess(['sessions'=>$sessions,'rules'=>$rules,'logs'=>$logs]);
}

if($method==='PUT'&&$action==='rules'){
    if(!$id)respondError('User wajib dipilih');
    $d=getInput();$target=$pdo->prepare("SELECT is_owner FROM users WHERE id=?");$target->execute([$id]);
    if($target->fetchColumn())respondError('Owner Utama tidak dapat dibatasi',403);
    $hours=max(1,min(24,(int)($d['sessionHours']??8)));$mode=($d['scheduleMode']??'unrestricted')==='custom'?'custom':'unrestricted';
    $idle=max(0,min(240,(int)($d['idleTimeoutMinutes']??30)));
    $maxDevices=max(1,min(2,(int)($d['maxDevices']??2)));
    $pdo->prepare("INSERT INTO user_login_rules(user_id,session_hours,schedule_mode,schedule_json,single_device,max_devices,auto_logout,idle_timeout_minutes) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE session_hours=VALUES(session_hours),schedule_mode=VALUES(schedule_mode),schedule_json=VALUES(schedule_json),single_device=VALUES(single_device),max_devices=VALUES(max_devices),auto_logout=VALUES(auto_logout),idle_timeout_minutes=VALUES(idle_timeout_minutes)")
        ->execute([$id,$hours,$mode,json_encode($d['schedule']??[],JSON_UNESCAPED_UNICODE),$maxDevices===1?1:0,$maxDevices,!empty($d['autoLogout'])?1:0,$idle]);
    respondSuccess(null,'Aturan login disimpan');
}

if($method==='DELETE'){
    if(!$id)respondError('Sesi wajib dipilih');
    $stmt=$pdo->prepare("SELECT s.user_id,u.username,u.is_owner FROM api_sessions s JOIN users u ON u.id=s.user_id COLLATE utf8mb4_unicode_ci WHERE s.token_hash=?");$stmt->execute([$id]);$session=$stmt->fetch();
    if(!$session)respondError('Sesi tidak ditemukan',404);
    if($session['is_owner'])respondError('Sesi Owner Utama tidak dapat diputus',403);
    $pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE token_hash=?")->execute([$id]);
    writeLoginAudit($pdo,$session['user_id'],$session['username'],'session_revoked','Diputus oleh '.$actor['username']);
    respondSuccess(null,'Sesi pengguna berhasil diputus');
}
respondError('Method not allowed',405);
