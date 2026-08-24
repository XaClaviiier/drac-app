import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('nomor nota fisik tersimpan sebagai identitas faktur opsional', () => {
  assert.match(read('src/types/index.ts'), /manualReceiptNumber\?: string/);
  assert.match(read('database/dokterac_schema.sql'), /manual_receipt_number` VARCHAR\(50\) NULL/);
});

test('database dan API menolak nomor nota fisik ganda', () => {
  const schema = read('database/dokterac_schema.sql');
  const endpoint = read('api/endpoints/sales-invoices.php');

  assert.match(schema, /UNIQUE KEY `uniq_sales_manual_receipt_number` \(`manual_receipt_number`\)/);
  assert.match(endpoint, /CREATE UNIQUE INDEX uniq_sales_manual_receipt_number/);
  assert.match(endpoint, /No\. Nota Fisik \{\$number\} sudah dipakai pada Faktur \{\$existing\}/);
  assert.match(endpoint, /manual_receipt_number=\?/);
});

test('semua jalur pembuatan faktur membawa dan memeriksa nomor nota fisik', () => {
  const invoicePage = read('src/pages/SalesInvoice.tsx');
  const workOrders = read('src/pages/WorkOrders.tsx');
  const apiClient = read('src/lib/apiClient.ts');
  const appContext = read('src/context/AppContext.tsx');

  assert.match(invoicePage, /No\. Nota Fisik/);
  assert.match(invoicePage, /duplicateManualReceipt/);
  assert.match(workOrders, /invoiceManualReceiptNumber/);
  assert.match(workOrders, /duplicateManualReceipt/);
  assert.match(apiClient, /manualReceiptNumber/);
  assert.match(appContext, /manualReceiptNumber/);
});

test('nomor nota fisik dapat dicari dan ikut pada hasil bagikan', () => {
  const invoicePage = read('src/pages/SalesInvoice.tsx');
  assert.match(invoicePage, /nota fisik, pelanggan, kendaraan/);
  assert.match(invoicePage, /NO\. NOTA FISIK:/);
});
