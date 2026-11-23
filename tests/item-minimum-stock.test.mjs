import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

async function loadModule(path) {
  const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { itemMinimumStock, itemStockForBranch, isItemBelowMinimum } = await loadModule('../src/lib/itemStock.ts');
const { defaultItemColumns, restoreItemColumns } = await loadModule('../src/lib/itemListColumns.ts');

test('minimum defaults to zero: empty stock is normal and negative stock is low', () => {
  for (const item of [{ type: 'Persediaan' }, { type: 'Persediaan', minimumStock: 0 }]) {
    assert.equal(itemMinimumStock(item), 0);
    assert.equal(isItemBelowMinimum(item, 0), false);
    assert.equal(isItemBelowMinimum(item, 1), false);
    assert.equal(isItemBelowMinimum(item, -1), true);
  }
});

test('one item minimum is shared, while each branch is compared using its own stock', () => {
  const item = { type: 'Persediaan', minimumStock: 3, stock: 10, branchStocks: { A: { stock: 5 }, B: { stock: 3 }, C: { stock: 2 } } };
  assert.equal(isItemBelowMinimum(item, itemStockForBranch(item, 'A')), false);
  assert.equal(isItemBelowMinimum(item, itemStockForBranch(item, 'B')), false);
  assert.equal(isItemBelowMinimum(item, itemStockForBranch(item, 'C')), true);
  assert.equal(itemStockForBranch(item, 'missing'), 0);
  assert.equal(isItemBelowMinimum(item, itemStockForBranch(item, 'missing')), true);
  assert.equal(itemStockForBranch(item, 'ALL'), 10);
});

test('services, groups and noninventory items never receive a low stock warning', () => {
  for (const type of ['Jasa', 'Group', 'Non Persediaan']) {
    assert.equal(isItemBelowMinimum({ type, minimumStock: 5 }, -1), false);
  }
});

test('new and existing users see barcode and minimum next to their related columns', () => {
  assert.deepEqual(restoreItemColumns(null), defaultItemColumns);
  const legacy = ['code', 'name', 'stock', 'unit', 'category', 'brand', 'actions'];
  assert.deepEqual(restoreItemColumns(legacy, true), defaultItemColumns);
  const custom = ['name', 'stock', 'code', 'price', 'actions'];
  assert.deepEqual(restoreItemColumns(custom, true), ['name', 'stock', 'minimumStock', 'code', 'barcode', 'price', 'actions']);
  assert.deepEqual(custom, ['name', 'stock', 'code', 'price', 'actions']);
});

test('later column preferences remain respected, and malformed saved columns are safe', () => {
  const customized = ['name', 'stock', 'actions'];
  assert.deepEqual(restoreItemColumns(customized), customized);
  assert.deepEqual(restoreItemColumns(['name', 'barcode', 'barcode', '__proto__', 42, 'actions']), ['name', 'barcode', 'actions']);
  assert.deepEqual(restoreItemColumns({ broken: true }), defaultItemColumns);
  const migrated = restoreItemColumns(['name', 'actions'], true);
  assert.equal(migrated.filter(column => column === 'barcode').length, 1);
  assert.equal(migrated.filter(column => column === 'minimumStock').length, 1);
  assert.deepEqual(restoreItemColumns(migrated, true), migrated);
});
