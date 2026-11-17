import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/receipt-zero-source-stock-runtime.php', import.meta.url));
const php = process.env.PHP_BINARY || 'php';
const probe = spawnSync(php, ['-r', 'echo json_encode([extension_loaded("mbstring"),dirname(PHP_BINARY),PHP_OS_FAMILY]);'], { encoding: 'utf8' });
assert.ifError(probe.error);
const [mb, dir, os] = JSON.parse(probe.stdout);
const args = !mb && os === 'Windows' ? ['-d', `extension_dir=${dir}/ext`, '-d', 'extension=mbstring'] : [];
function run(input = {}) {
  const result = spawnSync(php, [...args, fixture, JSON.stringify({
    action: 'supplier', method: 'PUT', oldStatus: 'Diterima', sourceType: 'Supplier', roleCode: 'ADM',
    body: { supplierId: 'S1', expectedSupplierId: '' }, ...input,
  })], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  if (!input.failAudit) assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
function unchangedInventory(result) {
  for (const key of ['lines', 'warehouse', 'branch', 'itemStock', 'movements', 'versions']) {
    assert.deepEqual(result.state[key], result.initial[key], `${key} must not change`);
  }
  const omitSupplier = ({ supplier_id, supplier_name, ...receipt }) => receipt;
  assert.deepEqual(omitSupplier(result.state.receipt), omitSupplier(result.initial.receipt));
}

for (const oldStatus of ['Draft', 'Diterima']) test(`admin maps ${oldStatus} receipt without changing stock or technician`, () => {
  const result = run({ oldStatus });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.state.receipt.supplier_id, 'S1');
  assert.equal(result.state.receipt.supplier_name, 'Supplier S1');
  assert.equal(result.committed, true);
  unchangedInventory(result);
  assert.equal(result.state.logs.length, 1);
  const snapshot = JSON.parse(result.state.logs[0][3]);
  assert.deepEqual(snapshot.before, { supplierId: null, supplierName: '' });
  assert.deepEqual(snapshot.after, { supplierId: 'S1', supplierName: 'Supplier S1' });
});
test('owner can map receipt', () => assert.equal(run({ isOwner: 1, roleCode: 'OWNER' }).status, 200));
for (const supplierId of ['S2', '']) test(`admin can correct mapping to ${supplierId || 'unassigned'}`, () => {
  const result = run({ supplierId: 'S1', supplierName: 'Supplier S1', body: { supplierId, expectedSupplierId: 'S1' } });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.state.receipt.supplier_id, supplierId || null);
  unchangedInventory(result);
});
test('same mapping does not duplicate audit records', () => {
  const result = run({ supplierId: 'S1', supplierName: 'Supplier S1', body: { supplierId: 'S1', expectedSupplierId: 'S1' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.state, result.initial);
});
for (const [name, input, status] of [
  ['technician with receipt edit permission', { roleCode: 'TKN', roleName: 'Teknisi' }, 403],
  ['permission revoked', { permissions: [] }, 403],
  ['branch access revoked', { lockedMemberships: ['OTHER'] }, 403],
  ['inactive supplier', { invalidSupplier: true }, 422],
  ['transfer receipt', { sourceType: 'Transfer Gudang' }, 422],
  ['cancelled receipt', { oldStatus: 'Batal' }, 409],
  ['partially invoiced receipt', { oldStatus: 'Sebagian' }, 409],
  ['fully invoiced receipt', { oldStatus: 'Difakturkan' }, 409],
  ['invoiced quantity despite old status', { qtyInvoiced: 1 }, 409],
  ['linked invoice despite stale counter', { linkedInvoices: 1 }, 409],
  ['stale mapping', { supplierId: 'S2', supplierName: 'Supplier S2' }, 409],
  ['missing expected mapping', { body: { supplierId: 'S1' } }, 422],
  ['audit storage fails', { failAudit: true }, 500],
]) test(`mapping rejects ${name} without changing receipt or inventory`, () => {
  const result = run(input);
  assert.equal(result.status, status, JSON.stringify(result));
  assert.equal(result.committed, false);
  assert.deepEqual(result.state, result.initial);
});
test('ordinary receipt edit preserves mapped supplier even when form sends empty supplier', () => {
  const result = run({ action: null, supplierId: 'S1', supplierName: 'Supplier S1', body: {
    receiptNumber: 'GR-TEST', date: '2026-09-08', branchId: 'DEST', warehouseId: 'dst', receivedById: 'receiver',
    status: 'Diterima', supplierId: '', supplierName: '', notes: 'Catatan teknisi', items: [{ itemId: 'item', qty: 4 }],
  } });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.state.receipt.supplier_id, 'S1');
  assert.equal(result.state.receipt.supplier_name, 'Supplier S1');
});
for (const oldStatus of ['Diterima', 'Sebagian']) test(`mapped ${oldStatus} receipt can be invoiced to its supplier`, () => {
  const result = run({ action: null, operation: 'normalizePurchase', oldStatus, supplierId: 'S1', qtyInvoiced: oldStatus === 'Sebagian' ? 2 : 0 });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.items[0].receiptId, 'receipt');
  assert.equal(result.data.subtotal, 200);
});
for (const [name, input] of [
  ['unmapped receipt', {}], ['changed supplier', { supplierId: 'S2' }],
  ['draft', { supplierId: 'S1', oldStatus: 'Draft' }], ['cancelled', { supplierId: 'S1', oldStatus: 'Batal' }],
  ['different branch', { supplierId: 'S1', invoiceBranch: 'OTHER' }],
  ['excess quantity', { supplierId: 'S1', qtyInvoiced: 3 }],
  ['warehouse transfer', { supplierId: 'S1', sourceType: 'Transfer Gudang' }],
]) test(`invoice rejects ${name}`, () => {
  const result = run({ operation: 'normalizePurchase', action: null, ...input });
  assert.equal(result.status, 422, JSON.stringify(result));
  assert.deepEqual(result.state, result.initial);
});
