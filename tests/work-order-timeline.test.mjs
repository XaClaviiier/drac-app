import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');

const helperSource = source('src/lib/workOrderTimeline.ts');
const transformedHelper = transformSync(helperSource, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const helper = await import(`data:text/javascript;base64,${Buffer.from(transformedHelper).toString('base64')}`);

function workOrder(overrides = {}) {
  return {
    id: 'WO-1',
    date: '2026-08-27',
    status: 'Register',
    statusLog: [],
    ...overrides,
  };
}

test('tahap timeline mengikuti peristiwa operasional terbaru tanpa mengubah status inti', () => {
  const wo = workOrder({
    status: 'Proses',
    statusLog: [
      { from: 'Register', to: 'Register', at: '2026-08-27T08:00:00+08:00', reason: '[WO_TIMELINE_STAGE:approval]' },
      { from: 'Register', to: 'Proses', at: '2026-08-27T09:00:00+08:00' },
      { from: 'Proses', to: 'Proses', at: '2026-08-27T10:00:00+08:00', reason: '[WO_TIMELINE_STAGE:parts] Menunggu evaporator' },
    ],
  });
  assert.equal(helper.timelineStageFromWorkOrder(wo), 'parts');
  assert.equal(wo.status, 'Proses');

  const resumed = { ...wo, statusLog: [...wo.statusLog, { from: 'Proses', to: 'Proses', at: '2026-08-27T11:00:00+08:00', reason: '[WO_TIMELINE_STAGE:working]' }] };
  assert.equal(helper.timelineStageFromWorkOrder(resumed), 'working');
});

test('transisi inti Proses yang lebih baru mengalahkan tahap tunggu sebelumnya', () => {
  const wo = workOrder({
    status: 'Proses',
    statusLog: [
      { from: 'Register', to: 'Register', at: '2026-08-27T08:00:00+08:00', reason: '[WO_TIMELINE_STAGE:approval]' },
      { from: 'Register', to: 'Proses', at: '2026-08-27T09:00:00+08:00' },
    ],
  });
  assert.equal(helper.timelineStageFromWorkOrder(wo), 'working');
});

test('tahap tunggu hanya dapat dipilih dari Dikerjakan', () => {
  const stages = ['diagnosis', 'working', 'approval', 'parts', 'lost'];
  const nextStages = ['diagnosis', 'approval', 'parts', 'working'];
  const allowed = new Set([
    'diagnosis:working',
    'working:approval',
    'working:parts',
    'approval:working',
    'parts:working',
  ]);

  for (const current of stages) {
    for (const next of nextStages) {
      assert.equal(
        helper.isTimelineStageTransitionAllowed(current, next),
        allowed.has(`${current}:${next}`),
        `${current} -> ${next}`,
      );
    }
  }
});

test('action bar dan API menegakkan urutan Diagnosa, Dikerjakan, lalu status tunggu', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');
  const context = source('src/context/AppContext.tsx');
  const endpoint = source('api/endpoints/work-orders.php');
  const actionBlock = stage => {
    const start = page.indexOf(`selectedStage === '${stage}'`);
    assert.notEqual(start, -1, `blok aksi ${stage} tersedia`);
    return page.slice(start, page.indexOf('</>}', start));
  };

  const diagnosis = actionBlock('diagnosis');
  const approval = actionBlock('approval');
  const parts = actionBlock('parts');
  const working = actionBlock('working');
  assert.doesNotMatch(diagnosis, /Tunggu Persetujuan|Tunggu Parts/);
  assert.doesNotMatch(approval, /Tunggu Parts/);
  assert.doesNotMatch(parts, /Tunggu Persetujuan|Selesai/);
  assert.match(working, /Tunggu Persetujuan/);
  assert.match(working, /Tunggu Parts/);
  assert.match(context, /isTimelineStageTransitionAllowed\(timelineStageFromWorkOrder\(wo\), stage\)/);
  assert.ok(context.indexOf('isTimelineStageTransitionAllowed(timelineStageFromWorkOrder(wo), stage)') < context.indexOf('if (isDemoMode)', context.indexOf('const changeWorkOrderTimelineStage')));
  assert.match(endpoint, /\$isTimelineStageTransitionAllowed\(\$currentTimelineStage, \$stage\)/);
  assert.match(endpoint, /Status tunggu hanya dapat dipilih dari Dikerjakan/);
});

test('kontrak Control Board menyimpan audit tahap dan mempertahankan alur faktur pembayaran', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');
  const context = source('src/context/AppContext.tsx');
  const endpoint = source('api/endpoints/work-orders.php');

  assert.match(page, /DEFAULT_AXIS_END_MINUTE = 17 \* 60 \+ 30/);
  assert.match(page, /Sekarang \{formatClock\(clock\)\}/);
  assert.match(page, /changeWorkOrderTimelineStage/);
  assert.match(page, /\/invoices\?woId=/);
  assert.match(page, /\/customer-payments\?invoiceId=/);
  assert.match(page, /timelineFinancialSummary/);
  assert.match(page, /financial\.invoiceNumber/);
  assert.match(page, /financial\.isPaid/);
  assert.match(context, /appendTimelineStageLog/);
  assert.match(endpoint, /\$action === 'timeline-stage'/);
  assert.match(endpoint, /\[WO_TIMELINE_STAGE:/);
  assert.match(endpoint, /UPDATE work_orders SET status_log=\?,pending_at=\?,pending_reason=\?/);
  assert.doesNotMatch(endpoint, /UPDATE work_orders SET status='(?:Pengecekan|Pending)'/);
});

