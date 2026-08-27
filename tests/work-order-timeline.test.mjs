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
  assert.match(page, />INV<\/span>/);
  assert.match(page, />Rp<\/span>/);
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
  assert.match(page, /const done = row\.stage === 'done'/);
  assert.doesNotMatch(page, /const done = row\.stage === 'done' \|\| Boolean\(row\.invoice\)/);
});
