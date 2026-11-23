import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('item minimum survives API create, update, bootstrap migration and reload', {
  skip: process.env.DRAC_ITEM_MINIMUM_TEST_MYSQL_PORT ? false : 'Set DRAC_ITEM_MINIMUM_TEST_MYSQL_PORT to a disposable local MySQL port',
}, () => {
  const output = execFileSync('php', ['tests/fixtures/item-minimum-stock-mysql.php'], { encoding: 'utf8', timeout: 120000 });
  const result = JSON.parse(output);
  assert.equal(result.success, true);
  assert.ok(result.checks >= 30, output);
});
