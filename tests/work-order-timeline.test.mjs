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
