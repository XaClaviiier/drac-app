import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const code = buildSync({ entryPoints: ['src/lib/stockMovementReport.ts'], bundle: true, write: false, format: 'esm', platform: 'node' }).outputFiles[0].text;
const { filterWarehouseMovements, warehouseMovementCsv, warehouseMovementPrintHtml } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const heading = { company: 'DOKTER AC MOBIL', dateFrom: '2026-01-01', dateTo: '2026-01-31', warehouse: 'Semua Gudang', filters: 'Masuk & Keluar' };
const filters = { search: '', direction: 'ALL', type: 'ALL', sort: 'date' };
const row = (id, values = {}) => ({ id, itemId: 'I1', itemCode: 'FREON', itemName: 'Freon', unit: 'PCS', warehouseId: 'W1', warehouseName: 'Cakalang', branchId: 'B1', branchName: 'Cakalang', movementSequence: 1, movementType: 'receipt', referenceNumber: id, notes: 'Penerimaan', quantity: 3, incoming: 3, outgoing: 0, createdAt: '2026-01-01 12:00:00', ...values });
const rows = [row('IN'), row('OUT', { movementType: 'usage', incoming: 0, outgoing: 1, movementSequence: 2 }), row('SEND', { movementType: 'transfer_send', incoming: 0, outgoing: 2 }), row('RECEIVE', { movementType: 'transfer_receive', warehouseId: 'W2' })];

test('movement search and direction combine with all transfer kinds without hiding repeated items', () => {
  assert.equal(filterWarehouseMovements(rows, filters).length, 4);
  assert.deepEqual(filterWarehouseMovements(rows, { ...filters, type: 'transfer', direction: 'OUT' }).map(row => row.id), ['SEND']);
  assert.deepEqual(filterWarehouseMovements(rows, { ...filters, type: 'usage', search: 'freon' }).map(row => row.id), ['OUT']);
  assert.deepEqual(filterWarehouseMovements(rows, { ...filters, search: ' receive ' }).map(row => row.id), ['RECEIVE']);
  assert.equal(filterWarehouseMovements(rows, { ...filters, search: 'tidak ada' }).length, 0);
});

test('date ordering uses effective dates, item order remains chronological and source rows are not mutated', () => {
  const input = [row('LATER', { occurredAt: '2026-01-10 12:00:00', itemName: 'A' }), row('EARLY', { occurredAt: '2026-01-02 12:00:00', itemName: 'Z' }), row('A-EARLY', { occurredAt: '2026-01-03 12:00:00', itemName: 'A' })];
  assert.deepEqual(filterWarehouseMovements(input, filters).map(row => row.id), ['EARLY', 'A-EARLY', 'LATER']);
  assert.deepEqual(filterWarehouseMovements(input, { ...filters, sort: 'item' }).map(row => row.id), ['A-EARLY', 'LATER', 'EARLY']);
  assert.equal(input[0].id, 'LATER');
});

test('CSV and printing include every filtered row beyond the screen page, with dates and units', () => {
  const all = Array.from({ length: 251 }, (_, index) => row(`DOC-${index}`, { unitCost: 999999 }));
  const csv = warehouseMovementCsv(all, heading);
  assert.equal(csv.length, 258);
  assert.equal(csv.at(-1)[2], 'DOC-250');
  assert.equal(csv.at(-1)[3], '01/01/2026');
  assert.equal(csv.at(-1)[10], 'PCS');
  assert.doesNotMatch(JSON.stringify(csv), /999999|HPP/);
  const html = warehouseMovementPrintHtml(all, heading);
  assert.equal((html.match(/<tr>/g) || []).length, 252);
  assert.match(html, /DOC-250/);
  assert.match(html, /size:A4 landscape/);
});

test('print report escapes descriptions, item names and filter text as data', () => {
  const html = warehouseMovementPrintHtml([row('SAFE', { itemName: '<script>alert(1)</script>', notes: '<img src=x onerror=alert(1)>' })], { ...heading, filters: '<b>Filter</b>' });
  assert.doesNotMatch(html, /<script>|<img src/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;Filter&lt;\/b&gt;/);
});
