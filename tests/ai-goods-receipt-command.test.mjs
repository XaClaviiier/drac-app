import assert from 'node:assert/strict';
import test from 'node:test';
import { addReceiptItem, buildReceiptLines, newReceiptDraft, parseReceiptItemQuery, receiptItemMatches, restoreReceiptDraft } from '../src/lib/aiGoodsReceipt.ts';

// Synthetic master records; codes must be copied unchanged, never generated.
const item = (id, name, extra = {}) => ({ id, code: `TEST-${id}`, name, type: 'Persediaan', isActive: true, unit: 'PCS', ...extra });
const master = [item('1', 'Evap Innova Lama'), item('2', 'Evaporator Innova Lama Denso'), item('3', 'Kompresor Avanza'),
  item('4', 'Evap Innova Lama', { isActive: false }), item('5', 'Evap Innova Lama', { type: 'Jasa' })];

test('quantity syntax preserves item query and defaults to one', () => {
  for (const suffix of ['2bh', '2 buah', '2 unit', '2pcs', 'qty 2', 'qty 2 unit', 'x2']) {
    assert.deepEqual(parseReceiptItemQuery(`evp innova lama ${suffix}`), { query: 'evp innova lama', qty: 2 });
  }
  assert.deepEqual(parseReceiptItemQuery('TEST-2'), { query: 'TEST-2', qty: 1 });
  assert.deepEqual(parseReceiptItemQuery('filter 2026'), { query: 'filter 2026', qty: 1 });
});

test('invalid or missing quantity/query never silently becomes qty one', () => {
  for (const query of ['evap 0bh', 'evap -2 unit', 'evap 1.5bh', 'evap 1,5bh', 'evap qty 2147483648', '2bh', '']) {
    assert.throws(() => parseReceiptItemQuery(query));
  }
});

test('aliases work both ways and search returns only active inventory from master', () => {
  for (const term of ['evp', 'evap', 'evaporator']) {
    assert.deepEqual(receiptItemMatches(master, `${term} innova lama`).map(item => item.id), ['1', '2']);
  }
  assert.deepEqual(receiptItemMatches(master, 'TEST-3').map(item => item.id), ['3']);
  assert.deepEqual(receiptItemMatches(master, 'not in master'), []);
  assert.deepEqual(receiptItemMatches(master, ''), []);
});

test('ambiguous selection keeps qty; several items become lines of a single receipt', () => {
  const parsed = parseReceiptItemQuery('evp innova lama 2bh');
  const selected = receiptItemMatches(master, parsed.query)[1];
  let draft = newReceiptDraft();
  const receiptId = draft.id;
  draft = addReceiptItem(draft, selected, parsed.qty);
  draft = addReceiptItem(draft, master[2], 3);
  assert.equal(draft.id, receiptId);
  assert.deepEqual(buildReceiptLines(draft, master).map(line => [line.itemId, line.itemCode, line.itemName, line.qty, line.unit]),
    [['2', 'TEST-2', master[1].name, 2, 'PCS'], ['3', 'TEST-3', master[2].name, 3, 'PCS']]);
});

test('same item sums quantities without duplicate lines; add leaves confirmation stage', () => {
  const draft = addReceiptItem(newReceiptDraft(), master[0], 2);
  const next = addReceiptItem({ ...draft, stage: 'confirm' }, master[0], 3);
  assert.deepEqual(next.items, [{ itemId: '1', qty: 5 }]);
  assert.equal(next.stage, 'items');
  assert.equal(draft.items[0].qty, 2);
  assert.throws(() => addReceiptItem(next, master[0], 2147483647));
});

test('restore retains basket and retry identity, migrates old single item and requires review again', () => {
  let draft = addReceiptItem(newReceiptDraft(), master[0], 2);
  draft = addReceiptItem(draft, master[2], 1);
  const restored = restoreReceiptDraft(JSON.parse(JSON.stringify({ ...draft, stage: 'confirm' })));
  assert.deepEqual(restored.items, draft.items);
  assert.equal(restored.id, draft.id);
  assert.equal(restored.stage, 'items');
  assert.deepEqual(restoreReceiptDraft({ action: 'create_goods_receipt', itemId: '1', qty: 2 }).items, [{ itemId: '1', qty: 2 }]);
  assert.equal(restoreReceiptDraft({ action: 'create_goods_receipt', items: [{ itemId: '1', qty: -1 }] }), null);
});

test('save rejects unresolved selection, empty basket, invalid qty and inactive/removed items', () => {
  const draft = addReceiptItem(newReceiptDraft(), master[0], 2);
  for (const invalid of [{ ...draft, items: [] }, { ...draft, awaitingItem: true },
    { ...draft, selection: { query: 'evap', qty: 1, itemIds: ['1', '2'] } },
    { ...draft, items: [{ itemId: '1', qty: 0 }] }]) assert.throws(() => buildReceiptLines(invalid, master));
  assert.throws(() => buildReceiptLines(draft, []));
  assert.throws(() => buildReceiptLines(draft, [item('1', 'Inactive', { isActive: false })]));
  assert.throws(() => buildReceiptLines({ ...draft, items: [...draft.items, ...draft.items] }, master));
});
