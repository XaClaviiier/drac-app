<?php
// LOGIN
if ($method !== 'POST') respondError('Method not allowed', 405);

$input = getInput();
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';

if (!$username || !$password) respondError('Username & password wajib diisi');

$stmt = $pdo->prepare("
    SELECT u.*, r.name as role_name, r.permissions, b.name as branch_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE u.username = ? AND u.is_active = 1
");
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user) {
    writeLoginAudit($pdo,null,$username,'login_failed','Username tidak ditemukan');
    respondError('Username tidak ditemukan', 401);
}

$storedPassword = (string)$user['password'];
$isHashed = str_starts_with($storedPassword, '$2y$') || str_starts_with($storedPassword, '$argon2');
$passwordValid = $isHashed ? password_verify($password, $storedPassword) : hash_equals($storedPassword, $password);
if (!$passwordValid) {
    writeLoginAudit($pdo,$user['id'],$username,'login_failed','Password salah');
    respondError('Password salah', 401);
}
// Upgrade otomatis password lama (plain text) ketika login berhasil.
if (!$isHashed) {
    $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")
        ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
}

// Owner selalu bebas pembatasan. User lain mengikuti durasi/jadwal login.
$sessionHours=8;
$scheduleEnd=null;
if(empty($user['is_owner'])){
    $ruleStmt=$pdo->prepare("SELECT * FROM user_login_rules WHERE user_id=?");$ruleStmt->execute([$user['id']]);$rule=$ruleStmt->fetch();
    if($rule){
        $sessionHours=max(1,min(24,(int)$rule['session_hours']));
        if($rule['schedule_mode']==='custom'){
            $tz=new DateTimeZone('Asia/Makassar');$now=new DateTime('now',$tz);$schedule=json_decode($rule['schedule_json']??'[]',true)?:[];$day=(string)$now->format('N');$today=$schedule[$day]??null;
            if(!$today||empty($today['enabled'])){writeLoginAudit($pdo,$user['id'],$username,'login_blocked','Login di luar hari kerja');respondError('Login tidak diizinkan pada hari ini',403);}
            $start=DateTime::createFromFormat('Y-m-d H:i',$now->format('Y-m-d').' '.($today['start']??'00:00'),$tz);
            $end=DateTime::createFromFormat('Y-m-d H:i',$now->format('Y-m-d').' '.($today['end']??'23:59'),$tz);
            if(!$start||!$end||$now<$start||$now>$end){writeLoginAudit($pdo,$user['id'],$username,'login_blocked','Login di luar jam kerja');respondError('Login hanya diizinkan pukul '.($today['start']??'-').'–'.($today['end']??'-').' WITA',403);}
            if(!empty($rule['auto_logout']))$scheduleEnd=$end;
        }
        if(!empty($rule['single_device']))$pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL")->execute([$user['id']]);
    }
}

// Update last login
$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);
$token = bin2hex(random_bytes(32));
$pdo->prepare("DELETE FROM api_sessions WHERE expires_at <= NOW()")->execute();
$expiresAt=(new DateTime('now',new DateTimeZone('Asia/Makassar')))->modify("+{$sessionHours} hours");
if($scheduleEnd&&$scheduleEnd<$expiresAt)$expiresAt=$scheduleEnd;
$pdo->prepare("INSERT INTO api_sessions (token_hash,user_id,expires_at,last_activity,ip_address,user_agent) VALUES(?,?,?,NOW(),?,?)")
    ->execute([hash('sha256',$token),$user['id'],$expiresAt->format('Y-m-d H:i:s'),requestIp(),requestUserAgent()]);
writeLoginAudit($pdo,$user['id'],$username,'login_success','Login berhasil');

// Remove password from response
unset($user['password']);
$user['roleName'] = $user['role_name'];
$user['roleId'] = $user['role_id'];
$user['branchName'] = $user['branch_name'];
$user['branchId'] = $user['branch_id'];
$user['branchIds'] = getUserBranchIds($pdo, $user['id']);
$user['isActive'] = (bool)$user['is_active'];
$user['isOwner'] = (bool)($user['is_owner'] ?? false);
$user['isProtected'] = (bool)($user['is_protected'] ?? false);
$user['apiToken'] = $token;
$user['sessionExpiresAt'] = $expiresAt->format('Y-m-d H:i:s');

respondSuccess($user, 'Login berhasil');
