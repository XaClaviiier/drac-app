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
