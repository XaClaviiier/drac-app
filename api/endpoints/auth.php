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

// Simple password check (untuk production, gunakan password_verify + password_hash)
if ($user['password'] !== $password) {
    respondError('Password salah', 401);
}

// Update last login
$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);

// Remove password from response
unset($user['password']);
$user['roleName'] = $user['role_name'];
$user['roleId'] = $user['role_id'];
$user['branchName'] = $user['branch_name'];
$user['branchId'] = $user['branch_id'];
$user['isActive'] = (bool)$user['is_active'];
$user['isOwner'] = (bool)($user['is_owner'] ?? false);
$user['isProtected'] = (bool)($user['is_protected'] ?? false);

respondSuccess($user, 'Login berhasil');
