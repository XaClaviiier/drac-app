import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const transformed = transformSync(source('src/lib/workOrderAttention.ts'), { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const attention = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);

async function loadTypeScriptModule(path) {
  const file = new URL(path, root);
  assert.ok(existsSync(file), `${path} harus tersedia`);
  const compiled = transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' }).code;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

function workOrder(overrides = {}) {
  return {
    id: 'WO-EST-1', woNumber: 'WO-EST-1', date: '2026-09-03', transactionTime: '08:00',
    status: 'Proses', services: [], total: 100_000, notes: '', branchId: 'B-1',
    statusLog: [{ from: 'Register', to: 'Proses', at: '2026-09-03T08:00:00+08:00' }],
    estimatedDurationMinutes: 120,
    workStartedAt: '2026-09-03T08:00:00+08:00',
    estimatedCompletionAt: '2026-09-03T10:00:00+08:00',
    ...overrides,
  };
}

test('deadline estimasi mengalahkan SLA heartbeat dan terlambat tepat saat target terlewati', () => {
  const heartbeat = workOrder({
    statusLog: [
      { from: 'Register', to: 'Proses', at: '2026-09-03T08:00:00+08:00' },
      { from: 'Proses', to: 'Proses', at: '2026-09-03T09:59:00+08:00', reason: '[WO_TIMELINE_STAGE:working] Masih dikerjakan' },
    ],
  });
  assert.equal(attention.buildWorkOrderAttentionItems([heartbeat], [], '2026-09-03', new Date('2026-09-03T09:59:00+08:00')).length, 0);
  const warning = attention.buildWorkOrderAttentionItems([heartbeat], [], '2026-09-03', new Date('2026-09-03T10:00:00+08:00'));
  assert.equal(warning[0].kind, 'process');
  assert.equal(warning[0].severity, 'warning');
  assert.equal(warning[0].elapsedMinutes, 0);
  assert.match(warning[0].description, /melewati target selesai/);
  const critical = attention.buildWorkOrderAttentionItems([heartbeat], [], '2026-09-03', new Date('2026-09-03T12:00:00+08:00'));
  assert.equal(critical[0].severity, 'critical');
  assert.equal(critical[0].elapsedMinutes, 120);
});

test('estimasi menginap tidak menjadi kritis hanya karena tanggal transaksi kemarin', () => {
  const wo = workOrder({
    date: '2026-09-02',
    estimatedCompletionAt: '2026-09-03T10:00:00+08:00',
  });

  const beforeDeadline = attention.buildWorkOrderAttentionItems([wo], [], '2026-09-03', new Date('2026-09-03T09:59:00+08:00'));
  assert.equal(beforeDeadline.length, 0);

  const atDeadline = attention.buildWorkOrderAttentionItems([wo], [], '2026-09-03', new Date('2026-09-03T10:00:00+08:00'));
  assert.equal(atDeadline[0].severity, 'warning');

  const afterGrace = attention.buildWorkOrderAttentionItems([wo], [], '2026-09-03', new Date('2026-09-03T12:00:00+08:00'));
  assert.equal(afterGrace[0].severity, 'critical');
});

test('WO lama tanpa estimasi tetap memakai fallback aktivitas 2 jam dan 4 jam', () => {
  const legacy = workOrder({ estimatedDurationMinutes: undefined, workStartedAt: undefined, estimatedCompletionAt: undefined });
  assert.equal(attention.buildWorkOrderAttentionItems([legacy], [], '2026-09-03', new Date('2026-09-03T09:59:00+08:00')).length, 0);
  assert.equal(attention.buildWorkOrderAttentionItems([legacy], [], '2026-09-03', new Date('2026-09-03T10:00:00+08:00'))[0].severity, 'warning');
});

test('deadline parsial atau tidak konsisten tidak mematikan fallback SLA lama', () => {
  const now = new Date('2026-09-03T10:00:00+08:00');
  const partial = workOrder({
    estimatedDurationMinutes: undefined,
    workStartedAt: undefined,
    estimatedCompletionAt: '2026-09-03T12:00:00+08:00',
  });
  const inconsistent = workOrder({
    estimatedDurationMinutes: 60,
    workStartedAt: '2026-09-03T08:00:00+08:00',
    estimatedCompletionAt: '2026-09-03T12:00:00+08:00',
  });
  const partialAttention = attention.buildWorkOrderAttentionItems([partial], [], '2026-09-03', now);
  const inconsistentAttention = attention.buildWorkOrderAttentionItems([inconsistent], [], '2026-09-03', now);
  assert.equal(partialAttention.length, 1);
  assert.equal(partialAttention[0].severity, 'warning');
  assert.equal(inconsistentAttention.length, 1);
  assert.equal(inconsistentAttention[0].severity, 'warning');
});

test('schema, serializer, API, dan tipe menyimpan durasi serta deadline server', () => {
  const helpers = source('api/helpers.php');
  const endpoint = source('api/endpoints/work-orders.php');
  const allData = source('api/endpoints/all-data.php');
  const types = source('src/types/index.ts');
  assert.match(helpers, /estimated_duration_minutes/);
  assert.match(helpers, /work_started_at/);
  assert.match(helpers, /estimated_completion_at/);
  assert.match(endpoint, /Estimasi lama pekerjaan wajib diisi/);
  assert.match(endpoint, /estimated_duration_minutes/);
  assert.match(endpoint, /estimated_completion_at/);
  assert.match(allData, /estimatedDurationMinutes/);
  assert.match(allData, /estimatedCompletionAt/);
  assert.match(types, /estimatedDurationMinutes\?: number/);
  assert.match(types, /estimatedCompletionAt\?: string/);
});

test('estimasi draft Register tersimpan tanpa memulai clock pekerjaan', () => {
  const backend = source('api/endpoints/work-orders.php');
  assert.match(backend, /\$normalizeEstimatedDuration/);
  assert.match(backend, /\$normalizeEstimatedDuration\(\$d\['estimatedDurationMinutes'\] \?\? null, \$isInitialWorking\)/);
  assert.match(backend, /\$normalizeEstimatedDuration\(\$d\['estimatedDurationMinutes'\] \?\? \$currentWorkOrder\['estimated_duration_minutes'\] \?\? null, true\)/);
  const draftBranch = backend.slice(
    backend.indexOf("elseif ($currentStatus === 'Register' && $nextStatus === 'Register')"),
    backend.indexOf("if ($nextStatus === 'Selesai')", backend.indexOf("elseif ($currentStatus === 'Register' && $nextStatus === 'Register')")),
  );
  assert.match(draftBranch, /\$normalizeEstimatedDuration\(/);
  assert.match(draftBranch, /false/);
  assert.match(backend, /\$workStartedTimestamp = time\(\)/);
  assert.match(backend, /\$workStartedAt = \$isInitialWorking \? date\('Y-m-d H:i:s', \$workStartedTimestamp\) : null/);
});

test('WO baru boleh langsung Dikerjakan hanya dengan estimasi tervalidasi dan audit server', () => {
  const backend = source('api/endpoints/work-orders.php');
  const postStart = backend.indexOf("case 'POST':");
  const putStart = backend.indexOf("case 'PUT':");
  const post = backend.slice(postStart, putStart);
  assert.ok(postStart >= 0 && putStart > postStart);
  assert.match(post, /\$requestedInitialStatus/);
  assert.match(post, /\['Register', 'Proses'\]/);
  assert.match(post, /requireUserPermission\(\$pdo, 'wo:edit'\)/);
  assert.match(post, /\$isInitialWorking/);
  assert.match(post, /\$approvedAt/);
  assert.match(post, /\$approvedServicesJson/);
  assert.match(post, /estimated_duration_minutes, work_started_at, estimated_completion_at/);
  assert.match(post, /Estimasi lama pekerjaan/);
  assert.match(post, /'status' => \$initialStatus/);
  assert.ok(post.indexOf('requireAccessibleBranch') < post.indexOf('$pdo->beginTransaction()'));
  assert.ok(post.indexOf("requireUserPermission($pdo, 'wo:edit')") < post.indexOf('$pdo->beginTransaction()'));
});

test('update deadline memeriksa cabang pada row terkunci lalu rollback dengan 403', () => {
  const backend = source('api/endpoints/work-orders.php');
  const context = source('src/context/AppContext.tsx');
  const updateStart = backend.indexOf('$currentStmt = $pdo->prepare', backend.indexOf("case 'PUT':"));
  const updateEnd = backend.indexOf("case 'DELETE':", updateStart);
  const update = backend.slice(updateStart, updateEnd);
  assert.match(update, /getAccessibleBranchIds\(\$pdo, \$actor\)/);
  assert.doesNotMatch(update.slice(0, update.indexOf('$stmt = $pdo->prepare')), /requireAccessibleBranch/);
  assert.match(update, /catch \(WorkOrderAccessDeniedException \$e\)[\s\S]*?rollBack\(\)[\s\S]*?respondError\(\$e->getMessage\(\), 403\)/);
  assert.match(update, /respondSuccess\(\[[\s\S]*?'estimatedCompletionAt' => formatWitaTimestamp\(\$estimatedCompletionAt\)/);
  assert.match(context, /estimatedCompletionAt: result\.data\?\.estimatedCompletionAt \?\? wo\.estimatedCompletionAt/);
});

test('semua pintu masuk Dikerjakan meminta estimasi dan tabel memakai kolom Perhatian', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  const timeline = source('src/pages/WorkOrderTimeline.tsx');
  const context = source('src/context/AppContext.tsx');
  assert.match(workOrders, /Estimasi Lama Pekerjaan/);
  assert.match(workOrders, /Estimasi lama pekerjaan wajib diisi/);
  assert.match(timeline, /Estimasi lama pekerjaan/);
  assert.match(context, /estimatedDurationMinutes/);
  assert.match(context, /Estimasi lama pekerjaan wajib diisi/);
  assert.match(workOrders, /key: 'attention', label: 'Perhatian'/);
  assert.match(workOrders, /Dikerjakan Terlambat/);
  assert.match(workOrders, /sameIssueEstimatedDuration/);
  assert.match(workOrders, /Pelanggan kembali dengan masalah yang sama[\s\S]*?Number\(sameIssueEstimatedDuration\)/);
  assert.match(workOrders, /data-wo-estimated-deadline/);
  assert.match(workOrders, /data-wo-attention-label/);
});

test('rollout schema memiliki bootstrap key, schema dasar, dan migration SQL mandiri', () => {
  const apiIndex = source('api/index.php');
  const schema = source('database/dokterac_schema.sql');
  const migrationUrl = new URL('database/migrate_work_order_estimated_duration.sql', root);
  assert.match(apiIndex, /api_support_20260903_work_order_estimated_duration_v1/);
  assert.match(schema, /estimated_duration_minutes/);
  assert.match(schema, /work_started_at/);
  assert.match(schema, /estimated_completion_at/);
  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, 'utf8');
  assert.match(migration, /ALTER TABLE `work_orders`/);
  assert.match(migration, /estimated_duration_minutes/);
  assert.match(migration, /estimated_completion_at/);
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.match(migration, /information_schema\.COLUMNS/);
  assert.match(migration, /PREPARE/);
});

test('CI PR menjalankan PHP lint dan migration estimasi dua kali pada MySQL 5.7', () => {
  const workflowUrl = new URL('.github/workflows/verify-work-order-estimate.yml', root);
  assert.equal(existsSync(workflowUrl), true);
  const workflow = readFileSync(workflowUrl, 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /image:\s*mysql:5\.7/);
  assert.match(workflow, /shivammathur\/setup-php@v2/);
  assert.match(workflow, /php -l api\/endpoints\/work-orders\.php/);
  const migrationRuns = workflow.match(/migrate_work_order_estimated_duration\.sql/g) || [];
  assert.ok(migrationRuns.length >= 2);
  assert.match(workflow, /estimated_duration_minutes[\s\S]*work_started_at[\s\S]*estimated_completion_at/);
});

test('artefak bundle generated dikecualikan dari pemeriksaan whitespace tanpa mengubah byte runtime', () => {
  const attributesUrl = new URL('.gitattributes', root);
  assert.equal(existsSync(attributesUrl), true);
  assert.match(readFileSync(attributesUrl, 'utf8'), /^dist\/index\.html -whitespace$/m);
});

test('server memakai satu timestamp atomik untuk waktu mulai dan deadline', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const occurrences = endpoint.match(/\$workStartedTimestamp = time\(\);[\s\S]{0,300}?date\('Y-m-d H:i:s', \$workStartedTimestamp\)[\s\S]{0,300}?\$workStartedTimestamp \+ \(\$estimatedDurationMinutes \* 60\)/g) || [];
  assert.equal(occurrences.length, 2);
});

test('semua izin di dalam transaksi melempar agar rollback dan 403 tetap terjamin', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  assert.match(endpoint, /\$assertUserPermission/);
  const post = endpoint.slice(endpoint.indexOf('$pdo->beginTransaction();', endpoint.indexOf("case 'POST':")), endpoint.indexOf("case 'PUT':"));
  const putStart = endpoint.indexOf('$pdo->beginTransaction();', endpoint.indexOf("case 'PUT':"));
  const put = endpoint.slice(putStart, endpoint.indexOf("case 'DELETE':"));
  assert.doesNotMatch(post, /requireUserPermission\(/);
  assert.doesNotMatch(put, /requireUserPermission\(/);
  assert.doesNotMatch(post, /requireAuthenticatedUser\(/);
  assert.doesNotMatch(put, /requireAuthenticatedUser\(/);
  assert.doesNotMatch(post, /assertActiveBranch\(/);
  assert.doesNotMatch(put, /assertActiveBranch\(/);
  assert.doesNotMatch(post, /requireAccessibleBranch\(/);
  assert.doesNotMatch(put, /requireAccessibleBranch\(/);
  assert.match(endpoint, /\$assertActiveBranchWithinTransaction[\s\S]*?throw new DomainException/);
  assert.match(post, /catch \(WorkOrderAccessDeniedException \$e\)[\s\S]*?rollBack\(\)[\s\S]*?403/);
  assert.match(put, /catch \(WorkOrderAccessDeniedException \$e\)[\s\S]*?rollBack\(\)[\s\S]*?403/);
});

test('PUT umum wajib wo:edit dan mengotorisasi cabang sebelum membaca status aktif', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const putCase = endpoint.slice(endpoint.indexOf("case 'PUT':"), endpoint.indexOf("case 'DELETE':"));
  const stageStart = putCase.indexOf('$stageStmt =');
  const stage = putCase.slice(stageStart, putCase.indexOf('$pdo->beginTransaction();', stageStart));
  const update = putCase.slice(putCase.lastIndexOf('$pdo->beginTransaction();'));
  assert.ok(stage.indexOf('getAccessibleBranchIds($pdo, $actor)') < stage.indexOf('$assertActiveBranchWithinTransaction'));
  assert.ok(update.indexOf('getAccessibleBranchIds($pdo, $actor)') < update.indexOf('$assertActiveBranchWithinTransaction'));
  const unconditionalEdit = update.indexOf("$assertUserPermission($pdo, $actor, 'wo:edit');");
  const identityChanged = update.indexOf('$identityChanged =');
  assert.ok(unconditionalEdit !== -1 && unconditionalEdit < identityChanged);
  assert.ok(update.indexOf('$currentStmt =') < update.indexOf('getAccessibleBranchIds($pdo, $actor)'));
  assert.ok(update.indexOf('getAccessibleBranchIds($pdo, $actor)') < update.indexOf('$normalizeWorkOrderServices('));
});

test('DELETE mengotorisasi cabang dengan exception setelah lock lalu rollback 403', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const deletion = endpoint.slice(endpoint.indexOf("case 'DELETE':"));
  assert.doesNotMatch(deletion, /requireAccessibleBranch\(/);
  assert.doesNotMatch(deletion, /assertActiveBranch\(/);
  assert.ok(deletion.indexOf('getAccessibleBranchIds($pdo, $deleteActor)') < deletion.indexOf('$assertActiveBranchWithinTransaction'));
  assert.match(deletion, /catch \(WorkOrderAccessDeniedException \$e\)[\s\S]*?rollBack\(\)[\s\S]*?403/);
});

test('referensi WO tidak tersedia dan tidak boleh diakses memakai denial 403 yang sama', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const resolver = endpoint.slice(endpoint.indexOf('$resolveWorkOrderContinuations'), endpoint.indexOf('$normalizeWorkOrderServices'));
  assert.match(resolver, /if \(!\$row\) throw new WorkOrderAccessDeniedException\('Referensi WO lanjutan tidak tersedia\.'/);
  assert.match(resolver, /if \(!isset\(\$accessibleBranches\[\$branchId\]\)\)[\s\S]*?WorkOrderAccessDeniedException\('Referensi WO lanjutan tidak tersedia\.'/);
});

test('jalur WO lanjutan hanya langsung Dikerjakan bila membawa estimasi valid', () => {
  const context = source('src/context/AppContext.tsx');
  const page = source('src/pages/WorkOrders.tsx');
  const continuation = context.slice(context.indexOf('const continueWorkOrder ='), context.indexOf('const createInvoiceFromWO'));
  assert.match(continuation, /estimatedDurationMinutes\?: number/);
  assert.match(continuation, /canStartImmediately/);
  assert.match(continuation, /Boolean\(src\.technicianId\)/);
  assert.match(continuation, /estimatedDurationMinutes: canStartImmediately/);
  assert.match(continuation, /workStartedAt: canStartImmediately/);
  assert.match(continuation, /estimatedCompletionAt: canStartImmediately/);
  assert.match(continuation, /technicianId: canStartImmediately/);
  assert.match(page, /Pelanggan kembali dengan masalah yang sama[\s\S]*?Number\(sameIssueEstimatedDuration\)/);
  assert.match(page, /shouldProcessNew \|\| shouldProcessEditing \|\| resumeLostSalesAfterEstimate \|\| shouldCreateInvoice/);
  assert.match(page, /continueWorkOrder\(continueWO\.id, activeBranchId\)/);
});

test('deadline API diserialisasi sebagai timestamp ISO WITA kanonik', () => {
  const helpers = source('api/helpers.php');
  const allData = source('api/endpoints/all-data.php');
  const endpoint = source('api/endpoints/work-orders.php');
  assert.match(helpers, /function formatWitaTimestamp/);
  assert.match(allData, /formatWitaTimestamp\(\$r\['work_started_at'\]/);
  assert.match(allData, /formatWitaTimestamp\(\$r\['estimated_completion_at'\]/);
  assert.match(endpoint, /'workStartedAt'\s*=>\s*formatWitaTimestamp\(/);
  assert.match(endpoint, /'estimatedCompletionAt'\s*=>\s*formatWitaTimestamp\(/);
});

test('mode demo membentuk clock estimasi untuk semua transisi masuk Dikerjakan tanpa mereset pekerjaan aktif', async () => {
  const { applyDemoWorkOrderEstimateClock } = await loadTypeScriptModule('src/lib/workOrderEstimate.ts');
  const now = new Date('2026-09-03T04:00:00.000Z');
  const base = workOrder({
    status: 'Proses',
    estimatedDurationMinutes: 90,
    workStartedAt: undefined,
    estimatedCompletionAt: undefined,
  });

  for (const previousStatus of [undefined, 'Register', 'Closed']) {
    const started = applyDemoWorkOrderEstimateClock(base, previousStatus, now);
    assert.equal(started.workStartedAt, '2026-09-03T04:00:00.000Z');
    assert.equal(started.estimatedCompletionAt, '2026-09-03T05:30:00.000Z');
  }

  const active = {
    ...base,
    workStartedAt: '2026-09-03T03:00:00.000Z',
    estimatedCompletionAt: '2026-09-03T04:30:00.000Z',
  };
  assert.deepEqual(applyDemoWorkOrderEstimateClock(active, 'Proses', now), active);
  assert.deepEqual(applyDemoWorkOrderEstimateClock(active, 'Register', now), active);
  assert.throws(
    () => applyDemoWorkOrderEstimateClock({ ...base, estimatedDurationMinutes: undefined }, 'Register', now),
    /Estimasi lama pekerjaan/,
  );

  const context = source('src/context/AppContext.tsx');
  assert.match(context, /const nowDate = new Date\(\)/);
  assert.match(context, /new Date\(nowDate\.getTime\(\) \+ Number\(estimatedDurationMinutes\) \* 60_000\)/);
  assert.doesNotMatch(context, /new Date\(Date\.now\(\) \+ Number\(estimatedDurationMinutes\)/);
  assert.match(context, /applyDemoWorkOrderEstimateClock\(createdWorkOrder, undefined\)/);
  assert.match(context, /applyDemoWorkOrderEstimateClock\(wo, previousWorkOrder\?\.status\)/);
});
