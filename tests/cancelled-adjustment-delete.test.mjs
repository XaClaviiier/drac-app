import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const run = input => {
  const result = spawnSync('php', [fileURLToPath(new URL('./fixtures/cancelled-adjustment-delete.php', import.meta.url)), JSON.stringify(input)], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const original = { id: 'INITIAL' };
const reversal = { id: 'REVERSAL', source_warehouse_id: 'W1', destination_warehouse_id: null };
test('cancelled adjustment deletes both movements, preserves unrelated stock and audit snapshot', () => {
  const result = run({ movements: [original, reversal, { id: 'OTHER', reference_id: 'ADJ2' }] });
  assert.equal(result.success, true);
  assert.deepEqual(result.documents, []);
  assert.deepEqual(result.movements.map(row => row.id), ['OTHER']);
  assert.equal(result.stocks[0].quantity, 27);
  assert.equal(result.logs.length, 1);
  const snapshot = JSON.parse(result.logs[0].snapshot_json);
  assert.equal(snapshot.document.status, 'Cancelled');
  assert.deepEqual(snapshot.movements.map(row => row.id).sort(), ['INITIAL','REVERSAL']);
});
test('draft without movements remains deletable', () => assert.equal(run({ status: 'Draft' }).success, true));
for (const [name, input] of [
  ['posted missing movement', { status: 'Posted', movements: [] }],
  ['posted insufficient stock', { status: 'Posted', stock:27, quantity:30, movements: [{...original,quantity:30}] }],
  ['linked opname', { linked: true, movements: [original,reversal] }],
  ['missing reversal', { movements: [original] }],
  ['reversal in another warehouse', { movements: [original,{ ...reversal,source_warehouse_id:'W2' }] }],
  ['reversal for another item', { movements: [original,{ ...reversal,item_id:'I2' }] }],
  ['voided reversal', { movements: [original,{ ...reversal,is_voided:1 }] }],
]) test(`rejects ${name} and leaves document, movements and stock unchanged`, () => {
  const result = run(input);
  assert.equal(result.success, false);
  assert.equal(result.documents.length, 1);
  assert.equal(result.movements.length, input.movements.length);
  assert.equal(result.logs.length, 0);
  assert.equal(result.stocks[0].quantity, 27);
});
test('legacy marker movements are removed together with reversal', () => {
  const result = run({ movements: [
    { ...original,reference_id:null,reference_type:null,notes:'STOCK_ADJUSTMENT:ADJ-2608-0001' },
    { ...reversal,reference_id:null,reference_type:null,notes:'CANCEL_STOCK_ADJUSTMENT:ADJ-2608-0001 correction' },
  ] });
  assert.equal(result.success, true);
  assert.deepEqual(result.movements, []);
});
test('posted adjustment deletes directly and subtracts the original stock without new movements', () => {
  const result = run({status:'Posted',movements:[original]});
  assert.equal(result.success,true);
  assert.deepEqual(result.documents,[]);
  assert.deepEqual(result.movements,[]);
  assert.equal(result.stocks[0].quantity,17);
  assert.equal(JSON.parse(result.logs[0].snapshot_json).document.status,'Posted');
});
test('deleting a negative posted adjustment restores stock', () => {
  const result = run({status:'Posted',quantity:-10,movements:[reversal]});
  assert.equal(result.success,true);
  assert.equal(result.stocks[0].quantity,37);
  assert.deepEqual(result.movements,[]);
});
