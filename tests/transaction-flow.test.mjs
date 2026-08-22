import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pembuatan faktur berjalan atomik, memilih gudang, dan mengizinkan stok minus', () => {
  const php = source('api/endpoints/sales-invoices.php');
  const page = source('src/pages/SalesInvoice.tsx');
  const help = source('src/data/helpArticles.ts');
  assert.match(php, /beginTransaction\s*\(/);
  assert.match(php, /adjustWarehouseStockAllowNegative\s*\(/);
  assert.match(php, /warehouse_id/);
  assert.match(php, /recordStockMovement\s*\(/);
  assert.match(php, /->commit\s*\(/);
  assert.match(php, /->rollBack\s*\(/);
  assert.match(php, /invoice_id\s*=\s*\?/);
  assert.doesNotMatch(page, /if \(detailQty > detailWarehouseStock\).*return window\.alert/);
  assert.doesNotMatch(page, /max=\{detailItem\.type === 'Persediaan'/);
  assert.match(page, /Barang tetap dapat disimpan/);
  assert.match(help, /Aturan stok negatif baku/);
  assert.match(help, /peringatan, bukan sebagai pemblokir transaksi/);
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

test('aturan baku Accurate: faktur terhapus dari transaksi dan mutasi aktif tetapi tetap ada di log aktivitas', () => {
  const helpers = source('api/helpers.php');
  const invoices = source('api/endpoints/sales-invoices.php');
  const receipts = source('api/endpoints/goods-receipts.php');
  const movements = source('api/endpoints/stock-movements.php');
  const allData = source('api/endpoints/all-data.php');
  const help = source('src/data/helpArticles.ts');
  assert.match(helpers, /transaction_activity_logs/);
  assert.match(helpers, /is_voided TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(invoices, /action_type,reason,snapshot_json/);
  assert.match(invoices, /VALUES\('sales_invoice',\?,\?,'delete'/);
  assert.match(invoices, /UPDATE stock_movements SET is_voided=1/);
  assert.match(invoices, /DELETE FROM sales_invoices WHERE id=\?/);
  assert.match(receipts, /VALUES\('goods_receipt',\?,\?,'delete'/);
  assert.match(receipts, /DELETE FROM goods_receipts WHERE id=\?/);
  assert.match(movements, /FROM stock_movements WHERE is_voided=0 ORDER BY movement_sequence/);
  assert.match(allData, /WHERE m\.is_voided=0 ORDER BY/);
  assert.match(help, /Aturan koreksi baku Accurate/);
  assert.match(help, /mutasi aktifnya hilang/);
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

test('ledger stok berurutan, dapat direkonsiliasi, dan edit header tidak membuat mutasi', () => {
  const helpers = source('api/helpers.php');
  const receipts = source('api/endpoints/goods-receipts.php');
  const movements = source('api/endpoints/stock-movements.php');
  const allData = source('api/endpoints/all-data.php');
  const items = source('src/pages/ItemsAndServices.tsx');
  assert.match(helpers, /movement_sequence BIGINT UNSIGNED/);
  assert.match(helpers, /occurred_at DATETIME/);
  assert.match(helpers, /reversal_of_id/);
  assert.match(helpers, /correction_group_id/);
  assert.match(helpers, /idempotency_key/);
  assert.match(receipts, /stockImpactChanged/);
  const receiptImpactRule = receipts.match(/\$stockImpactChanged=([\s\S]*?);/)?.[0] || '';
  const invoiceImpactRule = source('api/endpoints/sales-invoices.php').match(/\$stockImpactChanged=([\s\S]*?);/)?.[0] || '';
  assert.doesNotMatch(receiptImpactRule, /\['date'\]/);
  assert.doesNotMatch(invoiceImpactRule, /\['date'\]/);
  assert.match(receipts, /Tanggal, keterangan, petugas, dan header lain tidak mengubah saldo/);
  assert.match(receipts, /Perubahan tanggal\/referensi tanpa perubahan saldo/);
  assert.match(source('api/endpoints/sales-invoices.php'), /Perubahan tanggal tanpa perubahan saldo/);
  assert.match(receipts, /UPDATE stock_movements SET is_voided=1/);
  assert.match(receipts, /Penerimaan diedit/);
  assert.match(movements, /\(\$_GET\['reconcile'\]\?\?''\)==='1'/);
  assert.match(movements, /COALESCE\(m\.occurred_at,m\.created_at\) DESC,m\.movement_sequence DESC/);
  assert.match(allData, /m\.movement_sequence DESC/);
  assert.match(items, /receipt:'Penerimaan Barang'/);
  assert.match(items, /reversal:'Pembalik Transaksi'/);
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
  const compatibilityPicker = source('src/components/VehicleCompatibilityPicker.tsx');
  const endpoint = source('api/endpoints/items.php');
  const allData = source('api/endpoints/all-data.php');
  assert.match(compatibilityPicker, /Merek/);
  assert.match(compatibilityPicker, /Tipe \/ Model/);
  assert.match(compatibilityPicker, /Generasi/);
  assert.match(compatibilityPicker, /Kapasitas Mesin/);
  assert.match(compatibilityPicker, /Jenis Mesin/);
  assert.match(compatibilityPicker, /Semua CC/);
  assert.match(compatibilityPicker, /Bensin/);
  assert.match(compatibilityPicker, /Diesel/);
  assert.match(page, /UPC\/Barcode/);
  assert.match(page, /barcode:quick\.barcode\.trim\(\)/);
  assert.match(page, /\(i\.barcode\|\|''\)\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(page, /Merek Barang/);
  assert.match(page, /itemBrandId:selectedItemBrand\?\.id/);
  assert.match(page, /api\.get<QuickItemBrand\[]>\('item-brands'\)/);
  assert.match(page, /setLineDraft\(\{id:`L-\$\{Date\.now\(\)\}`/);
  assert.match(page, /Rincian Barang<\/button>.*Info lainnya<\/button>.*Penangguhan<\/button>/s);
  assert.match(page, /@Harga/);
  assert.match(page, /Total Harga/);
  assert.match(page, /max-w-xl flex-col/);
  assert.match(page, /grid-cols-\[32%_minmax\(0,1fr\)\]/);
  assert.match(page, /grid-cols-\[minmax\(0,1fr\)_96px\]/);
  assert.doesNotMatch(page, /<label>Satuan<\/label><input readOnly value=\{lineDraft\.unit\}/);
  assert.match(page, /confirmLineDraft/);
  assert.match(page, /lineDraftMode==='edit'/);
  assert.match(page, /const openQuickCreate=/);
  assert.match(page, /onKeyDown=\{e=>\{if\(e\.key==='Enter'\)/);
  assert.match(page, /onMouseDown=\{event=>\{event\.preventDefault\(\);addLine\(i\)\}\}/);
  assert.match(page, /fixed inset-0 z-\[79\].*Buat Barang Baru/s);
  assert.match(page, /barcode:looksLikeCode\?value:''/);
  assert.match(page, /grid-cols-\[32%_minmax\(0,1fr\)\]/);
  assert.match(page, /quickTab==='general'/);
  assert.match(page, /Dibuat otomatis/);
  assert.match(page, /Aktifkan No\. Seri\/Produksi/);
  assert.match(page, /grid-cols-2 gap-2 border-t/);
  const receiptEndpoint = source('api/endpoints/goods-receipts.php');
  assert.match(receiptEndpoint, /unit_price DECIMAL/);
  assert.match(receiptEndpoint, /discount_percent DECIMAL/);
  assert.match(receiptEndpoint, /technician_id VARCHAR/);
  assert.match(receiptEndpoint, /is_deferred TINYINT/);
  assert.match(receiptEndpoint, /Alasan penangguhan wajib diisi/);
  const purchaseInvoice = source('src/pages/PurchaseInvoices.tsx');
  assert.match(purchaseInvoice, /unitPrice: it\.unitPrice \?\?/);
  assert.match(purchaseInvoice, /it\.discountAmount/);
  assert.match(page, /vehicleCompatibilities/);
  assert.match(page, /const withUniversalFallback=/);
  assert.match(page, /setLineCompatibilities\(withUniversalFallback\(master\?\.vehicleCompatibilities\)\)/);
  assert.doesNotMatch(page, /Pilih minimal satu kecocokan mobil atau Universal/);
  assert.match(page, /unitOptions\.map/);
  assert.match(page, /Kode # \/ Barcode/);
  assert.match(page, /Kategori \/ Merek/);
  assert.match(page, /lg:grid-cols-\[448px_minmax\(24px,1fr\)_300px\]/);
  assert.match(page, /lg:grid-cols-\[112px_170px\]/);
  assert.match(page, /Keterangan penerimaan \(opsional\)/);
  assert.match(page, /value=\{form\.notes\}/);
  assert.match(page, /lg:grid-cols-\[128px_312px\]/);
  assert.match(page, /hidden lg:inline">:<\/span>/);
  assert.match(page, /Menyimpan\.\.\./);
  assert.match(page, /sudah ada dengan kode/);
  assert.match(page, /setQuickError\(error\?\.message/);
  assert.match(endpoint, /CREATE TABLE IF NOT EXISTS item_vehicle_compatibilities/);
  assert.match(endpoint, /replaceItemVehicleCompatibilities/);
  assert.match(endpoint, /Model\/tipe kendaraan tidak sesuai dengan merek/);
  assert.match(endpoint, /CC mesin tidak tersedia pada generasi yang dipilih/);
  assert.match(endpoint, /engine_type/);
  assert.match(allData, /vehicleCompatibilities/);
  assert.match(allData, /engineType/);
});

test('tampilan lihat penerimaan mengikuti header baru dan daftar menampilkan keterangan', () => {
  const detail = source('src/pages/GoodsReceiptDetail.tsx');
  const list = source('src/pages/GoodsReceipt.tsx');
  assert.match(detail, /lg:grid-cols-\[448px_minmax\(24px,1fr\)_300px\]/);
  assert.match(detail, /Keterangan penerimaan \(opsional\)/);
  assert.match(detail, /disabled=\{!editing\} value=\{form\.notes\}/);
  assert.match(detail, /Edit Penerimaan/);
  assert.match(detail, /Simpan perubahan/);
  assert.match(detail, /Gudang Aktif/);
  assert.match(list, /'Nomor #','Tanggal','Keterangan','Diterima Oleh','Jumlah Barang','Gudang','Status'/);
  assert.match(list, /\{r\.notes\|\|'-'\}/);
  assert.match(list, /\{r\.items\.length\} item \(\{r\.items\.reduce/);
  assert.match(list, /space-y-2 px-2 py-2 lg:hidden/);
  assert.match(list, /hidden lg:block/);
  assert.match(list, /const totalQuantity=/);
  assert.match(list, /\{r\.receivedBy\|\|'-'\}/);
  assert.match(list, /\{r\.items\.length\} item \(\{totalQuantity\} pcs\)/);
});

test('tanda terima barang dapat disimpan sebagai gambar, dibagikan, dan dicetak thermal', () => {
  const detail = source('src/pages/GoodsReceiptDetail.tsx');
  const acknowledgement = source('src/lib/goodsReceiptAcknowledgement.ts');
  const help = source('src/data/helpArticles.ts');
  assert.match(detail, /Simpan Gambar/);
  assert.match(detail, /Bagikan Gambar/);
  assert.match(detail, /Print Bluetooth 80 mm/);
  assert.match(detail, /documentMenuOpen/);
  assert.match(detail, /actionMenuOpen/);
  assert.match(detail, /Simpan, bagikan, atau print tanda terima/);
  assert.match(detail, /title="Simpan, bagikan, atau print tanda terima" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700/);
  assert.match(detail, /<Printer className="h-5 w-5"\/><ChevronDown className="h-3 w-3"\/>/);
  assert.match(detail, /receipt\.status!==['"]Draft['"]&&receipt\.status!==['"]Batal['"]/);
  assert.match(acknowledgement, /renderGoodsReceiptImage/);
  assert.match(acknowledgement, /navigator\.share/);
  assert.match(acknowledgement, /@page\{size:80mm auto/);
  assert.match(acknowledgement, /Diserahkan oleh/);
  assert.match(help, /Tanda terima digital/);
});
