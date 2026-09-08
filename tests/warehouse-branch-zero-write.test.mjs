import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/scoped-zero-endpoints-runtime.php', import.meta.url));
function run(method, overrides = {}) {
  const input = { endpoint: 'warehouses', method, id: 'warehouse', memberships: ['0'], permissions: ['item:create', 'item:edit'], body: { branchId: '0', code: 'wh', name: 'Warehouse' }, ...overrides };
  const result = spawnSync(process.env.PHP_BINARY || 'php', [fixture, JSON.stringify(input)], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
for (const method of ['POST', 'PUT']) {
  test(`${method} accepts active branch zero and writes its exact identity`, () => {
    const result = run(method);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.committed, true);
    assert.equal(result.rolledBack, false);
    assert.equal(result.warehouses.length, 1);
    assert.equal(result.warehouses[0][method === 'POST' ? 4 : 3], '0');
    const branch = result.queries.find(q => q.sql === 'SELECT id FROM branches WHERE id=? AND is_active=1 FOR UPDATE');
    assert.deepEqual(branch.params, ['0']);
    assert.equal(branch.transaction, true);
  });
  for (const [name, overrides, status] of [
    ['missing branch', { missingBranch: true }, 404],
    ['inactive branch', { branchActive: 0 }, 404],
    ['unauthorized branch', { memberships: ['00'] }, 403],
    ['missing permission', { permissions: [] }, 403],
    ['inactive role', { roleActive: 0 }, 403],
  ]) test(`${method} rejects ${name} without writing`, () => {
    const result = run(method, overrides);
    assert.equal(result.status, status, JSON.stringify(result));
    assert.equal(result.committed, false);
    assert.deepEqual(result.warehouses, []);
    if (name !== 'unauthorized branch' || method === 'PUT') assert.equal(result.rolledBack, true);
  });
}
test('PUT cannot edit a warehouse in an unauthorized existing branch', () => {
  const result = run('PUT', { currentBranchId: '00' });
  assert.equal(result.status, 403, JSON.stringify(result));
  assert.deepEqual(result.warehouses, []);
  assert.equal(result.rolledBack, true);
});
