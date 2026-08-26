import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('lembar penghitungan stok mengurutkan kategori berdasarkan pemakaian transaksi', () => {
  const reportApi = read('api/endpoints/stock-count-report.php');
  const opnameApi = read('api/endpoints/stock-opnames.php');
  const printPage = read('src/pages/StockCountSheetPrintReport.tsx');

  assert.match(reportApi, /SUM\(ABS\(d\.qty\)\)/);
  assert.match(reportApi, /\$categoryUsage\[\$rightCategory\].*<=>.*\$categoryUsage\[\$leftCategory\]/s);
  assert.match(reportApi, /categoryUsageCount/);
  assert.match(opnameApi, /loadCategoryUsage/);
  assert.match(opnameApi, /sortByCategoryUsage/);
  assert.match(printPage, /categoryUsageCount/);
  assert.match(printPage, /leftCategory\.localeCompare\(rightCategory, 'id-ID'\)/);
});

test('pemeliharaan periode dapat membersihkan master tanpa transaksi secara eksplisit', () => {
  const endpoint = read('api/endpoints/data-maintenance.php');
  const client = read('src/lib/apiClient.ts');
  const settings = read('src/pages/SettingsPage.tsx');

  assert.match(endpoint, /cleanupOrphans/);
  assert.match(endpoint, /NOT EXISTS \(SELECT 1 FROM work_orders/);
  assert.match(endpoint, /data_purge_snapshots/);
  assert.match(endpoint, /UPDATE stock_movements SET is_voided=1/);
  assert.match(client, /cleanupOrphans=/);
  assert.match(settings, /Hapus pelanggan dan kendaraan tanpa transaksi tersisa/);
});
