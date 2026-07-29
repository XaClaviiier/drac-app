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

if (!$user) respondError('Username tidak ditemukan', 401);

$storedPassword = (string)$user['password'];
$isHashed = str_starts_with($storedPassword, '$2y$') || str_starts_with($storedPassword, '$argon2');
$passwordValid = $isHashed ? password_verify($password, $storedPassword) : hash_equals($storedPassword, $password);
if (!$passwordValid) {
    respondError('Password salah', 401);
}
// Upgrade otomatis password lama (plain text) ketika login berhasil.
if (!$isHashed) {
    $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")
        ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
}

// Update last login
$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);
$token = bin2hex(random_bytes(32));
$pdo->prepare("DELETE FROM api_sessions WHERE expires_at <= NOW()")->execute();
$pdo->prepare("INSERT INTO api_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))")
    ->execute([hash('sha256', $token), $user['id']]);

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

respondSuccess($user, 'Login berhasil');
