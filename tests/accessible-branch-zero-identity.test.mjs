import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/accessible-branch-zero-identity.php', import.meta.url));
function run(input) {
  const result = spawnSync(process.env.PHP_BINARY || 'php', [fixture, JSON.stringify(input)], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

for (const [name, input, expected] of [
  ['primary-only zero', { primary: '0' }, ['0']],
  ['explicit zero membership', { memberships: ['0'] }, ['0']],
  ['duplicate primary and memberships', { primary: '0', memberships: ['0', 'BR-1', '0', 'BR-1'] }, ['0', 'BR-1']],
  ['null and empty filtering', { primary: null, memberships: [null, '', '0', '00', 'BR-1', ''] }, ['0', '00', 'BR-1']],
  ['absent primary', {}, []],
  ['null primary', { primary: null }, []],
  ['empty primary', { primary: '', memberships: [null, ''] }, []],
  ['exact named and leading-zero identities', { primary: '0123', memberships: ['123', '00', '0', 'BR-1', '0123', 'br-1'] }, ['123', '00', '0', 'BR-1', '0123', 'br-1']],
]) {
  test(`accessible list preserves ${name}`, () => assert.deepEqual(run(input).ids, expected));
}
test('raw membership lookup already preserves zero and exact identity', () => {
  assert.deepEqual(run({ mode: 'memberships', memberships: ['0', '00', '0123', 'BR-1'] }).ids, ['0', '00', '0123', 'BR-1']);
});
for (const mode of ['assert', 'require', 'locked', 'delegate']) {
  for (const [name, input] of [
    ['primary-only zero', { primary: '0' }],
    ['explicit zero membership', { memberships: ['0'] }],
    ['named primary', { primary: 'BR-1', target: 'BR-1' }],
    ['leading-zero member', { memberships: ['0123'], target: '0123' }],
  ]) {
    test(`${mode} accepts ${name}`, () => assert.equal(run({ mode, target: '0', ...input }).allowed, true));
  }
  for (const [name, input] of [
    ['unassigned zero', { primary: 'BR-1', target: '0' }],
    ['unassigned named branch', { primary: '0', target: 'BR-2' }],
    ['leading zero alias', { primary: '0', target: '00' }],
    ['numeric alias', { memberships: ['0123'], target: '123' }],
    ['case alias', { memberships: ['BR-1'], target: 'br-1' }],
    ['empty assignments', { primary: '', memberships: [null, ''], target: '0' }],
  ]) {
    test(`${mode} rejects ${name}`, () => {
      const result = run({ mode, ...input });
      assert.equal(result.error, mode === 'delegate' ? 'InvalidArgumentException' : 'DomainException');
      assert.equal(result.code, mode === 'delegate' ? 0 : 403);
      assert.equal(result.allowed, undefined);
    });
  }
}
for (const mode of ['assert', 'require']) {
  for (const target of [null, '']) {
    test(`${mode} rejects missing target ${JSON.stringify(target)} before SQL`, () => {
      const result = run({ mode, primary: '0', target });
      assert.equal(result.error, mode === 'require' ? 'DomainException' : 'InvalidArgumentException');
      assert.equal(result.code, mode === 'require' ? 422 : 0);
      assert.deepEqual(result.queries, []);
    });
  }
}
for (const [name, authority] of [['owner', { owner: true }], ['all_branches', { permissions: ['all_branches'] }]]) {
  test(`${name} still receives the database branch list, not assignments`, () => {
    const result = run({ ...authority, primary: 'not-in-db', memberships: ['also-not-in-db'], allBranches: ['0', '00', 'BR-1'] });
    assert.deepEqual(result.ids, ['0', '00', 'BR-1']);
    assert.equal(result.queries.some(query => query.includes('user_branch_access')), false);
    if (name === 'owner') assert.deepEqual(result.queries, ['SELECT id FROM branches ORDER BY id']);
  });
  for (const mode of ['assert', 'require']) {
    test(`${name} ${mode} retains database-list boundary`, () => {
      assert.equal(run({ ...authority, mode, allBranches: ['0'], target: '0' }).allowed, true);
      assert.equal(run({ ...authority, mode, allBranches: ['0'], target: 'not-in-db' }).code, 403);
    });
  }
}
for (const authority of [{ owner: true }, { permissions: ['all_branches'] }, { permissions: ['*'] }]) {
  for (const mode of ['locked', 'delegate']) {
    test(`${mode} retains existing privileged bypass ${JSON.stringify(authority)}`, () => {
      assert.equal(run({ ...authority, mode, target: 'BR-OTHER' }).allowed, true);
    });
  }
}
test('ordinary accessible list does not reinterpret wildcard permission as all_branches', () => {
  assert.deepEqual(run({ permissions: ['*'], primary: 'BR-1', allBranches: ['0', 'BR-1'] }).ids, ['BR-1']);
});
