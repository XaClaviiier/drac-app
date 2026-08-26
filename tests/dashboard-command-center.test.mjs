import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard menjadi pusat kendali yang dapat membuka daftar terfilter', () => {
  const dashboard = source('src/pages/Dashboard.tsx');

  assert.match(dashboard, /buildWorkOrderAttentionItems\(visibleWOs, visibleInvoices, todayKey\)/);
  assert.match(dashboard, /countWorkOrderAttentionByKind\(attentionItems\)/);
  assert.doesNotMatch(dashboard, /label="WO Hari Ini"/);
  assert.doesNotMatch(dashboard, /label="Sedang Dikerjakan"/);
  assert.doesNotMatch(dashboard, /label="Selesai Belum Faktur"/);
  assert.doesNotMatch(dashboard, /label="Kas Masuk · 10 Hari"/);
  assert.doesNotMatch(dashboard, /function KpiCard/);
  assert.match(dashboard, /data\.warehouseStocks/);
  assert.match(dashboard, /negativeStockCount/);
  assert.match(dashboard, /pendingVerificationCount/);
  assert.match(dashboard, /title="Arus Kas"/);
  assert.match(dashboard, /CashFlowMonthChart rows=\{monthlyMetrics\}/);
  assert.match(dashboard, /title="Penjualan"/);
  assert.match(dashboard, /title="Tren Penjualan"/);
  assert.match(dashboard, /title="Beban Perusahaan"/);
  assert.match(dashboard, /invoice\.payments \|\| \[\]/);
  assert.match(dashboard, /Ringkasan Operasional Cabang/);
  assert.match(dashboard, /currentMonthWOs/);
  assert.match(dashboard, /currentMonthCash/);
  assert.match(dashboard, /currentMonthNonCash/);
  assert.match(dashboard, /projectedMonthSales/);
  assert.match(dashboard, /Tunai belum disetor/);
});

test('daftar faktur dan WO membaca filter tanggal dari tautan dashboard', () => {
  const invoices = source('src/pages/SalesInvoice.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');

  assert.match(invoices, /const requestedDate = searchParams\.get\('date'\)/);
  assert.match(invoices, /setFilterDate\(requestedDate\)/);
  assert.match(invoices, /const updateFilterDate = \(date: string\)/);
  assert.match(invoices, /next\.delete\('date'\)/);
  assert.match(invoices, /const requestedStatus = searchParams\.get\('status'\)/);
  assert.match(invoices, /setFilterStatus\(requestedStatus\)/);
  assert.match(workOrders, /const requestedDate = searchParams\.get\('date'\)/);
  assert.match(workOrders, /setSelectedWorkOrderDate\(requestedDate\)/);
  assert.match(workOrders, /const requestedStatus = searchParams\.get\('status'\)/);
  assert.match(workOrders, /setFilterStatus\(requestedStatus\)/);
});
