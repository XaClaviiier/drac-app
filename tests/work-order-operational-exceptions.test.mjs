import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const attentionSource = source('src/lib/workOrderAttention.ts');
const transformedAttention = transformSync(attentionSource, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const attention = await import(`data:text/javascript;base64,${Buffer.from(transformedAttention).toString('base64')}`);
const timelineSource = source('src/lib/workOrderTimeline.ts');
const transformedTimeline = transformSync(timelineSource, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const timeline = await import(`data:text/javascript;base64,${Buffer.from(transformedTimeline).toString('base64')}`);

function workOrder(overrides = {}) {
  return {
    id: 'WO-1',
    woNumber: 'WO-001',
    date: '2026-09-02',
    transactionTime: '08:00',
    status: 'Proses',
    statusLog: [
      { from: 'Register', to: 'Proses', at: '2026-09-02T08:00:00+08:00', byUserId: 'U-1', byUserName: 'Teknisi' },
    ],
    services: [],
    total: 100_000,
    notes: '',
    branchId: 'B-1',
    ...overrides,
  };
}

test('Dikerjakan hari ini menjadi perhatian berdasarkan aktivitas operasional terakhir', () => {
  const warningNow = new Date('2026-09-02T10:30:00+08:00');
  const criticalNow = new Date('2026-09-02T12:30:00+08:00');

  const warning = attention.buildWorkOrderAttentionItems([workOrder()], [], '2026-09-02', warningNow);
  assert.equal(warning.length, 1);
  assert.equal(warning[0].kind, 'process');
  assert.equal(warning[0].severity, 'warning');
  assert.equal(warning[0].elapsedMinutes, 150);
  assert.match(warning[0].description, /2j 30m/);

  const critical = attention.buildWorkOrderAttentionItems([workOrder()], [], '2026-09-02', criticalNow);
  assert.equal(critical[0].severity, 'critical');
  assert.equal(critical[0].elapsedMinutes, 270);
});

test('heartbeat Dikerjakan mereset SLA tanpa mengubah status inti', () => {
  const wo = workOrder({
    statusLog: [
      { from: 'Register', to: 'Proses', at: '2026-09-02T08:00:00+08:00', byUserId: 'U-1', byUserName: 'Teknisi' },
      { from: 'Proses', to: 'Proses', at: '2026-09-02T11:30:00+08:00', byUserId: 'U-1', byUserName: 'Teknisi', reason: '[WO_TIMELINE_STAGE:working] Pengerjaan evaporator masih berlangsung' },
    ],
  });

  const items = attention.buildWorkOrderAttentionItems([wo], [], '2026-09-02', new Date('2026-09-02T12:30:00+08:00'));
  assert.deepEqual(items, []);
  assert.equal(wo.status, 'Proses');
});

test('konfirmasi progress adalah heartbeat Dikerjakan yang diaudit dan wajib berketerangan', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');
  const endpoint = source('api/endpoints/work-orders.php');

  assert.equal(timeline.isTimelineStageTransitionAllowed('working', 'working'), true);
  assert.match(page, /Konfirmasi Progress/);
  assert.match(page, /Catatan progress wajib diisi/);
  assert.match(page, /changeWorkOrderTimelineStage\(selected\.id, 'working', note\)/);
  assert.match(endpoint, /\$currentTimelineStage === 'working' && \$stage === 'working'/);
  assert.match(endpoint, /Catatan progress wajib diisi/);
  assert.match(endpoint, /requireAuthenticatedUserPermission\(\$pdo, \$actor, 'wo:edit'\)/);
  const timelineActionStart = endpoint.indexOf("if ($action === 'timeline-stage')");
  const permissionCheck = endpoint.indexOf("requireAuthenticatedUserPermission($pdo, $actor, 'wo:edit')", timelineActionStart);
  const transactionStart = endpoint.indexOf('$pdo->beginTransaction();', timelineActionStart);
  assert.ok(permissionCheck < transactionStart, 'izin wo:edit diperiksa sebelum transaksi dibuka');
  assert.ok(endpoint.indexOf('SELECT id,status,branch_id,invoice_id,status_log') < endpoint.indexOf("$currentTimelineStage === 'working' && $stage === 'working'"));
  assert.ok(endpoint.indexOf("$currentTimelineStage === 'working' && $stage === 'working'") < endpoint.indexOf('UPDATE work_orders SET status_log=?'));
});

test('penolakan akses cabang heartbeat selalu melewati rollback transaksi', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const start = endpoint.indexOf("if ($action === 'timeline-stage')");
  const end = endpoint.indexOf('$normalizedServices =', start);
  const action = endpoint.slice(start, end);

  assert.doesNotMatch(action, /requireAccessibleBranch/);
  assert.match(endpoint, /class WorkOrderAccessDeniedException extends RuntimeException/);
  assert.match(action, /getAccessibleBranchIds\(\$pdo, \$actor\)/);
  assert.match(action, /throw new WorkOrderAccessDeniedException/);
  assert.match(action, /catch \(WorkOrderAccessDeniedException \$e\)/);
  const deniedCatch = action.slice(action.indexOf('catch (WorkOrderAccessDeniedException $e)'));
  assert.ok(deniedCatch.indexOf('$pdo->rollBack()') < deniedCatch.indexOf("respondError($e->getMessage(), 403)"));
});

