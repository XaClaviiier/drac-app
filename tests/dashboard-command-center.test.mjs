import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard menjadi pusat kendali yang dapat membuka daftar terfilter', () => {
  const dashboard = source('src/pages/Dashboard.tsx');

  assert.match(dashboard, /buildWorkOrderAttentionItems\(visibleWOs, visibleInvoices, todayKey\)/);
  assert.match(dashboard, /countWorkOrderAttentionByKind\(attentionItems\)/);
  assert.match(dashboard, /to=\{`\/invoices\?date=\$\{todayKey\}`\}/);
  assert.match(dashboard, /value=\{`\$\{todayInvoices\.length\} Faktur`\}/);
  assert.match(dashboard, /to="\/workorders\?status=Proses"/);
  assert.match(dashboard, /to="\/workorders\?status=Selesai&attention=1"/);
  assert.match(dashboard, /label="Pembayaran Hari Ini"/);
  assert.match(dashboard, /data\.warehouseStocks/);
  assert.match(dashboard, /negativeStockCount/);
  assert.match(dashboard, /pendingVerificationCount/);
});

test('daftar faktur dan WO membaca filter tanggal dari tautan dashboard', () => {
  const invoices = source('src/pages/SalesInvoice.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');

  assert.match(invoices, /const requestedDate = searchParams\.get\('date'\)/);
  assert.match(invoices, /setFilterDate\(requestedDate\)/);
  assert.match(invoices, /const updateFilterDate = \(date: string\)/);
  assert.match(invoices, /next\.delete\('date'\)/);
  assert.match(workOrders, /const requestedDate = searchParams\.get\('date'\)/);
  assert.match(workOrders, /setSelectedWorkOrderDate\(requestedDate\)/);
  assert.match(workOrders, /const requestedStatus = searchParams\.get\('status'\)/);
  assert.match(workOrders, /setFilterStatus\(requestedStatus\)/);
});
