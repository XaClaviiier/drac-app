import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptDescription, receiptManualNotes, receiptQuantitySummary } from '../src/lib/goodsReceiptPresentation.ts';
import { buildGoodsReceiptListPrintHtml } from '../src/lib/goodsReceiptListPrint.ts';

const receipt = {
  id: 'receipt', receiptNumber: 'GR-P-2026-0053', date: '2026-11-19', warehouseId: 'perintis',
  receivedBy: 'AHMAD JUMADIL', status: 'Diterima', notes: 'Dibuat via Asisten AI oleh PENGINPUT',
  supplierName: 'Supplier privat', items: [
    { itemCode: '0401-0003', itemName: 'CONDENSOR AVANZA GRAND NEW #ND', qty: 1, unit: 'PCS' },
  ],
};
const options = {
  receipts: [receipt], warehouses: [{ id: 'perintis', name: 'GUDANG PERINTIS' }],
  periodLabel: 'Tanggal 19/11/2026', filters: ['Gudang: GUDANG PERINTIS', 'Diterima oleh: AHMAD JUMADIL'],
  printedAt: new Date('2026-11-19T07:48:00Z'),
};

test('automatic descriptions use actual receipt items and receiver, including after edits', () => {
  assert.equal(receiptDescription(receipt), 'Terima CONDENSOR AVANZA GRAND NEW #ND 1 PCS oleh AHMAD JUMADIL.');
  assert.equal(receiptDescription({ ...receipt, receivedBy: 'RIOZ', items: [{ ...receipt.items[0], qty: 3 }] }), 'Terima CONDENSOR AVANZA GRAND NEW #ND 3 PCS oleh RIOZ.');
  assert.match(receiptDescription({ ...receipt, notes: '' }), /^Terima /);
  assert.match(receiptDescription({ ...receipt, status: 'Draft' }), /^Rencana terima /);
  assert.match(receiptDescription({ ...receipt, status: 'Batal' }), /^Batal terima /);
});

test('custom descriptions remain intact, including multiline notes mentioning AI', () => {
  const notes = 'Langsung pakai DD1546YC.\nDibuat via Asisten AI oleh AHMAD JUMADIL';
  assert.equal(receiptManualNotes(notes), notes);
  assert.equal(receiptDescription({ ...receipt, notes }), notes);
  const inlineNote = 'Dibuat via Asisten AI oleh AHMAD JUMADIL; langsung pakai DD1546YC.';
  assert.equal(receiptManualNotes(inlineNote), inlineNote);
});

test('quantities group compatible units without adding PCS to SET or bottles', () => {
  const items = [{ qty: 1.5, unit: 'PCS' }, { qty: 2, unit: 'pcs' }, { qty: 4, unit: 'BOTOL' }, { qty: 1, unit: 'SET' }];
  assert.equal(receiptQuantitySummary(items), '3,5 PCS + 4 BOTOL + 1 SET');
});

test('list print keeps all supplied rows in order and uses actual units and receiving status', () => {
  const receipts = Array.from({ length: 78 }, (_, index) => ({ ...receipt, receiptNumber: `GR-TEST-${index + 1}`, status: index % 2 ? 'Difakturkan' : 'Diterima', items: [{ ...receipt.items[0], unit: 'SET' }] }));
  const html = buildGoodsReceiptListPrintHtml({ ...options, receipts });
  assert.equal((html.match(/<td class="sequence">/g) || []).length, 78);
  assert.ok(html.indexOf('GR-TEST-1</td>') < html.indexOf('GR-TEST-78</td>'));
  assert.ok(html.includes('Total: 78 penerimaan'));
  assert.ok(html.includes('1 SET'));
  assert.ok(!html.includes('1 PCS'));
  assert.ok(!html.includes('Difakturkan'));
  assert.ok(!html.includes('Supplier privat'));
  assert.ok(!html.includes('Dibuat via Asisten AI'));
  assert.match(html, /15[.:]48 WITA/);
});

test('list print safely renders notes and filters, preserves manual newlines and restricts supplier column', () => {
  const notes = '<script>alert(1)</script>\nCatatan & "uji"';
  const html = buildGoodsReceiptListPrintHtml({ ...options, receipts: [{ ...receipt, notes }], filters: ['Pencarian: <img src=x onerror=alert(1)>'] });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;\nCatatan &amp; &quot;uji&quot;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(buildGoodsReceiptListPrintHtml({ ...options, includeSupplier: true }).includes('Supplier privat'));
  assert.ok(buildGoodsReceiptListPrintHtml({ ...options, receipts: [] }).includes('Tidak ada penerimaan yang sesuai filter.'));
});
