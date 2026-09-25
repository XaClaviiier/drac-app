import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard membedakan periode transaksi, saldo saat ini, dan sumber yang gagal dimuat', () => {
  const dashboard = source('src/pages/Dashboard.tsx');
  assert.match(dashboard, /buildDashboardMetrics/);
  assert.match(dashboard, /getDashboardComparisonRange/);
  assert.match(dashboard, /countWorkOrderAttentionByKind\(attentionItems\)/);
  assert.match(dashboard, /dataLoadError/);
  assert.match(dashboard, /payments: validPayments \? payments\.data : null/);
  assert.match(dashboard, /Saldo saat ini · semua periode/);
  assert.match(dashboard, /Tanggal pembayaran/);
  assert.doesNotMatch(dashboard, /title="Beban Perusahaan"|title="Arus Kas"|Lewat jatuh tempo/);
  assert.match(dashboard, /source: 'dashboard'/);
  assert.match(dashboard, /minAge: '8'/);
});

test('dashboard desktop dan HP menggunakan angka dan hak akses yang sama', () => {
  const dashboard = source('src/pages/Dashboard.tsx');
  const panels = source('src/components/DashboardPanels.tsx');
  assert.doesNotMatch(dashboard, /<MobileDashboard/);
  assert.match(dashboard, /const canViewBranchPerformance = canViewFinancial && canUseInvoiceData/);
  assert.match(dashboard, /canViewPayments \? api\.get\('customer-payments'\)/);
  assert.match(dashboard, /<BranchTable metrics=\{metrics\}/);
  assert.match(panels, /hidden overflow-x-auto md:block/);
  assert.match(panels, /md:hidden/);
  assert.match(panels, /ResizeObserver/);
  const calculator = source('src/lib/dashboardMetrics.ts');
  assert.doesNotMatch(calculator, /150_000_000|75_000_000/);
});

test('target cabang dan data faktur tetap dilindungi permission di server', () => {
  const apiRouter = source('api/index.php');
  const apiHelpers = source('api/helpers.php');
  const allData = source('api/endpoints/all-data.php');
  const targetEndpoint = source('api/endpoints/branch-targets.php');
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