test('penyelesaian WO memakai checklist operasional sebelum mutasi status', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');
  const endpoint = source('api/endpoints/work-orders.php');

  assert.match(page, /const completeSelectedWorkOrder =/);
  assert.match(page, /Layanan dan barang sudah final/);
  assert.match(page, /Pemeriksaan akhir sudah dilakukan/);
  assert.match(page, /Kendaraan siap diserahkan/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /void completeSelectedWorkOrder\(\)/);
  assert.match(endpoint, /WO tidak dapat diselesaikan\. Tambahkan minimal satu layanan dan pastikan total pekerjaan lebih dari Rp0/);
  assert.match(endpoint, /Teknisi utama wajib dipilih sebelum WO dikerjakan atau diselesaikan/);
});

test('Selesai mendapat toleransi faktur 15 menit lalu meningkat menjadi kritis setelah 30 menit', () => {
  const completed = workOrder({
    status: 'Selesai',
    statusLog: [
      { from: 'Proses', to: 'Selesai', at: '2026-09-02T14:00:00+08:00', byUserId: 'U-1', byUserName: 'Teknisi' },
    ],
  });

  assert.deepEqual(
    attention.buildWorkOrderAttentionItems([completed], [], '2026-09-02', new Date('2026-09-02T14:10:00+08:00')),
    [],
  );
  const warning = attention.buildWorkOrderAttentionItems([completed], [], '2026-09-02', new Date('2026-09-02T14:20:00+08:00'));
  assert.equal(warning[0].kind, 'invoice');
  assert.equal(warning[0].severity, 'warning');
  assert.equal(warning[0].elapsedMinutes, 20);
  const critical = attention.buildWorkOrderAttentionItems([completed], [], '2026-09-02', new Date('2026-09-02T14:35:00+08:00'));
  assert.equal(critical[0].severity, 'critical');
});

test('invoiceId membuktikan faktur ada walau detail faktur disembunyikan oleh izin', () => {
  const completed = workOrder({
    status: 'Selesai',
    invoiceId: 'INV-HIDDEN',
    statusLog: [{ from: 'Proses', to: 'Selesai', at: '2026-09-02T10:00:00+08:00' }],
  });

  const items = attention.buildWorkOrderAttentionItems(
    [completed],
    [],
    '2026-09-02',
    new Date('2026-09-02T11:00:00+08:00'),
  );

  assert.deepEqual(items, []);
});

test('Control Board mengunci WO yang invoiceId-nya ada walau detail faktur tersembunyi', () => {
  const hidden = timeline.timelineFinancialSummary({ total: 750_000, invoiceId: 'INV-HIDDEN' });
  const page = source('src/pages/WorkOrderTimeline.tsx');

  assert.equal(hidden.hasLinkedInvoice, true);
  assert.equal(hidden.detailsRestricted, true);
  assert.equal(hidden.isPaid, false);
  assert.match(page, /const selectedHasLinkedInvoice = Boolean\(selected\?\.invoiceId \|\| selectedInvoice\)/);
  assert.match(page, /financial\.detailsRestricted/);
  assert.match(page, /Sudah difakturkan · detail terbatas/);
  assert.match(page, /selectedStage === 'done' && !selectedHasLinkedInvoice/);
  assert.match(page, /selectedHasLinkedInvoice \|\| selected\.status === 'Closed'/);
});

