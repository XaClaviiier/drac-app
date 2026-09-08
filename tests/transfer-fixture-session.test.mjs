import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = readFileSync(new URL('./fixtures/warehouse-transfer-persisted-quantity.php', import.meta.url), 'utf8');
const router = readFileSync(new URL('../api/index.php', import.meta.url), 'utf8');

test('transfer fixture writes session timestamps in the same MySQL timezone as the API', () => {
  const timezoneStatement = router.match(/\$pdo->exec\("SET time_zone = '[^']+'"\);/)?.[0];
  assert.ok(timezoneStatement, 'API must explicitly configure its MySQL session timezone');
  const timezoneIndex = fixture.indexOf(timezoneStatement);
  const sessionIndex = fixture.indexOf('INSERT INTO api_sessions');
  assert.ok(timezoneIndex >= 0 && timezoneIndex < sessionIndex,
    'Fixture must set the API MySQL timezone before writing NOW()-based session expiry');
});
