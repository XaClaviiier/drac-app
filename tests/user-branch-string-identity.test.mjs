import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/user-branch-string-identity.php', import.meta.url));
function run(input) {
  const result = spawnSync(process.env.PHP_BINARY || 'php', [fixture, JSON.stringify(input)], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
const active = ids => ids.map(id => ({ id, is_active: 1 }));

test('normalization retains numeric branch 123 as a string', () => {
  assert.deepEqual(run({ branchIds: ['123'] }), { ids: ['123'], sql: null, params: null });
});
test('real strict validator accepts normalized active numeric branch 123', () => {
  const result = run({ branchIds: ['123'], validate: true, rows: active(['123']) });
  assert.deepEqual(result.ids, ['123'], JSON.stringify(result));
  assert.deepEqual(result.params, ['123']);
  assert.equal(result.sql, 'SELECT id,is_active FROM branches WHERE id IN (?) ORDER BY id FOR UPDATE');
});

for (const [name, branchIds, primaryBranchId, expected] of [
  ['deduplicates numeric and named IDs', ['123', 'BR-1', '123', 'BR-1'], null, ['123', 'BR-1']],
  ['merges a new primary branch', ['BR-1'], '123', ['123', 'BR-1']],
  ['deduplicates the primary branch', ['123'], '123', ['123']],
  ['accepts a primary-only branch', [], '123', ['123']],
  ['retains zero', ['0', '0'], null, ['0']],
  ['retains primary-only zero', [], '0', ['0']],
  ['keeps leading-zero identities distinct', ['123', '0123', '00', '0', '0123'], null, ['0', '00', '0123', '123']],
  ['sorts lexically rather than numerically', ['2', 'BR_1', '10', 'A.b-1', '1'], null, ['1', '10', '2', 'A.b-1', 'BR_1']],
]) {
  test(name, () => {
    assert.deepEqual(run({ branchIds, primaryBranchId }).ids, expected);
    const result = run({ branchIds, primaryBranchId, validate: true, rows: active(expected) });
    assert.deepEqual(result.ids, expected, JSON.stringify(result));
    assert.deepEqual(result.params, expected);
    assert.equal(result.sql, `SELECT id,is_active FROM branches WHERE id IN (${expected.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`);
  });
}

for (const value of [123, 0, true, null, [], {}, '', ' 123', '123 ', '\t123', '123\n', '12 3', '-123', 'a'.repeat(21)]) {
  test(`rejects invalid branch member ${JSON.stringify(value)} before querying`, () => {
    assert.deepEqual(run({ branchIds: [value], validate: true }), {
      error: 'ID cabang tidak valid', sql: null, params: null,
    });
  });
}
for (const value of [123, 0, ' 123', '123 ', '123\n']) {
  test(`rejects invalid primary branch ${JSON.stringify(value)} before querying`, () => {
    assert.deepEqual(run({ branchIds: ['BR-1'], primaryBranchId: value, validate: true }), {
      error: 'ID cabang tidak valid', sql: null, params: null,
    });
  });
}
for (const value of [null, '123', 123, true]) {
  test(`rejects non-array branch list ${JSON.stringify(value)}`, () => {
    assert.deepEqual(run({ branchIds: value, validate: true }), {
      error: 'Daftar cabang tidak valid', sql: null, params: null,
    });
  });
}
test('rejects empty selection before querying', () => {
  assert.deepEqual(run({ branchIds: [], validate: true }), {
    error: 'Pilih minimal satu cabang', sql: null, params: null,
  });
});
for (const [name, branchIds, rows] of [
  ['inactive numeric branch', ['123'], [{ id: '123', is_active: 0 }]],
  ['missing numeric branch', ['123'], []],
  ['partially missing selection', ['123', 'BR-1'], active(['BR-1'])],
  ['partially inactive selection', ['123', 'BR-1'], [{ id: '123', is_active: 0 }, ...active(['BR-1'])]],
  ['different identity with equal row count', ['0123'], active(['123'])],
  ['case-mismatched identity', ['BR-1'], active(['br-1'])],
]) {
  test(`validator still rejects ${name}`, () => {
    const result = run({ branchIds, validate: true, rows });
    assert.equal(result.error, 'Ada cabang yang tidak valid atau nonaktif');
    assert.equal(result.ids, undefined);
    assert.deepEqual(result.params, branchIds);
  });
}
