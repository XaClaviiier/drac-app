import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardMetrics, dashboardDays, getDashboardComparisonRange,
  getDashboardRange, isDashboardRangeValid,
} from '../src/lib/dashboardMetrics.ts';

const branches = [
  { id: 'P', name: 'CABANG PERINTIS', isActive: true },
  { id: 'C', name: 'CABANG CAKALANG', isActive: true },
  { id: 'X', name: 'Cabang Baru', isActive: true },
  { id: 'OLD', name: 'Cabang Tutup', isActive: false },
];
const base = {
  branches, invoices: [], workOrders: [], payments: [], branchId: 'ALL',
  targets: { PERINTIS: 3000, CAKALANG: 1500, MAMUJU: 1500 },
  today: '2026-09-10', range: { from: '2026-09-01', to: '2026-09-10' },
  comparisonRange: { from: '2026-08-01', to: '2026-08-10' },
};
const invoice = (id, branchId, date, total, payment = 0, extra = {}) => ({ id, branchId, date, total, payment, ...extra });
const payment = (branchId, date, amount, paymentMethod = 'Tunai') => ({ branchId, date, amount, paymentMethod });

test('preset dates handle year boundaries, leap days and seven inclusive days', () => {
  assert.deepEqual(getDashboardRange('yesterday', '2026-01-01', base.range), { from: '2025-12-31', to: '2025-12-31' });
  assert.deepEqual(getDashboardRange('last7', '2024-03-03', base.range), { from: '2024-02-26', to: '2024-03-03' });
  assert.deepEqual(getDashboardRange('lastMonth', '2024-03-31', base.range), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(getDashboardRange('lastMonth', '2026-01-10', base.range), { from: '2025-12-01', to: '2025-12-31' });
  assert.equal(dashboardDays({ from: '2024-02-28', to: '2024-03-01' }), 3);
});

test('validation rejects invalid, reversed, future and excessively long dates', () => {
  for (const range of [
    { from: '2025-02-29', to: '2025-03-01' },
    { from: '2026-02-01', to: '2026-02-30' },
    { from: '2026-09-10', to: '2026-09-09' },
    { from: '2026-09-01', to: '2026-09-11' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-9-01', to: '2026-09-10' },
  ]) assert.equal(isDashboardRangeValid(range, base.today), false, JSON.stringify(range));
  assert.equal(isDashboardRangeValid({ from: '2024-01-01', to: '2024-12-31' }, base.today), true);
  assert.equal(isDashboardRangeValid({ from: '2024-02-29', to: '2024-02-29' }, base.today), true);
  assert.throws(() => buildDashboardMetrics({ ...base, range: { from: '2020-01-01', to: base.today } }), RangeError);
});

test('comparison uses matching month dates, full prior months and clamped leap days', () => {
  assert.deepEqual(getDashboardComparisonRange({ from: '2026-09-01', to: '2026-09-25' }, 'previous', 'thisMonth'), { from: '2026-08-01', to: '2026-08-25' });
  assert.deepEqual(getDashboardComparisonRange({ from: '2026-03-01', to: '2026-03-31' }, 'previous', 'thisMonth'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(getDashboardComparisonRange({ from: '2024-02-01', to: '2024-02-29' }, 'previous', 'lastMonth'), { from: '2024-01-01', to: '2024-01-31' });
  assert.deepEqual(getDashboardComparisonRange({ from: '2024-02-29', to: '2024-02-29' }, 'lastYear', 'today'), { from: '2023-02-28', to: '2023-02-28' });
  assert.deepEqual(getDashboardComparisonRange({ from: '2026-01-01', to: '2026-01-07' }, 'previous', 'custom'), { from: '2025-12-25', to: '2025-12-31' });
  assert.equal(getDashboardComparisonRange(base.range, 'none', 'thisMonth'), null);
});

test('sales, receipts and current receivables retain their independent date scopes', () => {
  const metrics = buildDashboardMetrics({
    ...base, branchId: 'P',
    invoices: [
      invoice('previous', 'P', '2026-08-02', 200, 50),
      invoice('old', 'P', '2025-01-01', 300, 100),
      invoice('current', 'P', '2026-09-03', 1000, 800),
      invoice('future', 'P', '2026-09-11', 9000),
      invoice('invalid', 'P', '2026-02-30', 9000),
      invoice('cancelled', 'P', '2026-09-05', 9000, 0, { status: 'Cancelled' }),
    ],
    payments: [payment('P', '2026-09-02', 100), payment('P', '2026-09-04', 250, 'Transfer'), payment('P', '2026-08-03', 200), payment('P', '2026-09-11', 9000)],
  });
  assert.equal(metrics.sales, 1000);
  assert.equal(metrics.invoiceCount, 1);
  assert.equal(metrics.averageInvoice, 1000);
  assert.equal(metrics.previousSales, 200);
  assert.equal(metrics.receipts, 350);
  assert.equal(metrics.cash, 100);
  assert.equal(metrics.nonCash, 250);
  assert.equal(metrics.receivable, 550);
  assert.equal(metrics.receivableCount, 3);
  assert.equal(metrics.rows[0].received, 350);
  assert.equal(metrics.rows[0].receivable, 550);
  const oneDay = buildDashboardMetrics({ ...base, branchId: 'P', range: { from: '2026-09-10', to: '2026-09-10' }, invoices: [invoice('old', 'P', '2025-01-01', 300, 100)] });
  assert.equal(oneDay.sales, 0);
  assert.equal(oneDay.receivable, 200);
});

test('branch selection limits every total, row and trend to accessible active branches', () => {
  const inputs = { ...base, invoices: [invoice('p', 'P', '2026-09-01', 10), invoice('c', 'C', '2026-09-01', 20), invoice('x', 'X', '2026-09-01', 30), invoice('old', 'OLD', '2026-09-01', 40), invoice('private', 'PRIVATE', '2026-09-01', 50)], payments: [payment('P', '2026-09-01', 5), payment('C', '2026-09-01', 15)] };
  const all = buildDashboardMetrics(inputs);
  assert.deepEqual(all.rows.map(row => row.branchId), ['P', 'C', 'X']);
  assert.equal(all.sales, 60);
  assert.equal(all.receipts, 20);
  assert.equal(all.trend.reduce((total, row) => total + row.sales, 0), 60);
  const selected = buildDashboardMetrics({ ...inputs, branchId: 'C' });
  assert.equal(selected.sales, 20);
  assert.equal(selected.receivable, 20);
  assert.equal(selected.receipts, 15);
  assert.equal(selected.rows.length, 1);
  assert.equal(selected.rows[0].branchId, 'C');
});

test('unknown targets keep branches visible and prevent misleading combined achievement', () => {
  const metrics = buildDashboardMetrics({ ...base, invoices: [invoice('p', 'P', '2026-09-01', 1000), invoice('x', 'X', '2026-09-01', 9000)] });
  assert.equal(metrics.rows[0].target, 3000);
  assert.equal(metrics.rows[0].achievementPercent, 33.3);
  assert.equal(metrics.rows[0].paceTarget, 1000);
  assert.equal(metrics.rows[0].paceDifference, 0);
  assert.equal(metrics.rows[0].projectedSales, 3000);
  assert.equal(metrics.rows[2].target, null);
  assert.equal(metrics.target, null);
  assert.equal(metrics.achievementPercent, null);
  assert.equal(metrics.targetsComplete, false);
  const available = buildDashboardMetrics({ ...base, branches: branches.slice(0, 2) });
  assert.equal(available.target, 4500);
  assert.equal(available.targetsComplete, true);
  for (const targets of [null, { PERINTIS: 0 }, { PERINTIS: NaN }]) {
    assert.equal(buildDashboardMetrics({ ...base, branchId: 'P', targets }).target, null);
  }
});

test('historical or partial ranges never reuse current monthly targets or project a full month', () => {
  for (const range of [{ from: '2026-08-01', to: '2026-08-31' }, { from: '2026-09-05', to: '2026-09-10' }]) {
    const metrics = buildDashboardMetrics({ ...base, branchId: 'P', range });
    for (const key of ['target', 'achievementPercent', 'projectedSales', 'paceTarget', 'paceDifference']) {
      assert.equal(metrics[key], null, key);
      assert.equal(metrics.rows[0][key], null, key);
    }
  }
});

test('WO conversion requires a real same-branch invoice and does not mean payment is complete', () => {
  const metrics = buildDashboardMetrics({
    ...base,
    invoices: [invoice('invC', 'C', '2026-09-05', 100, 0, { woNumber: 'WO-SAME' }), invoice('invP', 'P', '2026-09-05', 200, 0, { woId: 'p2' }), invoice('future', 'P', '2026-09-11', 300, 0, { woId: 'p3' })],
    workOrders: [
      { id: 'p1', branchId: 'P', woNumber: 'WO-SAME', date: '2026-09-01', status: 'Selesai', invoiceId: 'invC' },
      { id: 'p2', branchId: 'P', date: '2026-09-01', status: 'Selesai' },
      { id: 'p3', branchId: 'P', date: '2026-09-01', status: 'Proses', invoiceId: 'future' },
      { id: 'p4', branchId: 'P', date: '2026-09-01', status: 'Register' },
      { id: 'p5', branchId: 'P', date: '2026-09-01', status: 'Closed' },
      { id: 'c1', branchId: 'C', woNumber: 'WO-SAME', date: '2026-09-01', status: 'Selesai' },
    ],
  });
  assert.deepEqual(metrics.workOrders, { total: 6, register: 1, process: 1, completed: 3, closed: 1, active: 2, invoiced: 2, awaitingInvoice: 1, conversionPercent: 33.3 });
});

test('daily comparison preserves all amounts and exact ranges when month lengths differ', () => {
  const metrics = buildDashboardMetrics({
    ...base, today: '2024-03-10', range: { from: '2024-02-01', to: '2024-02-29' }, comparisonRange: { from: '2024-01-01', to: '2024-01-31' },
    invoices: [invoice('feb', 'P', '2024-02-29', 100), invoice('jan29', 'P', '2024-01-29', 200), invoice('jan31', 'P', '2024-01-31', 300)],
  });
  assert.equal(metrics.trendUnit, 'day');
  assert.equal(metrics.trend.length, 31);
  assert.equal(metrics.trend.reduce((total, row) => total + row.sales, 0), metrics.sales);
  assert.equal(metrics.trend.reduce((total, row) => total + (row.previousSales || 0), 0), metrics.previousSales);
  assert.equal(metrics.trend[30].from, null);
  assert.equal(metrics.trend[30].previousFrom, '2024-01-31');
  assert.equal(metrics.trend[30].previousSales, 300);
});

test('long ranges aggregate into no more than 53 weeks and keep exact sum on final partial week', () => {
  const metrics = buildDashboardMetrics({
    ...base, today: '2025-01-01', range: { from: '2024-01-01', to: '2024-12-31' }, comparisonRange: { from: '2023-01-01', to: '2023-12-31' },
    invoices: [invoice('first', 'P', '2024-01-01', 10), invoice('last', 'P', '2024-12-31', 20), invoice('prev', 'P', '2023-12-31', 30)],
  });
  assert.equal(metrics.trendUnit, 'week');
  assert.equal(metrics.trend.length, 53);
  assert.equal(metrics.trend[52].to, '2024-12-31');
  assert.equal(metrics.trend[52].previousTo, '2023-12-31');
  assert.equal(metrics.trend.reduce((total, row) => total + row.sales, 0), 30);
  assert.equal(metrics.trend.reduce((total, row) => total + (row.previousSales || 0), 0), 30);
});

test('year comparison keeps both endpoints when its leap year adds a 367th inclusive day', () => {
  const range = { from: '2025-01-01', to: '2026-01-01' };
  const comparisonRange = getDashboardComparisonRange(range, 'lastYear', 'custom');
  assert.equal(dashboardDays(range), 366);
  assert.deepEqual(comparisonRange, { from: '2024-01-01', to: '2025-01-01' });
  const metrics = buildDashboardMetrics({
    ...base, range, comparisonRange,
    invoices: [invoice('leap-start', 'P', '2024-01-01', 10), invoice('leap-end', 'P', '2025-01-01', 20)],
  });
  assert.equal(metrics.previousSales, 30);
  assert.equal(metrics.trend.length, 53);
  assert.equal(metrics.trend.at(-1).previousTo, '2025-01-01');
});
