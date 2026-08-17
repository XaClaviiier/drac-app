import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pembuatan faktur berjalan atomik dan mengizinkan stok minus', () => {
  const php = source('api/endpoints/sales-invoices.php');
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /adjustBranchStockAllowNegative\s*\(/);
  assert.match(php, /->commit\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
  assert.match(php, /invoice_id\s*=\s*\?/);
});

test('pembayaran mengunci faktur dan menolak nilai melebihi sisa tagihan', () => {
  const php = source('api/endpoints/customer-payments.php');
  assert.match(php, /sales_invoices WHERE id=\? FOR UPDATE/);
  assert.match(php, /Nominal pembayaran melebihi sisa tagihan/);
  assert.match(php, /recalculateCustomerInvoice\s*\(/);
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
});

test('penghapusan faktur mengembalikan stok dan melepas relasi WO', () => {
  const php = source('api/endpoints/sales-invoices.php');
  assert.match(php, /adjustBranchStockAllowNegative\([^;]+\(int\)\$detail\['qty'\]/s);
  assert.match(php, /UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL/);
  assert.match(php, /Hapus pembayaran terlebih dahulu sebelum menghapus faktur/);
});
