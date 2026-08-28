import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBranchPerformanceSummary,
} from '../src/lib/branchPerformance.ts';

test('menghitung target dan realisasi bulan berjalan untuk tiga cabang utama', () => {
  const branches = [
    { id: 'BR-001', code: 'P', name: 'CABANG PERINTIS', isActive: true },
    { id: 'BR-002', code: 'C', name: 'CABANG CAKALANG', isActive: true },
    { id: 'BR-003', code: 'M', name: 'CABANG MAMUJU', isActive: true },
  ];
  const invoices = [
    { id: 'INV-1', branchId: 'BR-001', date: '2026-08-01', total: 30_000_000, payment: 20_000_000 },
    { id: 'INV-2', branchId: 'BR-002', date: '2026-08-10', total: 15_000_000, payment: 15_000_000 },
    { id: 'OLD', branchId: 'BR-001', date: '2026-07-31', total: 99_000_000, payment: 99_000_000 },
  ];

  const summary = buildBranchPerformanceSummary({
    branches,
    invoices,
    targets: { PERINTIS: 150_000_000, CAKALANG: 75_000_000, MAMUJU: 75_000_000 },
    now: new Date('2026-08-10T12:00:00+08:00'),
  });

  assert.equal(summary.rows[0].sales, 30_000_000);
  assert.equal(summary.rows[0].received, 20_000_000);
  assert.equal(summary.rows[0].receivable, 10_000_000);
  assert.equal(summary.rows[0].invoiceCount, 1);
  assert.equal(summary.rows[0].target, 150_000_000);
  assert.equal(summary.rows[0].paceTarget, 48_387_097);
  assert.equal(summary.rows[0].projectedSales, 93_000_000);
  assert.equal(summary.rows[1].target, 75_000_000);
  assert.equal(summary.rows[2].sales, 0);
  assert.equal(summary.total.target, 300_000_000);
  assert.equal(summary.total.dailyTarget, 9_677_419);
  assert.equal(summary.total.sales, 45_000_000);
});
