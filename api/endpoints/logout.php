<?php
if($method!=='POST')respondError('Method not allowed',405);
$user=requireAuthenticatedUser($pdo);
$hash=hash('sha256',getBearerToken());
$pdo->prepare("UPDATE api_sessions SET revoked_at=NOW() WHERE token_hash=?")->execute([$hash]);
writeLoginAudit($pdo,$user['id'],$user['username'],'logout','Logout oleh pengguna');
respondSuccess(null,'Logout berhasil');
