import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = input => JSON.parse(execFileSync('php', ['tests/fixtures/inventory-average.php', JSON.stringify(input)], { encoding: 'utf8' }));
let sequence = 0;
const move = (source, destination, quantity, cost, type = 'receipt', extra = {}) => ({ id: `M${++sequence}`, source_warehouse_id: source, destination_warehouse_id: destination, quantity, unit_cost: cost, movement_type: type, ...extra });
const history = (...movements) => run({ movements, defaultCost: 999 });

test('moving average weights remaining quantities, not the last incoming price', () => {
  const first = move(null, 'W1', 10, 100), second = move(null, 'W1', 10, 200);
  assert.deepEqual(history(first, second).warehouses.W1, { quantity: 20, averageCost: 150 });
  assert.deepEqual(history(first, second, move('W1', null, 5, null, 'usage'), move(null, 'W1', 10, 300)).warehouses.W1, { quantity: 25, averageCost: 210 });
});
test('partial transfer receipts carry the sent cost while HPP remains global', () => {
  const ref = { reference_type: 'warehouse_transfer', reference_id: 'T1' };
  const result = history(move(null, 'W1', 20, 150), move(null, 'W2', 10, 100), move('W1', 'W2', 10, 150, 'transfer_send', ref), move(null, 'W1', 10, 300), move('W1', 'W2', 5, null, 'transfer_receive', ref), move('W1', 'W2', 5, null, 'transfer_receive', ref));
  assert.deepEqual(result.warehouses.W1, { quantity: 20, averageCost: 175 });
  assert.deepEqual(result.warehouses.W2, { quantity: 20, averageCost: 175 });
});
test('direct transfers keep one global HPP across warehouses', () => {
  const result = history(move(null, 'W1', 10, 100), move(null, 'W2', 10, 300), move('W1', 'W2', 5, null, 'transfer'));
  assert.deepEqual(result.warehouses.W1, { quantity: 5, averageCost: 200 });
  assert.deepEqual(result.warehouses.W2, { quantity: 15, averageCost: 200 });
});
test('receipt and usage reversals restore the original costs', () => {
  const receipt = move(null, 'W1', 10, 200);
  assert.equal(history(move(null, 'W1', 10, 100), receipt, move('W1', null, 10, null, 'reversal', { reversal_of_id: receipt.id })).warehouses.W1.averageCost, 100);
  const usage = move('W1', null, 5, 100, 'usage');
  const result = history(move(null, 'W1', 10, 100), usage, move(null, 'W1', 5, 200), move(null, 'W1', 5, null, 'reversal', { reversal_of_id: usage.id }));
  assert.equal(result.warehouses.W1.quantity, 15);
  assert.equal(result.warehouses.W1.averageCost, 133.3333);
});
test('revaluation and its reversal change cost while keeping physical quantities', () => {
  const start = move(null, 'W1', 10, 100), out = move('W1', null, 10, 100, 'cost_adjustment'), incoming = move(null, 'W1', 10, 180, 'cost_adjustment');
  assert.deepEqual(history(start, out, incoming).warehouses.W1, { quantity: 10, averageCost: 180 });
  assert.deepEqual(history(start, out, incoming, move('W1', null, 10, 180, 'cost_adjustment_reversal'), move(null, 'W1', 10, 100, 'cost_adjustment_reversal')).warehouses.W1, { quantity: 10, averageCost: 100 });
});
test('free receipts, null legacy costs and exhausted/negative stock have finite costs', () => {
  assert.equal(history(move(null, 'W1', 10, 100), move(null, 'W1', 10, 0)).warehouses.W1.averageCost, 50);
  assert.equal(history(move(null, 'W1', 3, null)).warehouses.W1.averageCost, 999);
  assert.deepEqual(history(move(null, 'W1', 2, 100), move('W1', null, 5, null, 'sale'), move(null, 'W1', 7, 200)).warehouses.W1, { quantity: 4, averageCost: 200 });
});
test('incoming valuation uses the net receipt price after discount', () => {
  assert.equal(run({ receipt: { qty: 10, unitPrice: 200, discountPercent: 25 } }), 150);
  assert.equal(run({ receipt: { qty: 10, unitPrice: 200, discountAmount: 500 } }), 150);
  assert.equal(run({ receipt: { qty: 10, unitPrice: 200, discountPercent: 100 } }), 0);
});
