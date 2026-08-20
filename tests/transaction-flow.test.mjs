import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pembuatan faktur berjalan atomik dan mengizinkan stok minus', () => {
  const php = source('api/endpoints/sales-invoices.php');
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /adjustBranchStockAllowNegative\s*\(/);
  assert.match(php, /->commit\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
  assert.match(php, /invoice_id\s*=\s*\?/);
});

test('pembayaran mengunci faktur dan menolak nilai melebihi sisa tagihan', () => {
  const php = source('api/endpoints/customer-payments.php');
  assert.match(php, /sales_invoices WHERE id=\? FOR UPDATE/);
  assert.match(php, /Nominal pembayaran melebihi sisa tagihan/);
  assert.match(php, /recalculateCustomerInvoice\s*\(/);
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
});

test('penghapusan faktur mengembalikan stok dan melepas relasi WO', () => {
  const php = source('api/endpoints/sales-invoices.php');
  assert.match(php, /adjustBranchStockAllowNegative\([^;]+\(int\)\$detail\['qty'\]/s);
  assert.match(php, /UPDATE work_orders SET status='Selesai', invoice_id=NULL, invoice_number=NULL/);
  assert.match(php, /Hapus pembayaran terlebih dahulu sebelum menghapus faktur/);
});

test('sesi login memakai cookie HttpOnly dan tidak membocorkan token ke JavaScript', () => {
  const auth = source('api/endpoints/auth.php');
  const helpers = source('api/helpers.php');
  const client = source('src/lib/apiClient.ts');
  assert.match(auth, /setcookie\('drac_session'/);
  assert.match(auth, /'httponly'\s*=>\s*true/);
  assert.doesNotMatch(auth, /\$user\['apiToken'\]\s*=/);
  assert.match(helpers, /\$_COOKIE\['drac_session'\]/);
  assert.match(client, /credentials:\s*'include'/);
});

test('respons gagal koneksi database tidak mengirim detail internal', () => {
  const config = source('api/config.php');
  assert.match(config, /error_log\('DRAC database connection failed:/);
  assert.doesNotMatch(config, /'error'\s*=>\s*\$e->getMessage\(\)/);
});

test('pencarian barang mendukung filter stok cabang dan mengecualikan jasa', () => {
  const page = source('src/pages/ItemsAndServices.tsx');
  const rules = source('src/lib/itemSearchRules.ts');
  assert.match(page, /parseItemStockSearch\(search\)/);
  assert.match(page, /item\.type === 'Persediaan'/);
  assert.match(page, /matchesStockSearch\(displayStock\(item\)/);
  assert.match(rules, /stok\\s\*/);
  assert.match(rules, /normalized\.match/);
  assert.match(rules, /operator === '!='/);
  assert.match(rules, /replace\(\/<>\/g, '!='\)/);
  assert.match(rules, /replace\(\/=>\/g, '>='\)/);
  assert.match(rules, /matchAll/);
  assert.match(page, /selectedStocks\.some/);
  assert.match(page, /value="stok!=0"/);
});

test('cetak barang dapat dikelompokkan berdasarkan kategori', () => {
  const page = source('src/pages/ItemsAndServices.tsx');
  assert.match(page, /printGroupByCategory/);
  assert.match(page, /Group berdasarkan kategori/);
  assert.match(page, /class="category-group"/);
  assert.match(page, /items\.length} item/);
});

test('stok opname mengikuti Perintah, Hasil, lalu Penyesuaian otomatis', () => {
  const endpoint = source('api/endpoints/stock-opnames.php');
  const helpers = source('api/helpers.php');
  const page = source('src/pages/StockCountSheetReport.tsx');
  const router = source('api/index.php');
  assert.match(router, /'stock-opnames'\s*=>\s*'item'/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_count_orders/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_count_results/);
  assert.match(endpoint, /Menunggu Eksekusi/);
  assert.match(endpoint, /Dalam Penghitungan/);
  assert.match(endpoint, /adjustment_type.*stock_opname/);
  assert.match(endpoint, /Hapus Penyesuaian Stok/);
  assert.match(page, /Perintah → Hasil Penghitungan → Penyesuaian Stok/);
  assert.match(page, /Hitung #1/);
  assert.match(page, /Hitung #2/);
  assert.match(page, /Posting Hasil/);
});

test('refresh mutasi barang meminta histori per item dan menerima penyesuaian satu sisi', () => {
  const endpoint = source('api/endpoints/stock-movements.php');
  const page = source('src/pages/ItemsAndServices.tsx');
  assert.match(endpoint, /\$_GET\['itemId'\]/);
  assert.match(endpoint, /\$_GET\['dateFrom'\]/);
  assert.match(endpoint, /\$_GET\['dateTo'\]/);
  assert.match(endpoint, /source_branch_id[^\n]+\|\|[^\n]+destination_branch_id/);
  assert.match(page, /stock-movements\?\$\{query\.toString\(\)\}/);
  assert.match(page, /onClick=\{loadItemMovements\}/);
});

test('hapus penyesuaian stok mengikuti alur Accurate dan mengoreksi stok otomatis', () => {
  const endpoint = source('api/endpoints/stock-adjustments.php');
  const helpers = source('api/helpers.php');
  const page = source('src/pages/OpeningStockImport.tsx');
  assert.match(endpoint, /\$doc\['status'\]===\s*'Posted'/);
  assert.doesNotMatch(endpoint, /\$doc\['status'\]===\s*'Cancelled'[^}]+adjustWarehouseStockAllowNegative/s);
  assert.match(endpoint, /DELETE FROM stock_movements WHERE notes=\?/);
  assert.match(endpoint, /stock_adjustment_maintenance_logs/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_adjustment_maintenance_logs/);
  assert.match(page, /Hapus Penyesuaian/);
  assert.doesNotMatch(page, /Batalkan Penyesuaian/);
  assert.match(page, /Stok dan mutasi yang dibuat dokumen ini akan dikoreksi otomatis/);
  assert.match(page, /removeWithBody\("stock-adjustments"/);
});

test('dokumentasi online mencatat aturan dan alur kerja lintas modul', () => {
  const app = source('src/App.tsx');
  const layout = source('src/components/Layout.tsx');
  const page = source('src/pages/OnlineHelp.tsx');
  const articles = source('src/data/helpArticles.ts');
  assert.match(app, /path="help" element=\{<OnlineHelp/);
  assert.match(layout, /Dokumentasi Online/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /Buka modul terkait/);
  assert.match(articles, /Aturan koreksi seperti Accurate/);
  assert.match(articles, /Alur Order Kerja dari Register sampai Selesai/);
  assert.match(articles, /Alur Penerimaan, Faktur, dan Pembayaran Pembelian/);
  assert.match(articles, /Lembar Penghitungan Stok/);
  assert.match(articles, /Siklus Stok Barang dari Masuk sampai Keluar/);
  assert.match(articles, /help\.accurate\.id\/product\/persediaan/);
  assert.match(page, /Pedoman Accurate \+ Adaptasi DRAC/);
  assert.match(page, /Sumber Pedoman/);
});