test('WO Timeline HP menjaga identitas, indikator, fokus sekarang, dan mode hari penuh', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');

  assert.match(page, /mobileTimelineRef/);
  assert.match(page, /scrollMobileToNow/);
  assert.match(page, /mobileView.*'focus'.*'full'/);
  assert.match(page, /sticky left-0 z-30/);
  assert.match(page, /sticky right-0 z-30/);
  assert.match(page, />Sekarang<\/button>/);
  assert.match(page, />Hari Penuh<\/button>/);
  assert.match(page, /md:hidden.*mobileView === 'full'/);
  assert.match(page, /hidden md:block.*renderFocusBoard\(false\)/);
  assert.match(page, /renderFinancialSummary\(row, true\)/);
  assert.doesNotMatch(page, /Boolean\(row\.invoice\).*stage === 'done'|stage === 'done'.*Boolean\(row\.invoice\)/);
});

test('ringkasan finansial timeline hanya memberi stamp LUNAS dari pembayaran terverifikasi', () => {
  const unpaid = helper.timelineFinancialSummary({ total: 1_250_000 }, {
    invoiceNumber: 'INV-1', total: 1_250_000, payment: 750_000, status: 'Belum Lunas',
  });
  assert.deepEqual(unpaid, {
    amount: 1_250_000,
    amountLabel: 'Total',
    invoiceNumber: 'INV-1',
    isPaid: false,
    outstanding: 500_000,
  });

  const paid = helper.timelineFinancialSummary({ total: 1_250_000 }, {
    invoiceNumber: 'INV-2', total: 1_250_000, payment: 1_250_000, status: 'Lunas',
  });
  assert.equal(paid.isPaid, true);
  assert.equal(paid.outstanding, 0);

  const inconsistent = helper.timelineFinancialSummary({ total: 1_250_000 }, {
    invoiceNumber: 'INV-3', total: 1_250_000, payment: 500_000, status: 'Lunas',
  });
  assert.equal(inconsistent.isPaid, false);
  assert.equal(inconsistent.outstanding, 750_000);

  const estimate = helper.timelineFinancialSummary({ total: 850_000 });
  assert.deepEqual(estimate, {
    amount: 850_000,
    amountLabel: 'Estimasi',
    invoiceNumber: null,
    isPaid: false,
    outstanding: null,
  });

  assert.equal(helper.timelineFinancialSummary({ total: 100_000 }, {
    invoiceNumber: 'INV-4', total: 100_000, payment: 100_000, status: 'Belum Lunas',
  }).isPaid, false);
  assert.equal(helper.timelineFinancialSummary({ total: 0 }, {
    invoiceNumber: 'INV-5', total: 0, payment: 0, status: 'Lunas',
  }).isPaid, false);
  assert.deepEqual(helper.timelineFinancialSummary({ total: 100_000 }, {
    invoiceNumber: 'INV-6', total: 100_000, payment: 125_000, status: 'Lunas',
  }), {
    amount: 100_000,
    amountLabel: 'Total',
    invoiceNumber: 'INV-6',
    isPaid: true,
    outstanding: 0,
  });
});

test('Control Board menempatkan badge status di identitas dan ringkasan finansial di kanan', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');

  assert.match(page, /timelineFinancialSummary/);
  assert.match(page, /const renderFinancialSummary =/);
  assert.match(page, /financial\.amountLabel/);
  assert.match(page, /formatRupiah\(financial\.amount\)/);
  assert.match(page, /financial\.invoiceNumber/);
  assert.match(page, /financial\.outstanding/);
  assert.match(page, /financial\.isPaid[\s\S]*?LUNAS/);
  assert.match(page, /wo\.plateNumber[\s\S]*?currentConfig\?\.short/);
  assert.match(page, /Total · Invoice/);
  assert.doesNotMatch(page, /const renderIndicators =/);
});

test('lebar kolom mobile dipakai konsisten oleh grid dan centering Sekarang', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');

  assert.match(page, /const MOBILE_IDENTITY_WIDTH = 144/);
  assert.match(page, /const MOBILE_FINANCIAL_WIDTH = 124/);
  assert.match(page, /mobileIdentityWidth = MOBILE_IDENTITY_WIDTH/);
  assert.match(page, /mobileFinancialWidth = MOBILE_FINANCIAL_WIDTH/);
  assert.match(page, /identityWidth = mobile \? MOBILE_IDENTITY_WIDTH : 260/);
  assert.match(page, /indicatorWidth = mobile \? MOBILE_FINANCIAL_WIDTH : 168/);
  assert.doesNotMatch(page, /mobileIndicatorWidth = 84/);
});
