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

test('dashboard desktop dan mobile memakai ringkasan target cabang yang sama', () => {
  const dashboard = source('src/pages/Dashboard.tsx');
  const mobile = source('src/components/MobileDashboard.tsx');
  const calculator = source('src/lib/branchPerformance.ts');
  const apiRouter = source('api/index.php');
  const apiHelpers = source('api/helpers.php');
  const allData = source('api/endpoints/all-data.php');
  const targetEndpoint = source('api/endpoints/branch-targets.php');

  assert.match(dashboard, /buildBranchPerformanceSummary/);
  assert.match(dashboard, /api\.get\('branch-targets'\)/);
  assert.match(dashboard, /const canViewBranchPerformance = canViewFinancial && canUseInvoiceData/);
  assert.match(dashboard, /ExecutiveBranchPerformance/);
  assert.match(dashboard, /Target vs Realisasi/);
  assert.match(dashboard, /<MobileDashboard branchPerformance=.*canViewBranchPerformance=/);
  assert.doesNotMatch(dashboard, /const executiveBranchPerformance = useMemo/);
  assert.match(mobile, /branchPerformance: BranchPerformanceSummary \| null/);
  assert.doesNotMatch(mobile, /useMemo\(\(\)=>buildBranchPerformanceSummary/);
  assert.match(mobile, /Target Cabang Bulan Ini/);
  assert.match(mobile, /Target cabang belum dapat dimuat/);
  assert.doesNotMatch(calculator, /150_000_000|75_000_000/);
  assert.match(apiRouter, /\$resource === 'branch-targets'/);
  assert.match(apiHelpers, /function authenticatedUserIsOwnerOrAdministrator/);
  assert.match(apiRouter, /authenticatedUserIsOwnerOrAdministrator\(\$pdo, \$requestUser\)/);
  assert.match(allData, /\$canUseInvoices = authenticatedUserIsOwnerOrAdministrator\(\$pdo, \$actor\)/);
  assert.match(apiRouter, /requireAuthenticatedUserPermission\(\$pdo, \$requestUser, 'report:view'\)/);
  assert.match(apiRouter, /authenticatedUserHasPermission\(\$pdo, \$requestUser, 'invoice:view'\)/);
  assert.match(apiRouter, /authenticatedUserHasPermission\(\$pdo, \$requestUser, 'payment:view'\)/);
  assert.match(apiRouter, /case 'branch-targets'/);
  assert.match(targetEndpoint, /150000000/);
  assert.match(targetEndpoint, /75000000/);
});