test('batas SLA tepat pada menit 120, 240, 15, dan 30', () => {
  const workingAt = minutes => attention.buildWorkOrderAttentionItems(
    [workOrder()], [], '2026-09-02', new Date(`2026-09-02T${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+08:00`),
  );
  assert.equal(workingAt(119).length, 0);
  assert.equal(workingAt(120)[0].severity, 'warning');
  assert.equal(workingAt(239)[0].severity, 'warning');
  assert.equal(workingAt(240)[0].severity, 'critical');

  const completed = workOrder({ status: 'Selesai', statusLog: [{ from: 'Proses', to: 'Selesai', at: '2026-09-02T14:00:00+08:00' }] });
  const invoiceAt = minutes => attention.buildWorkOrderAttentionItems(
    [completed], [], '2026-09-02', new Date(`2026-09-02T14:${String(minutes).padStart(2, '0')}:00+08:00`),
  );
  assert.equal(invoiceAt(14).length, 0);
  assert.equal(invoiceAt(15)[0].severity, 'warning');
  assert.equal(invoiceAt(29)[0].severity, 'warning');
  assert.equal(invoiceAt(30)[0].severity, 'critical');
});

test('AppContext juga menolak heartbeat kosong sebelum API atau demo mutation', () => {
  const context = source('src/context/AppContext.tsx');
  const start = context.indexOf('const changeWorkOrderTimelineStage');
  const end = context.indexOf('const continueWorkOrder', start);
  const action = context.slice(start, end);
  assert.match(action, /currentTimelineStage === 'working' && stage === 'working' && trimmedNote === ''/);
  assert.match(action, /Catatan progress wajib diisi/);
  assert.ok(action.indexOf("currentTimelineStage === 'working' && stage === 'working'") < action.indexOf('if (isDemoMode)'));
});

test('semua permukaan perhatian memakai clock satu menit yang sama', () => {
  const hook = source('src/hooks/useMinuteClock.ts');
  const list = source('src/pages/WorkOrders.tsx');
  const dashboard = source('src/pages/Dashboard.tsx');
  const mobile = source('src/components/MobileDashboard.tsx');

  assert.match(hook, /window\.setInterval/);
  assert.match(hook, /60_000/);
  assert.match(list, /const attentionNow = useMinuteClock\(\)/);
  assert.match(list, /todayDate,\s*attentionNow/);
  assert.match(dashboard, /const attentionNow = useMinuteClock\(\)/);
  assert.match(dashboard, /visibleWOs, visibleInvoices, todayKey, attentionNow/);
  assert.match(dashboard, /attentionNow=\{attentionNow\}/);
  assert.match(mobile, /attentionNow:Date/);
  assert.match(mobile, /notificationWorkOrders,data\.invoices,today,attentionNow/);
});

test('Control Board menampilkan satu ringkasan penutupan dari aturan exception bersama', () => {
  const page = source('src/pages/WorkOrderTimeline.tsx');

  assert.match(page, /buildWorkOrderAttentionItems/);
  assert.match(page, /countWorkOrderAttentionByKind/);
  assert.match(page, /const operationalAttentionItems = useMemo/);
  assert.match(page, /const attentionByWorkOrder = useMemo/);
  assert.match(page, /data\.invoices,\s*localDateKey\(clock\),\s*clock/);
  assert.match(page, /Penutupan Operasional/);
  assert.match(page, /Register Mengambang/);
  assert.match(page, /Dikerjakan Terlambat/);
  assert.match(page, /Belum Difakturkan/);
  assert.match(page, /Belum Lunas/);
  assert.match(page, /item\.severity === 'critical'/);
  assert.match(page, /navigate\('\/workorders\?attention=1'\)/);
});
