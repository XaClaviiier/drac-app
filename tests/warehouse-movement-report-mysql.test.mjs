import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const run = (name, fn) => test(name, { skip: !process.env.DRAC_USAGE_TEST_MYSQL_PORT && 'Requires disposable DRAC_USAGE_TEST_MYSQL_PORT' }, fn);
const ok = result => { assert.equal(result.success, true, result.message); return result.data; };
function fixture(t) {
  const database = `drac_usage_test_mutasi_${process.pid}_${randomBytes(4).toString('hex')}`;
  const call = input => JSON.parse(execFileSync('php', ['tests/fixtures/item-usage-mysql.php', database, JSON.stringify(input)], { encoding: 'utf8' }));
  const today = ok(call({ op: 'init' })).today;
  t.after(() => call({ op: 'drop' }));
  const sql = (sql, params = []) => ok(call({ op: 'sql', sql, params }));
  const report = (query = {}, extra = {}) => call({ endpoint: 'inventory-reports', id: 'movements', query: { dateFrom: '2026-01-01', dateTo: '2026-01-31', ...query }, ...extra });
  const add = rows => sql(`INSERT INTO stock_movements(id,item_id,source_warehouse_id,destination_warehouse_id,quantity,movement_type,occurred_at) VALUES ${rows.map(() => '(?,?,?,?,?,?,?)').join(',')}`, rows.flat());
  return { call, sql, report, add, today };
}

run('period report includes all items and more than 200 rows, with inclusive effective dates', t => {
  const f = fixture(t);
  f.sql('DELETE FROM stock_movements');
  f.add(Array.from({ length: 250 }, (_, index) => [`OLD-${index}`, index % 2 ? 'I1' : 'I2', null, 'W1', 1, 'receipt', '2026-01-15 12:00:00']));
  f.add(Array.from({ length: 210 }, (_, index) => [`NEW-${index}`, 'I1', null, 'W1', 1, 'receipt', '2026-02-01 12:00:00']));
  f.add([
    ['START', 'I3', null, 'W1', 2, 'receipt', '2026-01-01 00:00:00'],
    ['END', 'I2', 'W1', null, 1, 'usage', '2026-01-31 23:59:59'],
    ['BEFORE', 'I1', null, 'W1', 2, 'receipt', '2025-12-31 23:59:59'],
    ['LEGACY', 'I1', null, 'W1', 2, 'receipt', null],
  ]);
  f.sql("UPDATE stock_movements SET created_at='2026-01-10 13:00:00' WHERE id='LEGACY'");
  const data = ok(f.report());
  assert.equal(data.rows.length, 253);
  assert.deepEqual(new Set(data.rows.map(row => row.itemId)), new Set(['I1', 'I2', 'I3']));
  assert.equal(data.rows[0].id, 'START');
  assert.equal(data.rows.at(-1).id, 'END');
  assert.ok(data.rows.some(row => row.id === 'LEGACY'));
  assert.equal(ok(f.report({ dateFrom: '2026-01-31', dateTo: '2026-01-31' })).rows.length, 1);
  assert.equal(ok(f.report({ dateFrom: '2025-01-01', dateTo: '2025-01-31' })).rows.length, 0);
});

run('each warehouse receives the correct physical transfer, signed adjustment and reversal side', t => {
  const f = fixture(t);
  f.sql('DELETE FROM stock_movements');
  f.add([
    ['SEND', 'I1', 'W1', 'W2', 5, 'transfer_send', '2026-01-02 12:00:00'],
    ['RECEIVE', 'I1', 'W1', 'W2', 3, 'transfer_receive', '2026-01-03 12:00:00'],
    ['LEGACY', 'I1', 'W1', 'W2', 2, 'transfer', '2026-01-04 12:00:00'],
    ['UNDO', 'I1', 'W2', 'W1', 2, 'reversal', '2026-01-05 12:00:00'],
    ['SIGNED', 'I2', null, 'W1', -4, 'adjustment', '2026-01-06 12:00:00'],
    ['SIGNED-SOURCE', 'I2', 'W1', null, -2, 'adjustment', '2026-01-07 12:00:00'],
  ]);
  const data = ok(f.report()).rows.map(row => [row.id, row.warehouseId, row.incoming, row.outgoing]);
  assert.deepEqual(data, [
    ['SEND', 'W1', 0, 5], ['RECEIVE', 'W2', 3, 0],
    ['LEGACY', 'W1', 0, 2], ['LEGACY', 'W2', 2, 0],
    ['UNDO', 'W2', 0, 2], ['UNDO', 'W1', 2, 0],
    ['SIGNED', 'W1', 0, 4], ['SIGNED-SOURCE', 'W1', 2, 0],
  ]);
  assert.ok(ok(f.report({ warehouseId: 'W1' })).rows.every(row => row.warehouseId === 'W1'));
  assert.ok(!ok(f.report({ warehouseId: 'W1' })).rows.some(row => row.id === 'RECEIVE'));
});

