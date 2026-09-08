import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/scoped-zero-endpoints-runtime.php', import.meta.url));
const php = process.env.PHP_BINARY || 'php';
// Portable Windows PHP ships mbstring but does not enable it by default.
// Load its actual extension per process; never patch php.ini or polyfill production behavior.
const probe = spawnSync(php, ['-r', 'echo json_encode([extension_loaded("mbstring"), dirname(PHP_BINARY), PHP_OS_FAMILY]);'], { encoding: 'utf8' });
assert.ifError(probe.error);
assert.equal(probe.status, 0, probe.stderr);
const [hasMbstring, phpDir, osFamily] = JSON.parse(probe.stdout);
const phpArgs = !hasMbstring && osFamily === 'Windows' ? ['-d', `extension_dir=${phpDir}/ext`, '-d', 'extension=mbstring'] : [];
function run(input) {
  const p = spawnSync(php, [...phpArgs, fixture, JSON.stringify(input)], { encoding: 'utf8' });
  assert.ifError(p.error);
  assert.equal(p.status, 0, p.stderr || p.stdout);
  assert.equal(p.stderr, '');
  return JSON.parse(p.stdout);
}
const receipt = branchId => ({ branchId, warehouseId: 'warehouse', receivedById: 'receiver', date: '2026-09-08', status: 'Draft', items: [{ itemId: 'item', qty: 1 }] });
const contact = branchId => ({ customerId: 'customer', customerName: 'Customer', messageText: 'Hello', templateType: 'reminder', branchId });
test('contact POST stores exact scoped zero instead of public null', () => {
  const r = run({ body: contact('0'), memberships: ['0'] });
  assert.equal(r.status, 200);
  assert.equal(r.contacts.length, 1);
  assert.equal(r.contacts[0].branch_id, '0');
});
test('contact POST zero then GET hides stored contact from unauthorized caller', () => {
  const stored = run({ body: contact('0'), memberships: ['0'] }).contacts;
  const r = run({ method: 'GET', rows: stored, memberships: ['BR-1'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, []);
});


for (const branch of ['0', '00', '0123', 'BR-1', '', null]) {
  test(`contact exact POST/GET round trip ${JSON.stringify(branch)}`, () => {
    const stored = run({ body: contact(branch), memberships: branch ? [branch] : [] });
    assert.equal(stored.status, 200);
    assert.equal(stored.contacts[0].branch_id, branch === '' || branch === null ? null : branch);
    const visible = run({ method: 'GET', rows: stored.contacts, memberships: branch ? [branch] : [] });
    assert.equal(visible.status, 200);
    assert.equal(visible.data.length, 1);
    assert.equal(visible.data[0].branchId, stored.contacts[0].branch_id);
  });
}
for (const [name, authority, visible] of [
  ['member', { memberships: ['0'] }, true],
  ['owner', { actor: { is_owner: 1 } }, true],
  ['primary-only', { actor: { branch_id: '0' } }, false],
  ['all_branches-only', { permissions: ['customer:view', 'all_branches'] }, false],
  ['leading-zero alias', { memberships: ['00'] }, false],
]) {
  test(`contact GET preserves ${name} policy`, () => {
    const rows = run({ body: contact('0'), memberships: ['0'] }).contacts;
    const r = run({ method: 'GET', rows, ...authority });
    assert.equal(r.status, 200);
    assert.equal(r.data.length, visible ? 1 : 0);
  });
}
for (const branch of ['', null]) {
  test(`historical ${JSON.stringify(branch)} contact remains public to permitted caller`, () => {
    const rows = run({ body: contact(null) }).contacts;
    rows[0].branch_id = branch;
    assert.equal(run({ method: 'GET', rows }).data.length, 1);
  });
}
for (const [branch, memberships] of [['0', []], ['0', ['00']], ['00', ['0']], ['0123', ['123']], ['BR-1', ['br-1']]]) {
  test(`contact POST rejects unauthorized exact branch ${branch}/${memberships}`, () => {
    const r = run({ body: contact(branch), memberships });
    assert.equal(r.status, 403);
    assert.deepEqual(r.contacts, []);
  });
}
for (const authority of [{ actor: { branch_id: '0' } }, { actor: { is_owner: 1 } }, { permissions: ['customer:view', 'all_branches'] }]) {
  test(`contact POST retains existing accessible-branch policy ${JSON.stringify(authority)}`, () => {
    const r = run({ body: contact('0'), ...authority });
    assert.equal(r.status, 200);
    assert.equal(r.contacts[0].branch_id, '0');
  });
}
test('receipt accepts active primary-only zero receiver and commits exact branch', () => {
  const r = run({ endpoint: 'goods-receipts', body: receipt('0'), memberships: ['0'] });
  assert.equal(r.status, 200, r.message);
  assert.equal(r.committed, true);
  assert.equal(r.receipts.length, 1);
  assert.equal(r.receipts[0][15], '0');
  assert.equal(r.receipts[0][18], 'receiver');
  assert.equal(r.lines.length, 1);
  assert.ok(r.queries.some(q => q.sql === 'SELECT * FROM users WHERE id IN (?) ORDER BY id FOR UPDATE' && q.transaction));
});
for (const [name, extra] of [
  ['unassigned', { receiver: { branch_id: null } }],
  ['empty primary', { receiver: { branch_id: '' } }],
  ['named unauthorized', { receiver: { branch_id: 'BR-1' } }],
  ['leading-zero mismatch', { receiver: { branch_id: '00' } }],
  ['membership mismatch', { receiver: { branch_id: null }, receiverMemberships: ['00'] }],
  ['all_branches does not broaden preflight', { receiver: { branch_id: null }, permissions: ['receipt:create', 'all_branches'] }],
  ['inactive', { receiver: { is_active: 0 } }],
  ['inactive owner', { receiver: { is_active: 0, is_owner: 1 } }],
  ['missing', { missingReceiver: true }],
]) {
  test(`receipt rejects ${name} receiver before transaction without writes`, () => {
    const r = run({ endpoint: 'goods-receipts', body: receipt('0'), memberships: ['0'], ...extra });
    assert.equal(r.status, 422, r.message);
    assert.equal(r.committed, false);
    assert.deepEqual(r.receipts, []);
    assert.deepEqual(r.lines, []);
    assert.ok(!r.queries.some(q => q.transaction));
  });
}
for (const [name, branch, extra] of [
  ['membership-only zero', '0', { receiver: { branch_id: null }, receiverMemberships: ['0'] }],
  ['empty primary with membership zero', '0', { receiver: { branch_id: '' }, receiverMemberships: ['0'] }],
  ['owner', '0', { receiver: { branch_id: null, is_owner: 1 } }],
  ['named primary', 'BR-1', { receiver: { branch_id: 'BR-1' } }],
  ['numeric primary', '123', { receiver: { branch_id: '123' } }],
  ['leading-zero primary', '0123', { receiver: { branch_id: '0123' } }],
]) {
  test(`receipt retains accepted ${name} receiver`, () => {
    const r = run({ endpoint: 'goods-receipts', body: receipt(branch), memberships: [branch], ...extra });
    assert.equal(r.status, 200, r.message);
    assert.equal(r.committed, true);
    assert.equal(r.receipts[0][15], branch);
  });
}
for (const [name, lockedReceiver] of [
  ['primary revoked', { branch_id: null }],
  ['primary moved', { branch_id: '00' }],
  ['inactive', { is_active: 0 }],
]) {
  test(`receipt locked receiver ${name} still rejects and rolls back`, () => {
    const r = run({ endpoint: 'goods-receipts', body: receipt('0'), memberships: ['0'], lockedReceiver });
    assert.equal(r.status, 422, r.message);
    assert.equal(r.rolledBack, true);
    assert.equal(r.committed, false);
    assert.deepEqual(r.receipts, []);
    assert.deepEqual(r.lines, []);
    assert.ok(r.queries.some(q => q.sql === 'SELECT * FROM users WHERE id IN (?) ORDER BY id FOR UPDATE' && q.transaction));
  });
}
test('contact GET does not alias leading-zero or differently named stored scopes', () => {
  for (const [branch, memberships] of [['00', ['0']], ['0123', ['123']], ['BR-1', ['br-1']]]) {
    const rows = run({ body: contact(branch), memberships: [branch] }).contacts;
    assert.deepEqual(run({ method: 'GET', rows, memberships }).data, []);
  }
});
test('contact omitted branch retains historical null storage', () => {
  const body = contact(undefined);
  const r = run({ body });
  assert.equal(r.status, 200);
  assert.equal(r.contacts[0].branch_id, null);
});
for (const method of ['POST', 'GET']) {
  test(`contact ${method} still requires customer:view`, () => {
    const r = run({ method, body: contact('0'), permissions: [], memberships: ['0'] });
    assert.equal(r.status, 403);
    assert.deepEqual(r.contacts, []);
  });
}
