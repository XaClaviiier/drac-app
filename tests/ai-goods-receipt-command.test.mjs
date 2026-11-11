import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assistant = readFileSync(new URL('../src/pages/AIAssistant.tsx', import.meta.url), 'utf8');
const receiptEndpoint = readFileSync(new URL('../api/endpoints/goods-receipts.php', import.meta.url), 'utf8');

test('AI Terima Barang hanya mencari persediaan aktif dari Master Barang', () => {
  assert.match(assistant, /content\.match\(\/\^terima\(\?:\\s\+barang\)\?\\s\+\(\.\+\?\)\\s\*\$\/i\)/);
  assert.match(assistant, /item\.isActive && item\.type === 'Persediaan'/);
  assert.match(assistant, /itemCode: item\.code/);
  assert.match(assistant, /itemName: item\.name/);
  assert.match(assistant, /type: 'select_receipt_item'/);
  assert.match(assistant, /parseReceiptItemQuery/);
  assert.match(assistant, /const qty = Number\(suffix\[1\] \|\| suffix\[2\]\)/);
  assert.match(assistant, /qty: Number\(action\.qty\) \|\| 1/);
});

test('AI receipt memakai endpoint penerimaan yang sama untuk status Diterima dan stok', () => {
  assert.match(assistant, /addGoodsReceipt\(receipt\)/);
  assert.match(assistant, /status: 'Diterima'/);
  assert.match(assistant, /warehouseId: warehouse\.id/);
  assert.match(receiptEndpoint, /if \(\$newStatus === 'Diterima' && !empty\(\$d\['items'\]\)\)/);
  assert.match(receiptEndpoint, /adjustWarehouseStockAllowNegative\(\$pdo,\$warehouseId/);
  assert.match(receiptEndpoint, /recordStockMovement\(/);
});