run('voided, zero-quantity and cost-only movements do not appear; inactive history does', t => {
  const f = fixture(t);
  f.sql('DELETE FROM stock_movements');
  f.add([
    ['VOID', 'I1', 'W1', null, 2, 'sale', '2026-01-02 12:00:00'],
    ['ZERO', 'I1', 'W1', null, 0, 'sale', '2026-01-02 12:00:00'],
    ['HPP-OUT', 'I1', 'W1', null, 13, 'cost_adjustment', '2026-01-02 12:00:00'],
    ['HPP-IN', 'I1', null, 'W1', 13, 'cost_adjustment', '2026-01-02 12:00:00'],
    ['HPP-UNDO', 'I1', null, 'W1', 13, 'cost_adjustment_reversal', '2026-01-02 12:00:00'],
    ['HISTORY', 'I1', 'W1', null, 1, 'sale', '2026-01-03 12:00:00'],
  ]);
  f.sql("UPDATE stock_movements SET is_voided=1 WHERE id='VOID'");
  f.sql("UPDATE items SET is_active=0 WHERE id='I1'");
  f.sql("UPDATE warehouses SET is_active=0 WHERE id='W1'");
  assert.deepEqual(ok(f.report({ warehouseId: 'W1' })).rows.map(row => row.id), ['HISTORY']);
});

run('report permission, branch zero and warehouse scope are enforced without exposing costs', t => {
  const f = fixture(t);
  f.sql("UPDATE stock_movements SET occurred_at='2026-01-01 12:00:00'");
  assert.equal(f.report({}, { user: 'staff' }).status, 403);
  f.sql("UPDATE roles SET permissions='[\"report:view\"]' WHERE id='STAFF'");
  const staff = ok(f.report({}, { user: 'staff' }));
  assert.equal(staff.rows.length, 3);
  assert.ok(staff.rows.every(row => row.branchId === 'B1' && row.warehouseId === 'W1'));
  assert.ok(staff.rows.every(row => !('unitCost' in row) && !('unit_cost' in row)));
  assert.equal(staff.rows[0].itemCode, 'FRE-1401022');
  assert.equal(staff.rows[0].unit, 'PCS');
  assert.equal(staff.rows[0].referenceNumber, 'SALDO-AWAL');
  assert.equal(f.report({ branchId: 'B2' }, { user: 'staff' }).status, 403);
  assert.equal(f.report({ warehouseId: 'W2' }, { user: 'staff' }).status, 403);
  const zero = ok(f.report({ branchId: '0' }, { user: 'zero' }));
  assert.equal(zero.rows.length, 1);
  assert.equal(zero.rows[0].branchId, '0');
  f.sql("UPDATE warehouses SET is_system=1 WHERE id='W2'");
  assert.ok(!ok(f.report()).rows.some(row => row.warehouseId === 'W2'));
  assert.equal(f.report({ warehouseId: 'W2' }).status, 403);
  assert.equal(f.report({}, { method: 'POST' }).status, 405);
  for (const query of [{ dateFrom: '' }, { dateTo: '2026-02-30' }, { dateFrom: '2026-02-01' }]) assert.equal(f.report(query).status, 422);
});

run('draft usage is absent, posted usage and its cancellation retain their original document', t => {
  const f = fixture(t);
  const query = { warehouseId: 'W1', dateFrom: f.today, dateTo: f.today };
  const before = ok(f.report(query)).rows.length;
  const payload = { date: f.today, warehouseId: 'W1', purpose: 'Pembersihan AC', responsibleName: 'Petugas', rows: [{ itemId: 'I1', quantity: 2 }], requestKey: randomUUID() };
  const draft = ok(f.call({ method: 'POST', payload }));
  assert.equal(ok(f.report(query)).rows.length, before);
  const postedDoc = ok(f.call({ method: 'PUT', id: draft.id, payload: { action: 'post', revision: draft.revision } }));
  const posted = ok(f.report(query)).rows.filter(row => row.referenceId === draft.id);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].referenceType, 'item_usage');
  assert.deepEqual([posted[0].incoming, posted[0].outgoing], [0, 2]);
  ok(f.call({ method: 'PUT', id: draft.id, payload: { action: 'cancel', revision: postedDoc.revision, reason: 'Uji laporan' } }));
  const cancelled = ok(f.report(query)).rows.filter(row => row.referenceId === draft.id);
  assert.deepEqual(cancelled.map(row => [row.movementType, row.incoming, row.outgoing]), [['usage', 0, 2], ['reversal', 2, 0]]);
  assert.equal(cancelled[0].referenceNumber, cancelled[1].referenceNumber);
});
