<?php
if($method!=='POST')respondError('Method not allowed',405);
$user=requireAuthenticatedUser($pdo);
$hash=hash('sha256',getBearerToken());
$pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE token_hash=?")->execute([$hash]);
setcookie('drac_session', '', [
    'expires' => time() - 3600,
    'path' => '/',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0])) === 'https',
    'httponly' => true,
    'samesite' => 'Lax',
]);
writeLoginAudit($pdo,$user['id'],$user['username'],'logout','Logout oleh pengguna');
respondSuccess(null,'Logout berhasil');
