import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const requireInOrder = (text, markers, message) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = text.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${message}: tidak menemukan ${JSON.stringify(marker)}`);
    assert.ok(next > cursor, `${message}: urutan ${JSON.stringify(marker)} tidak benar`);
    cursor = next;
  }
};

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `Tidak menemukan awal kontrak ${JSON.stringify(startMarker)}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Tidak menemukan akhir kontrak ${JSON.stringify(endMarker)}`);
  return text.slice(start, end);
};

test('deployment memblokir upload bila PHP, typecheck, atau regression test gagal', () => {
  const workflow = source('.github/workflows/deploy.yml');

  assert.match(workflow, /concurrency:\s*[\s\S]*?group:\s*deploy-production[\s\S]*?cancel-in-progress:\s*false/);
  requireInOrder(workflow, [
    'shivammathur/setup-php@v2',
    "find api -type f -name '*.php' -print0 | xargs -0 -n1 php -l",
    'npm run check',
    'npm run build',
    'SamKirkland/FTP-Deploy-Action@v4.3.5',
  ], 'gerbang kualitas harus selesai sebelum upload FTP pertama');
});

test('kegagalan bootstrap API tetap mengembalikan JSON dengan nomor referensi', () => {
  const router = source('api/index.php');
  const bootstrap = sectionBetween(router, '// Seluruh audit operasional memakai WITA.', '$route =');

  assert.match(bootstrap, /try\s*\{/);
  assert.match(bootstrap, /ensureApiSupportTablesVersioned/);
  assert.match(bootstrap, /catch\s*\(Throwable \$e\)/);
  assert.match(bootstrap, /error_log\s*\(/);
  assert.match(bootstrap, /respondError\('Server belum siap\. Referensi: '\s*\.\s*\$errorReference,\s*500\)/);
  assert.match(router, /try\s*\{\s*\$requestUser = null;[\s\S]*?switch \(\$resource\)[\s\S]*?catch \(Throwable \$e\)/);
});

test('identitas teknisi memakai kode role TKN dan fallback nama role lama', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const context = source('src/context/AppContext.tsx');

  const pageIdentity = sectionBetween(page, 'const isTechnicianIdentity =', 'const [showComplaintEditor');
  assert.match(pageIdentity, /role\?\.code\?\.trim\(\)\.toUpperCase\(\)\s*===\s*'TKN'/);
  assert.match(pageIdentity, /teknisi\|technician/i);
  assert.match(pageIdentity, /currentUserIsTechnician\s*=\s*isTechnicianIdentity\(currentUser\?\.roleId,\s*currentUser\?\.roleName\)/);

  const permissionIdentity = sectionBetween(context, 'const hasPermission =', '// Pulihkan pilihan cabang');
  assert.match(permissionIdentity, /role\?\.code\?\.toUpperCase\(\)\s*===\s*'TKN'/);
  assert.match(permissionIdentity, /includes\('teknisi'\)/);
  assert.match(permissionIdentity, /includes\('technician'\)/);
  assert.match(permissionIdentity, /isTechnicianRole\s*&&\s*technicianBaseline\.includes\(perm\)/);

  const statusIdentity = sectionBetween(context, 'const currentRole =', 'const log =');
  assert.match(statusIdentity, /currentRole\?\.code\?\.(?:trim\(\)\.)?toUpperCase\(\)\s*===\s*'TKN'/);
});

test('Register ke Dikerjakan melewati satu pintu dengan prasyarat operasional', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const endpoint = source('api/endpoints/work-orders.php');

  const requestStart = sectionBetween(page, 'const requestStartProcessing =', 'const canShowProcessMenu =');
  assert.match(requestStart, /requireEditableWorkOrder\(wo\)/);
  assert.match(requestStart, /const services\s*=\s*useEditorDraft\s*\?\s*formData\.services\s*:\s*wo\.services/);
  assert.match(requestStart, /const total\s*=\s*useEditorDraft\s*\?\s*totalServices\s*:\s*wo\.total/);
  assert.match(requestStart, /if \(!services\.length \|\| total <= 0\)/);
  assert.match(requestStart, /const technicianId\s*=\s*useEditorDraft\s*\?\s*formData\.technicianId\s*:\s*wo\.technicianId/);
  assert.match(requestStart, /if \(!technicianId\)/);
  assert.match(requestStart, /setDocumentTab\('info'\)/);
  assert.match(requestStart, /diagnosisSubmitAction\.current\s*=\s*'process'[\s\S]*?handleSubmit\(\)/);
  assert.match(requestStart, /requestStatusChange\(wo,\s*'Proses'\)/);

  // Aksi dari rincian maupun editor harus melewati helper di atas. Syarat
  // layanan dan nilai positif juga ditentukan dari data, bukan hanya label UI.
  assert.match(page, /detailWO\.services\.length\s*>\s*0\s*&&\s*detailWO\.total\s*>\s*0[\s\S]*?requestStartProcessing\(detailWO\)/);
  assert.match(page, /formData\.services\.length\s*>\s*0\s*&&\s*totalServices\s*>\s*0[\s\S]*?requestStartProcessing\(editingWO,\s*true\)/);

  const updateContract = sectionBetween(endpoint, "case 'PUT':", "case 'DELETE':");
  assert.match(updateContract, /'Register'\s*=>\s*\[[^\]]*'Proses'/);
  requireInOrder(updateContract, [
    "$complaint = trim((string)($d['description'] ?? $currentWorkOrder['description'] ?? ''))",
    "if ($complaint === '') throw new InvalidArgumentException('Keluhan pelanggan wajib diisi.')",
    "$hasPositiveEstimate = !empty($normalizedServices['services']) && $normalizedServices['total'] > 0",
    "if (in_array($nextStatus, ['Proses', 'Selesai'], true) && !$hasPositiveEstimate)",
    "if (in_array($nextStatus, ['Proses', 'Selesai'], true) && $technicianId === '')",
  ], 'backend harus memvalidasi keluhan, layanan bernilai positif, lalu teknisi');

  const technicianContract = sectionBetween(endpoint, '$syncWorkOrderTechnicians =', '$formatAuditTimestamp =');
  assert.match(technicianContract, /\$assertActiveBranchWithinTransaction\(\$pdo, \$branchId\)/);
  assert.match(technicianContract, /user_branch_access[\s\S]*?uba\.branch_id=\?/);
  assert.match(technicianContract, /\$roleCode !== 'TKN'[\s\S]*?str_contains\(\$roleName, 'teknisi'\)[\s\S]*?str_contains\(\$roleName, 'technician'\)/);
});

test('perubahan status WO yang sama bersifat idempoten tanpa PUT atau log duplikat', () => {
  const context = source('src/context/AppContext.tsx');
  const page = source('src/pages/WorkOrders.tsx');
  const statusChange = sectionBetween(context, 'const changeWorkOrderStatus =', 'const changeWorkOrderTimelineStage =');
  const statusRequest = sectionBetween(page, 'const requestStatusChange =', 'const requestStartProcessing =');
  const statusConfirm = sectionBetween(page, 'const confirmStatusChange =', 'const handleReopenCompletedWorkOrder =');

  requireInOrder(statusChange, [
    'const wo = data.workOrders.find',
    'if (wo.status === nextStatus)',
    'return { ok: true, workOrder: wo, changed: false }',
    'if (!isStatusTransitionAllowed(wo.status, nextStatus))',
    'const savedWorkOrder = await updateWorkOrder(woId, patch)',
    'return { ok: true, workOrder: savedWorkOrder, changed: true }',
  ], 'status yang sudah aktif harus selesai sebelum validasi transisi dan penyimpanan');
  assert.match(statusRequest, /data\.workOrders\.find\(item\s*=>\s*item\.id\s*===\s*wo\.id\)/);
  assert.match(statusRequest, /canonicalWorkOrder\.status\s*===\s*next/);
  assert.match(statusRequest, /canonicalWorkOrder\.status\s*!==\s*wo\.status/);
  assert.match(statusRequest, /status:\s*canonicalWorkOrder\.status/);
  assert.match(statusConfirm, /isChangingStatus/);
  assert.match(statusConfirm, /data\.workOrders\.find\(item\s*=>\s*item\.id\s*===\s*dialogWorkOrder\.id\)/);
  assert.match(statusConfirm, /wo\.status\s*!==\s*dialogWorkOrder\.status/);
  assert.match(statusConfirm, /result\.changed\s*===\s*false/);
  const continueLostSales = sectionBetween(page, 'const continueLostSalesSameIssue =', 'const continueLostSalesDifferentIssue =');
  assert.match(continueLostSales, /data\.workOrders\.find\(item\s*=>\s*item\.id\s*===\s*lostSalesFollowUp\.id\)/);
  assert.match(continueLostSales, /sourceWO\.status\s*!==\s*'Closed'\s*&&\s*sourceWO\.status\s*!==\s*'Proses'/);
  assert.match(continueLostSales, /result\.changed\s*===\s*false/);
});

test('menu proses hanya tersedia dengan izin edit dan aksi yang relevan', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const processVisibility = sectionBetween(page, 'const canShowProcessMenu =', 'const openCompletionModal =');

  assert.match(processVisibility, /canEditWorkOrderInActiveBranch\(wo\)/);
  assert.match(processVisibility, /wo\.status\s*===\s*'Register'/);
  assert.match(processVisibility, /wo\.status\s*===\s*'Proses'/);
  assert.match(processVisibility, /wo\.status\s*===\s*'Selesai'/);
  assert.match(processVisibility, /wo\.status\s*===\s*'Closed'/);
  assert.match(page, /editingWO\s*&&\s*!workOrderViewOnly\s*&&\s*canEditWorkOrderInActiveBranch\(editingWO\)\s*&&\s*\(editingWO\.status\s*===\s*'Register'/);
});

test('simpan editor mempertahankan versi final dan Lost Sales hanya satu kali PUT', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const handleSubmit = sectionBetween(page, 'const handleSubmit =', 'const handleDelete =');

  requireInOrder(handleSubmit, [
    "status: 'Closed'",
    'const persistedWorkOrder = await updateWorkOrder(editingWO.id, finalWorkOrder)',
    'setEditingWO(persistedWorkOrder)',
  ], 'Lost Sales harus dibangun lalu disimpan sebagai satu versi final');
  assert.doesNotMatch(handleSubmit, /changeWorkOrderStatus\s*\(/);
});

test('update WO membawa version token dan server menolak overwrite data usang dengan 409', () => {
  const types = source('src/types/index.ts');
  const context = source('src/context/AppContext.tsx');
  const endpoint = source('api/endpoints/work-orders.php');

  const workOrderType = sectionBetween(types, 'export interface WorkOrder {', 'export interface WorkOrderService');
  assert.match(workOrderType, /updatedAt\?:\s*string/);

  const updateClient = sectionBetween(context, 'const updateWorkOrder =', 'const deleteWorkOrder =');
  assert.match(updateClient, /api\.update\('work-orders', id, wo\)/);
  assert.match(updateClient, /updatedAt:\s*result\.data\?\.updatedAt \|\| wo\.updatedAt/);
  assert.match(updateClient, /return savedWorkOrder/);

  const updateContract = sectionBetween(endpoint, "case 'PUT':", "case 'DELETE':");
  assert.match(updateContract, /\$d\['updatedAt'\]/);
  assert.match(updateContract, /updated_at/);
  assert.match(updateContract, /WorkOrderVersionConflictException/);
  assert.match(updateContract, /respondError\([^;]*409/s);
  // Field opsional menjaga kompatibilitas client lama, tetapi bila dikirim wajib dibandingkan.
  assert.match(updateContract, /array_key_exists\('updatedAt',\s*\$d\)|isset\(\$d\['updatedAt'\]\)/);
  assert.match(updateContract, /normalizeWorkOrderVersion|\$normalizeWorkOrderVersion/);
  assert.match(updateContract, /respondSuccess\(\[[\s\S]*?'updatedAt'\s*=>\s*\$updatedVersion[\s\S]*?\],\s*'WO diupdate'\)/);
});

test('editor memakai version token server untuk catatan dan penyelesaian WO', () => {
  const page = source('src/pages/WorkOrders.tsx');

  const workResult = sectionBetween(page, 'const saveWorkResult =', 'const confirmStatusChange =');
  assert.doesNotMatch(workResult, /updatedAt:\s*(?:now|new Date)/);
  assert.match(workResult, /const savedWorkOrder = await updateWorkOrder\(workResultEditor\.id, nextWorkOrder\)/);
  assert.match(workResult, /setDetailWO\([^;]*savedWorkOrder/s);

  const completionOpen = sectionBetween(page, 'const openCompletionModal =', 'const completeWorkOrder =');
  assert.match(completionOpen, /\{\s*\.\.\.wo,\s*\.\.\.formData,\s*total:\s*totalServices\s*\}/);
  const completionSave = sectionBetween(page, 'const completeWorkOrder =', 'const closeWorkResultEditor =');
  assert.match(completionSave, /const savedWorkOrder = await updateWorkOrder\(completionWO\.id, completed\)/);
  assert.match(completionSave, /setEditingWO\([^;]*savedWorkOrder/s);
  assert.match(completionSave, /editorBaselineFingerprint\.current\s*=\s*workOrderEditorFingerprint\(savedWorkOrder\)/);
  assert.match(completionSave, /setDetailWO\([^;]*savedWorkOrder/s);
  assert.match(page, /editingWO\.status\s*===\s*'Proses'[\s\S]*?openCompletionModal\(editingWO\)[\s\S]*?Tandai Selesai/);
});

test('aksi edit WO dibatasi izin dan cabang aktif yang dapat diakses', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const editGuard = sectionBetween(page, 'const canEditWorkOrderInActiveBranch =', 'const requireEditableWorkOrder =');

  assert.match(editGuard, /hasPermission\('wo:edit'\)/);
  assert.match(editGuard, /branch\.id === currentBranchId && branch\.isActive/);
  assert.match(editGuard, /currentBranchId !== 'ALL'/);
  assert.match(editGuard, /wo\.branchId === currentBranchId/);
  assert.match(editGuard, /assignedBranchIds\.has\(wo\.branchId\)/);
  assert.doesNotMatch(page, /const takeServicesFromPreviousWO =/);
  assert.doesNotMatch(page, /const openFavoriteServicesForWO =/);
  assert.match(page, /const persistServicesAfterAdd =[\s\S]*?requireEditableWorkOrder\(editingWO\)/);

  const handleSubmit = sectionBetween(page, 'const handleSubmit =', 'const handleDelete =');
  const statusRequest = sectionBetween(page, 'const requestStatusChange =', 'const requestStartProcessing =');
  const statusConfirm = sectionBetween(page, 'const confirmStatusChange =', 'const handleReopenCompletedWorkOrder =');
  const completionSave = sectionBetween(page, 'const completeWorkOrder =', 'const closeWorkResultEditor =');
  const workResultSave = sectionBetween(page, 'const saveWorkResult =', 'const confirmStatusChange =');
  const reopen = sectionBetween(page, 'const handleReopenCompletedWorkOrder =', 'const handleOpenInvoiceModal =');
  const continueLostSales = sectionBetween(page, 'const continueLostSalesSameIssue =', 'const continueLostSalesDifferentIssue =');

  assert.match(handleSubmit, /editingWO\s*&&\s*!requireEditableWorkOrder\(editingWO\)/);
  assert.match(statusRequest, /requireEditableWorkOrder\(canonicalWorkOrder\)/);
  assert.match(statusConfirm, /requireEditableWorkOrder\(wo\)/);
  assert.match(completionSave, /requireEditableWorkOrder\(completionWO\)/);
  assert.match(workResultSave, /requireEditableWorkOrder\(workResultEditor\)/);
  assert.match(reopen, /data\.workOrders\.find\(item\s*=>\s*item\.id\s*===\s*wo\.id\)/);
  assert.match(reopen, /requireEditableWorkOrder\(canonicalWorkOrder\)/);
  assert.match(reopen, /canonicalWorkOrder\.status\s*===\s*'Proses'/);
  assert.match(reopen, /canonicalWorkOrder\.status\s*!==\s*wo\.status\s*\|\|\s*canonicalWorkOrder\.status\s*!==\s*'Selesai'/);
  assert.match(reopen, /result\.changed\s*===\s*false/);
  assert.match(reopen, /setIsChangingStatus\(true\)[\s\S]*?finally[\s\S]*?setIsChangingStatus\(false\)/);
  assert.match(continueLostSales, /requireEditableWorkOrder\(sourceWO\)/);
  assert.match(continueLostSales, /setResumeLostSalesAfterEstimate\(true\)/);
  assert.match(continueLostSales, /handleOpenModal\(sourceWO, true\)/);
  assert.doesNotMatch(continueLostSales, /handleOpenDiagnosis\(sourceWO\)/);
});

test('editor melindungi draft dan memakai versi WO terbaru sebelum membuka faktur', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const invoiceFromEditor = sectionBetween(page, 'const handleOpenInvoiceFromEditor =', 'const openActiveWorkOrder =');

  assert.match(invoiceFromEditor, /hasPermission\('invoice:create'\)/);
  assert.match(invoiceFromEditor, /hasUnsavedEditorChanges\(\)/);
  assert.match(invoiceFromEditor, /Simpan perubahan WO terlebih dahulu sebelum membuat faktur/);
  assert.match(invoiceFromEditor, /data\.workOrders\.find\(item => item\.id === wo\.id\) \|\| wo/);
  assert.match(invoiceFromEditor, /handleOpenInvoiceModal\(latestWorkOrder\)/);
  assert.match(page, /hasPermission\('invoice:create'\)\s*&&\s*<button[^>]*onClick=\{\(\) => handleOpenInvoiceFromEditor\(editingWO\)\}[^>]*>Buat Faktur<\/button>/);
});

test('browser memperingatkan saat editor WO memiliki perubahan belum disimpan', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const layout = source('src/components/Layout.tsx');
  const closeRequest = sectionBetween(page, 'const requestCloseEditor =', 'const editorHasUnsavedChanges =');
  const closeGuard = sectionBetween(page, 'const editorHasUnsavedChanges =', 'const handleRemoveService =');

  assert.match(closeRequest, /hasUnsavedEditorChanges\(\)/);
  assert.match(closeRequest, /Perubahan yang belum disimpan akan hilang/);
  assert.match(closeRequest, /__dracRequestCloseWorkOrderEditor = requestCloseEditor/);
  assert.match(layout, /const navigateWithEditorGuard = async/);
  assert.match(layout, /if \(guard && !await guard\(\)\) return/);
  assert.match(closeGuard, /showModal\s*&&\s*hasUnsavedEditorChanges\(\)/);
  assert.match(closeGuard, /window\.addEventListener\('beforeunload',\s*handleBeforeUnload\)/);
  assert.match(closeGuard, /event\.returnValue\s*=\s*''/);
  assert.match(closeGuard, /window\.removeEventListener\('beforeunload',\s*handleBeforeUnload\)/);
});

test('aksi status mempertahankan editor sedangkan Simpan dan Tutup menutup WO', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const submit = sectionBetween(page, 'const handleSubmit =', 'const handleDelete =');

  assert.match(submit, /const keepEditorOpenAfterStatusChange = Boolean\(/);
  assert.match(submit, /shouldProcessEditing \|\| shouldMarkLostSales \|\| resumeLostSalesAfterEstimate/);
  assert.match(submit, /if \(!keepEditorOpenAfterStatusChange\) handleCloseModal\(\)/);
  assert.match(page, /'Simpan & Tutup Work Order'/);
  assert.match(page, /'Simpan & Tutup'/);
});

test('editor layanan WO seragam dan tombol sampah kanan hanya menghapus WO untuk Admin atau Owner', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const rail = source('src/components/AccurateFormActionRail.tsx');
  const endpoint = source('api/endpoints/work-orders.php');
  const editor = sectionBetween(page, '{/* Editor rincian layanan:', '{/* Rincian barang/jasa dari baris WO */}');

  assert.match(page, /data-wo-service-editor/);
  assert.match(page, /const \[serviceEditorTab, setServiceEditorTab\] = useState<'details' \| 'info'>\('details'\)/);
  assert.match(editor, /data-wo-service-editor-tab="details"/);
  assert.match(editor, /data-wo-service-editor-tab="info"/);
  assert.match(editor, /aria-selected=\{serviceEditorTab === 'details'\}/);
  assert.match(editor, /onClick=\{\(\) => setServiceEditorTab\('info'\)\}/);
  assert.match(editor, /serviceEditorTab === 'details' \?/);
  assert.match(editor, /data-wo-service-editor-info/);
  assert.match(editor, /data-wo-service-editor-summary/);
  assert.match(editor, /sm:grid-cols-\[168px_minmax\(0,1fr\)\]/);
  assert.match(page, /formatVehicleCompatibility/);
  assert.match(page, />Kode #<\/span>/);
  assert.match(page, />Barcode<\/span>/);
  assert.match(editor, />Nama Barang \/ Jasa<\/span>/);
  assert.match(editor, />Keterangan baris<\/label>/);
  assert.match(editor, /step="1"/);
  assert.match(page, /activeServiceEditorUnit/);
  assert.match(page, />Kecocokan Kendaraan<\/span>/);
  assert.match(page, /Belum ditentukan di Master Barang & Jasa/);
  assert.match(page, /Dipilih saat membuat faktur/);
  assert.match(editor, /activeServiceEditorWarehouseLabel/);
  assert.match(editor, />Penjual \/ Teknisi<\/span>/);
  assert.match(editor, /Informasi barang berasal dari Master Barang & Jasa saat ini/);
  assert.match(page, /onClick=\{\(\) => openServiceEditor\(service\)\}/);
  assert.match(page, /onClick=\{removeServiceFromEditor\}/);
  assert.doesNotMatch(page, /onClick=\{\(\) => handleRemoveService\(service\.id\)\}/);
  assert.match(page, /remove=\{canShowAdminRowActions \? \{/);
  assert.match(page, /handleDelete\(editingWO\)/);
  assert.match(page, /currentRole\?\.code\?\.trim\(\)\.toUpperCase\(\) === 'ADM'/);
  assert.match(rail, /\{remove && \(/);
  assert.match(endpoint, /authenticatedUserIsOwnerOrAdministrator\(\$pdo, \$deleteActor\)/);
  assert.match(endpoint, /Hanya Admin atau Owner yang dapat menghapus WO/);
});

test('editor rincian layanan WO terkunci dan wajib dikonfirmasi sebelum berubah', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const lock = source('docs/standards/WORK_ORDER_UI_LOCK.md');
  const editor = sectionBetween(page, '{/* Editor rincian layanan:', '{/* Rincian barang/jasa dari baris WO */}');

  assert.match(lock, /Versi editor rincian: `wo-item-editor-accurate-2026-08-29`/);
  assert.match(lock, /wajib meminta dan memperoleh konfirmasi eksplisit dari Owner\/pemilik aplikasi/);
  assert.match(lock, /Tes pengunci editor rincian tidak boleh dihapus, dilonggarkan, atau diperbarui hanya untuk melewati kegagalan/);
  assert.match(editor, /max-w-xl/);
  assert.match(editor, /grid-cols-\[112px_minmax\(0,1fr\)\]/);
  assert.match(editor, /sm:grid-cols-\[168px_minmax\(0,1fr\)\]/);
  assert.match(editor, /grid-cols-\[minmax\(0,1fr\)_96px\]/);
  assert.match(editor, /className="h-9/);
  requireInOrder(editor, [
    'data-wo-service-editor-tab="details"',
    'data-wo-service-editor-tab="info"',
    'data-wo-service-editor-summary',
    '>Kode #</span>',
    '>Nama Barang / Jasa</span>',
    '>Keterangan baris</label>',
    '>Kuantitas</label>',
    '>@Harga</label>',
    '>Total Harga</span>',
    'data-wo-service-editor-info',
    '>Barcode</span>',
    '>Jenis / Kategori</span>',
    '>Gudang / Stok</span>',
    '>Penjual / Teknisi</span>',
    '>Kecocokan Kendaraan</span>',
    '>Isi Paket</p>',
  ], 'struktur editor rincian WO terkunci');
});

test('WO lanjutan dari Semua Cabang wajib memilih cabang eksplisit', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const context = source('src/context/AppContext.tsx');
  const continuationUi = sectionBetween(page, '// Cabang aktif user saat ini', 'const handleCreateInvoice =');
  const continuationContext = sectionBetween(context, 'const continueWorkOrder =', 'const createInvoiceFromWO =');

  assert.match(continuationUi, /const activeBranchId = currentBranchId/);
  assert.match(continuationUi, /if \(activeBranchId === 'ALL'\)/);
  assert.doesNotMatch(continuationUi, /BR-001/);
  assert.match(continuationContext, /if \(!targetBranchId \|\| targetBranchId === 'ALL'\)/);
  assert.match(continuationContext, /b\.id === targetBranchId && b\.isActive/);
  assert.match(continuationContext, /assignedBranchIds\.has\(targetBranchId\)/);
  assert.doesNotMatch(continuationContext, /BR-001/);
});

test('backend mengikat WO lanjutan secara atomik tanpa menimpa audit relasi lama', () => {
  const endpoint = source('api/endpoints/work-orders.php');
  const helpers = source('api/helpers.php');
  const resolver = sectionBetween(endpoint, '$resolveWorkOrderContinuations =', '$normalizeWorkOrderServices =');
  const createContract = sectionBetween(endpoint, "case 'POST':", "case 'PUT':");
  const updateContract = sectionBetween(endpoint, "case 'PUT':", "case 'DELETE':");

  // Referensi sumber/tujuan dikunci dan identitasnya harus sama dengan WO saat ini.
  assert.match(resolver, /SELECT id,wo_number,branch_id,customer_ref_id,vehicle_ref_id,status,[^']+FOR UPDATE/);
  assert.match(resolver, /WO lanjutan harus memakai pelanggan yang sama/);
  assert.match(resolver, /WO lanjutan harus memakai kendaraan yang sama/);
  assert.match(resolver, /\['Register',\s*'Proses',\s*'Closed'\]/);
  assert.match(resolver, /WO asal hanya dapat dilanjutkan ketika berstatus Register, Dikerjakan, atau Lost Sales/);
  assert.match(resolver, /if \(\$existingSource === ''\)\s*\{\s*\$assertSourceCanContinue\(\$currentWoStatus\)/);

  // Sumber Register boleh dikecualikan dari pemeriksaan WO aktif, kemudian
  // target dan tautan balik disimpan sebelum transaksi di-commit.
  assert.match(helpers, /status IN \('Register', 'Proses'\)[\s\S]*?COALESCE\(TRIM\(continued_to_wo_id\), ''\) = ''/);
  requireInOrder(createContract, [
    '$pdo->beginTransaction()',
    '$continuation = $resolveWorkOrderContinuations(',
    "assertNoActiveWorkOrder($pdo, (string)$vehicle['id'], $continuation['fromId'])",
    'INSERT INTO work_orders',
    "if ($continuation['fromId'] !== null && $continuation['fromNeedsSync'])",
    'UPDATE work_orders SET continued_to_wo_id=',
    '$pdo->commit()',
  ], 'pembuatan lanjutan dan tautan balik harus berada dalam satu transaksi');

  // Edit biasa pada target membaca relasi yang sudah sinkron, sehingga waktu,
  // pelaku, dan version token milik sumber tidak ditulis ulang.
  assert.match(resolver, /'fromNeedsSync'\s*=>[\s\S]*?continued_to_wo_id[\s\S]*?!== \$currentWoId/);
  assert.match(updateContract, /if \(\$continuation\['fromId'\] !== null && \$continuation\['fromNeedsSync'\]\)\s*\{[\s\S]*?continued_at=CURRENT_TIMESTAMP\(6\)/);
  assert.match(updateContract, /if \(\$continuation\['toId'\] !== null && \$continuation\['toNeedsSync'\]\)/);
  const createSourceLink = sectionBetween(
    createContract,
    "if ($continuation['fromId'] !== null && $continuation['fromNeedsSync'])",
    "if ($continuation['toId'] !== null && $continuation['toNeedsSync'])",
  );
  assert.doesNotMatch(createSourceLink, /\bstatus\s*=/i);
});

test('aksi faktur dan pembayaran WO memeriksa izin masing-masing', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const invoiceOpen = sectionBetween(page, 'const handleOpenInvoiceModal =', 'const handleCreateInvoice =');
  const linkedInvoice = sectionBetween(page, 'const openLinkedInvoice =', 'const openLinkedItem =');

  assert.match(invoiceOpen, /hasPermission\('invoice:create'\)/);
  assert.match(linkedInvoice, /hasPermission\('invoice:view'\)/);
  assert.match(linkedInvoice, /const permission = createPayment \? 'payment:create' : 'payment:view'/);
  assert.match(page, /hasPermission\('payment:view'\)[\s\S]*?openCustomerPayments\(invoice\.id\)/);
  assert.match(page, /hasPermission\('payment:create'\)[\s\S]*?openCustomerPayments\(invoice\.id, true\)/);
});

test('konflik versi memuat ulang data sebelum meminta pengguna mencoba lagi', () => {
  const context = source('src/context/AppContext.tsx');
  const updateClient = sectionBetween(context, 'const updateWorkOrder =', 'const deleteWorkOrder =');

  requireInOrder(updateClient, [
    'if (isVersionConflict)',
    'await refreshData()',
    'Data WO telah berubah di perangkat lain',
  ], 'konflik harus menyegarkan data sebelum menampilkan petunjuk retry');
});
