<?php
// LOGIN
if ($method !== 'POST') respondError('Method not allowed', 405);

$input = getInput();
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';

if (!$username || !$password) respondError('Username & password wajib diisi');

// Batasi brute-force per kombinasi username dan alamat IP. Nilai mengikuti
// Pengaturan > Keamanan dan otomatis kembali normal setelah 15 menit atau
// setelah login berhasil.
$maxLoginAttempts = 5;
try {
    $settingsRow = $pdo->query("SELECT settings_json FROM app_settings WHERE id = 1")->fetch();
    if ($settingsRow) {
        $settings = json_decode((string)$settingsRow['settings_json'], true);
        $maxLoginAttempts = max(3, min(10, (int)($settings['security']['maxLoginAttempts'] ?? 5)));
    }
} catch (Throwable $e) {
    // Gunakan nilai aman bawaan jika pengaturan belum tersedia.
}
$attemptStmt = $pdo->prepare("
    SELECT COUNT(*) FROM login_audit_logs failed
    WHERE failed.username = ? AND failed.ip_address = ?
      AND failed.event_type = 'login_failed'
      AND failed.created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
      AND failed.created_at > COALESCE((
          SELECT MAX(ok.created_at) FROM login_audit_logs ok
          WHERE ok.username = failed.username AND ok.ip_address = failed.ip_address
            AND ok.event_type = 'login_success'
      ), '1970-01-01 00:00:00')
");
$attemptStmt->execute([$username, requestIp()]);
if ((int)$attemptStmt->fetchColumn() >= $maxLoginAttempts) {
    writeLoginAudit($pdo, null, $username, 'login_blocked', 'Terlalu banyak percobaan login');
    respondError('Terlalu banyak percobaan login. Coba kembali dalam 15 menit.', 429);
}

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
    respondError('Username atau password salah', 401);
}

$storedPassword = (string)$user['password'];
$isHashed = str_starts_with($storedPassword, '$2y$') || str_starts_with($storedPassword, '$argon2');
$passwordValid = $isHashed ? password_verify($password, $storedPassword) : hash_equals($storedPassword, $password);
if (!$passwordValid) {
    writeLoginAudit($pdo,$user['id'],$username,'login_failed','Password salah');
    respondError('Username atau password salah', 401);
}
// Upgrade otomatis password lama (plain text) ketika login berhasil.
if (!$isHashed) {
    $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")
        ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
}

// Owner selalu bebas pembatasan. User lain mengikuti durasi/jadwal login.
$sessionHours=8;
$idleTimeoutMinutes=30;
$scheduleEnd=null;
if(empty($user['is_owner'])){
    $ruleStmt=$pdo->prepare("SELECT * FROM user_login_rules WHERE user_id=?");$ruleStmt->execute([$user['id']]);$rule=$ruleStmt->fetch();
    if($rule){
        $sessionHours=max(1,min(24,(int)$rule['session_hours']));
        $idleTimeoutMinutes=max(0,min(240,(int)($rule['idle_timeout_minutes']??30)));
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
$user['idleTimeoutMinutes'] = empty($user['is_owner']) ? $idleTimeoutMinutes : 0;

respondSuccess($user, 'Login berhasil');
