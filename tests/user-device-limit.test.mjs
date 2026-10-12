import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('aturan user mendukung durasi, jadwal, dan sesi login', () => {
  const helpers = source('api/helpers.php');
  const router = source('api/index.php');
  const endpoint = source('api/endpoints/user-sessions.php');
  const ui = source('src/components/UserSessionsTab.tsx');

  assert.match(helpers, /max_devices TINYINT UNSIGNED NOT NULL DEFAULT 2/);
  assert.match(router, /api_support_20260830_device_limits_v1/);
  assert.match(endpoint, /max\(1,min\(2,\(int\)\(\$d\['maxDevices'\]/);
  assert.match(ui, /Login baru selalu diterima dan otomatis mengeluarkan sesi lama akun ini/);
  assert.match(ui, /maxDevices:2/);
});

test('login memakai identitas perangkat dan menolak perangkat melebihi kuota', () => {
  const helpers = source('api/helpers.php');
  const auth = source('api/endpoints/auth.php');

  assert.match(helpers, /device_hash CHAR\(64\)/);
  assert.match(auth, /\$_COOKIE\['drac_device'\]/);
  assert.match(auth, /device_hash\) VALUES/);
  assert.match(auth, /UPDATE api_sessions SET revoked_at=NOW\(\) WHERE user_id=\?/);
  assert.match(auth, /SELECT id FROM users WHERE id=\? FOR UPDATE/);
});
