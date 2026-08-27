import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const markerCount = (text, marker) => (text.match(new RegExp(marker, 'g')) || []).length;

const betweenMarkers = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `Tidak menemukan penanda ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Tidak menemukan penanda berikutnya ${endMarker}`);
  return text.slice(start, end);
};

test('editor WO mobile menampilkan satu identitas dokumen serta konteks status dan cabang', () => {
  const page = source('src/pages/WorkOrders.tsx');

  assert.equal(markerCount(page, 'data-wo-mobile-identity'), 1, 'nomor WO mobile tidak boleh ditampilkan pada dua header');
  assert.equal(markerCount(page, 'data-wo-mobile-context'), 1);

  const identity = betweenMarkers(page, 'data-wo-mobile-identity', 'data-wo-mobile-context');
  assert.match(identity, /editingWO(?:\?)?\.woNumber/);
  assert.match(identity, /statusLabel\(editingWO\.status\)/);

  const context = betweenMarkers(page, 'data-wo-mobile-context', 'data-wo-registered-identity');
  assert.match(context, /data\.branches\.find\([\s\S]*?editingWO\?\.branchId[\s\S]*?\)\?\.name/);

  // Header lama + tab aktif sama-sama menuliskan nomor WO dan membuat
  // identitas ganda. Nomor sekarang hanya berada pada bilah identitas tunggal.
  const mobileEditorHeader = betweenMarkers(page, '/* Data Baru / Edit:', '<form id="work-order-entry-form"');
  assert.match(mobileEditorHeader, /editingWO \? 'Rincian WO' : 'Data Baru'/);
  assert.doesNotMatch(mobileEditorHeader, /className=\{`\$\{ui\.childTabActive\}[\s\S]*?editingWO\.woNumber/);
});

test('pelanggan dan kendaraan yang sudah teregister tetap terkunci di editor mobile', () => {
  const page = source('src/pages/WorkOrders.tsx');

  assert.match(page, /const customerVehicleLocked\s*=\s*Boolean\(isAutoRegistering \|\| \(editingWO && !customerVehicleCorrectionUnlocked\)\)/);
  assert.match(page, /<CustomerPicker[\s\S]*?disabled=\{customerVehicleLocked\}/);
  assert.match(page, /<VehiclePicker[\s\S]*?locked=\{customerVehicleLocked\}/);

  const registeredStart = page.indexOf('data-wo-registered-identity');
  assert.notEqual(registeredStart, -1);
  const registeredIdentity = page.slice(registeredStart, registeredStart + 1800);
  assert.match(registeredIdentity, /editingWO/);
  assert.match(registeredIdentity, /customerName|selectedCustomer/);
  assert.match(registeredIdentity, /formatPlateNumber\([\s\S]*?plateNumber/);
  assert.doesNotMatch(registeredIdentity, /min-h-\[(?:[1-9]\d*)px\]/, 'kartu identitas tidak boleh menyisakan blok kosong tinggi tetap');
  assert.match(page, /data-wo-document-shell[\s\S]*?className="relative min-h-0 bg-white sm:min-h-\[320px\]/);
});

test('daftar layanan mobile padat tetapi anggota paket tetap terbaca', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const services = betweenMarkers(page, 'data-wo-mobile-service-list', 'data-wo-items-table');

  assert.match(services, /formData\.services/);
  assert.match(services, /isPackageHeaderService\(service\)/);
  assert.match(services, /packageMembers\.map/);
  assert.match(services, /serviceItemCode\(member\)/);
  assert.match(services, /serviceReceiptName\(member\)/);
  assert.match(services, /member\.qty/);
  assert.match(services, /service\.qty/);
  assert.match(services, /service\.price/);
  assert.match(services, /rounded-lg border p-2\.5/);
  assert.match(services, /border-l-2 border-purple-200 pl-2 text-\[10px\] leading-4/);
});

test('ringkasan mobile menggabungkan jumlah item dan total tanpa panel kosong kedua', () => {
  const page = source('src/pages/WorkOrders.tsx');

  assert.equal(markerCount(page, 'data-wo-mobile-summary'), 1);
  const summaryStart = page.indexOf('data-wo-mobile-summary');
  const summary = page.slice(summaryStart, summaryStart + 700);
  assert.match(summary, /formData\.services\.filter\(service => !isPackageMemberService\(service\)\)\.length/);
  assert.match(summary, /totalServices\.toLocaleString\('id-ID'\)/);
  assert.doesNotMatch(summary, /min-h-\[/);
});

test('editor mobile hanya mempunyai satu footer persisten dan aksi status terpisah dari Simpan', () => {
  const page = source('src/pages/WorkOrders.tsx');

  assert.equal(markerCount(page, 'data-wo-mobile-footer'), 1);
  const footerStart = page.indexOf('data-wo-mobile-footer');
  assert.notEqual(footerStart, -1);
  const footer = page.slice(footerStart, footerStart + 9000);
  assert.match(footer, /flex-shrink-0/);
  assert.ok(page.lastIndexOf('</form>', footerStart) < footerStart, 'form scroll harus ditutup sebelum footer persisten');
  assert.equal(markerCount(footer, 'data-wo-mobile-process'), 1);
  assert.equal(markerCount(footer, 'data-wo-mobile-save'), 1);

  const processStart = footer.indexOf('data-wo-mobile-process');
  const saveStart = footer.indexOf('data-wo-mobile-save');
  assert.ok(processStart < saveStart, 'menu proses harus berdiri sendiri sebelum tombol Simpan');

  const processControl = footer.slice(Math.max(0, footer.lastIndexOf('<', processStart)), saveStart);
  assert.match(processControl, /type="button"/);
  assert.match(processControl, /requestStartProcessing|openCompletionModal|requestStatusChange|handleOpenInvoiceFromEditor/);
  assert.doesNotMatch(processControl, /type="submit"/);

  const saveControl = footer.slice(Math.max(0, footer.lastIndexOf('<', saveStart)));
  assert.match(saveControl, /type="submit"/);
  assert.match(saveControl, /form="work-order-entry-form"/);
  assert.match(saveControl, /diagnosisSubmitAction\.current\s*=\s*'save'/);
  assert.match(saveControl, />\s*\{?[\s\S]*?Simpan/);
});
