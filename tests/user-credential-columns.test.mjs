import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('daftar pengguna menampilkan username dan password bertopeng dengan aksi reset', () => {
  const page = source('src/pages/UsersAndRoles.tsx');

  assert.match(page, /<span>Username<\/span>/);
  assert.match(page, /<span>Password<\/span>/);
  assert.match(page, /\{user\.username\}/);
  assert.match(page, /••••••••/);
  assert.match(page, /title="Atur ulang password"/);
  assert.match(page, /onClick=\{\(\)=>\{setPasswordUser\(user\);setNewPassword\(''\)\}\}/);
  assert.doesNotMatch(page, /\{user\.password\}/);
});

test('API pengguna tidak pernah mengirim password dan tetap menyimpan hash', () => {
  const endpoint = source('api/endpoints/users.php');
  const allData = source('api/endpoints/all-data.php');

  assert.match(endpoint, /unset\(\$row\['password'\]\)/);
  assert.match(allData, /unset\(\$r\['password'\]\)/);
  assert.match(endpoint, /password_hash\(\$newPassword, PASSWORD_DEFAULT\)/);
  assert.match(endpoint, /password_hash\(\$d\['password'\], PASSWORD_DEFAULT\)/);
});

test('endpoint daftar pengguna memeriksa user:view sebelum membaca akun', () => {
  const endpoint = source('api/endpoints/users.php');
  const getBlock = endpoint.match(/case 'GET':([\s\S]*?)break;/)?.[1] ?? '';

  const permissionCheck = getBlock.indexOf("requireAuthenticatedUserPermission($pdo, $actor, 'user:view')");
  const accountQuery = getBlock.indexOf('SELECT u.*');
  assert.ok(permissionCheck >= 0, 'GET /users wajib memeriksa user:view');
  assert.ok(permissionCheck < accountQuery, 'izin user:view wajib diperiksa sebelum query akun');
});
