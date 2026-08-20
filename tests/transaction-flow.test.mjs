import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pembuatan faktur berjalan atomik, memilih gudang, dan mengizinkan stok minus', () => {
  const php = source('api/endpoints/sales-invoices.php');
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /adjustWarehouseStockAllowNegative\s*\(/);
  assert.match(php, /warehouse_id/);
  assert.match(php, /recordStockMovement\s*\(/);
  assert.match(php, /->commit\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
  assert.match(php, /invoice_id\s*=\s*\?/);
});

test('faktur dari WO memilih gudang per barang dan memperingatkan stok negatif', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const endpoint = source('api/endpoints/sales-invoices.php');
  assert.match(page, /invoiceItemWarehouses/);
  assert.match(page, /Gudang Pengeluaran Stok/);
  assert.match(page, /Butuh \{line\.service\.qty\}/);
  assert.match(page, /invoiceHasStockShortage/);
  assert.match(page, /AKAN NEGATIF/);
  assert.match(page, /saldo gudang akan tercatat negatif/);
  assert.doesNotMatch(page, /disabled=\{isCreatingInvoice\|\|invoiceHasStockShortage/);
  assert.match(page, /createInvoiceFromWO\([^;]+invoiceItems/s);
  assert.match(endpoint, /prepareSalesStockItems/);
  assert.match(endpoint, /adjustWarehouseStockAllowNegative\([^;]+-\(int\)\$service\['qty'\]/s);
  assert.doesNotMatch(endpoint, /Stok \{\$requirement\['code'\]\} - \{\$requirement\['name'\]\}/);
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
  assert.match(php, /adjustWarehouseStockAllowNegative\([^;]+\(int\)\$detail\['qty'\]/s);
  assert.match(php, /Pembalik penjualan/);
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
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_count_orders/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_count_results/);
  assert.match(endpoint, /Menunggu Eksekusi/);
  assert.match(endpoint, /Dalam Penghitungan/);
  assert.match(endpoint, /adjustment_type.*stock_opname/);
  assert.match(endpoint, /system_version/);
  assert.match(endpoint, /stock_opname:post/);
  assert.match(endpoint, /Hapus Penyesuaian Stok/);
  assert.match(page, /Perintah → Hasil Penghitungan → Penyesuaian Stok/);
  assert.match(page, /Hitung #1/);
  assert.match(page, /Hitung #2/);
  assert.match(page, /Setujui & Posting/);
});

test('refresh mutasi barang meminta histori per item dan menerima penyesuaian satu sisi', () => {
  const endpoint = source('api/endpoints/stock-movements.php');
  const page = source('src/pages/ItemsAndServices.tsx');
  assert.match(endpoint, /\$_GET\['itemId'\]/);
  assert.match(endpoint, /\$_GET\['dateFrom'\]/);
  assert.match(endpoint, /\$_GET\['dateTo'\]/);
  assert.match(endpoint, /\$_GET\['warehouseId'\]/);
  assert.match(endpoint, /source_branch_id[^\n]+\|\|[^\n]+destination_branch_id/);
  assert.match(page, /stock-movements\?\$\{query\.toString\(\)\}/);
  assert.match(page, /onClick=\{loadItemMovements\}/);
  assert.match(page, /Semua Gudang yang Diakses/);
});

test('seluruh dokumen stok menulis jurnal bernomor dan transfer mendukung pembatalan', () => {
  const helpers = source('api/helpers.php');
  const sales = source('api/endpoints/sales-invoices.php');
  const receipts = source('api/endpoints/goods-receipts.php');
  const transfers = source('api/endpoints/warehouse-transfers.php');
  assert.match(helpers, /function recordStockMovement/);
  assert.match(helpers, /reference_number/);
  assert.match(sales, /'sales_invoice'/);
  assert.match(receipts, /'goods_receipt'/);
  assert.match(transfers, /transfer_send/);
  assert.match(transfers, /transfer_receive/);
  assert.match(transfers, /mutasi pembalik/i);
  assert.match(transfers, /Hanya transfer Draft yang dapat dikirim/);
});

test('gudang tidak dapat dinonaktifkan saat saldo atau dokumen masih terbuka', () => {
  const endpoint = source('api/endpoints/warehouses.php');
  assert.match(endpoint, /SUM\(ABS\(quantity\)\+ABS\(reserved_quantity\)\)/);
  assert.match(endpoint, /warehouse_transfers/);
  assert.match(endpoint, /stock_count_orders/);
  assert.match(endpoint, /goods_receipts/);
});

test('penyesuaian posted dibatalkan dengan mutasi pembalik dan tidak dihapus', () => {
  const endpoint = source('api/endpoints/stock-adjustments.php');
  const helpers = source('api/helpers.php');
  const page = source('src/pages/OpeningStockImport.tsx');
  assert.match(endpoint, /Dokumen yang sudah diposting tidak boleh dihapus/);
  assert.match(endpoint, /movementType|'reversal'/);
  assert.match(endpoint, /DELETE FROM stock_movements WHERE notes=\?/);
  assert.match(endpoint, /stock_adjustment_maintenance_logs/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS stock_adjustment_maintenance_logs/);
  assert.match(page, /Batalkan dengan Mutasi Pembalik/);
  assert.doesNotMatch(page, /Hapus Penyesuaian/);
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

test('penerimaan dapat membuat dan langsung memilih barang dengan kecocokan mobil', () => {
  const page = source('src/pages/GoodsReceiptEntry.tsx');
  const endpoint = source('api/endpoints/items.php');
  const allData = source('api/endpoints/all-data.php');
  assert.match(page, /Merek Mobil \*/);
  assert.match(page, /Model \/ Tipe/);
  assert.match(page, /Generasi/);
  assert.match(page, /Mesin \/ CC/);
  assert.match(page, /vehicleCompatibilities/);
  assert.match(page, /Menyimpan\.\.\./);
  assert.match(page, /sudah ada dengan kode/);
  assert.match(page, /setQuickError\(error\?\.message/);
  assert.match(endpoint, /CREATE TABLE IF NOT EXISTS item_vehicle_compatibilities/);
  assert.match(endpoint, /replaceItemVehicleCompatibilities/);
  assert.match(endpoint, /Model\/tipe kendaraan tidak sesuai dengan merek/);
  assert.match(endpoint, /CC mesin tidak tersedia pada generasi yang dipilih/);
  assert.match(allData, /vehicleCompatibilities/);
});
