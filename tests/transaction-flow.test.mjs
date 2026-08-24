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

test('lembar penghitungan stok terpisah dari transaksi opname dan memakai saldo per tanggal', () => {
  const app = source('src/App.tsx');
  const catalog = source('src/pages/ReportsIndex.tsx');
  const page = source('src/pages/StockCountSheetPrintReport.tsx');
  const endpoint = source('api/endpoints/stock-count-report.php');
  assert.match(app, /reports\/stock-count-sheet-print/);
  assert.match(catalog, /path: '\/reports\/stock-count-sheet-print'/);
  assert.match(page, /Parameter Laporan/);
  assert.match(page, />Umum<\/button>/);
  assert.match(page, />Kolom<\/button>/);
  assert.match(page, /Penyaringan Data/);
  assert.match(page, /stock-count-report\?date=/);
  assert.match(page, /Lembar Penghitungan Stok/);
  assert.match(page, /Hitung #1/);
  assert.match(page, /Hitung #2/);
  assert.match(endpoint, /Tanggal laporan tidak boleh melewati hari ini/);
  assert.match(endpoint, /warehouse_stocks/);
  assert.match(endpoint, /COALESCE\(occurred_at,created_at\)>CONCAT/);
  assert.doesNotMatch(page, /api\.create\(|api\.update\(|api\.remove/);
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
  assert.match(page, /receipt-notes-inline/);
  assert.match(page, /placeholder="Keterangan \(opsional\)"/);
  assert.match(page, /ActiveWarehouseHeader/);
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

test('rail aksi penerimaan baru mengikuti ukuran dan split button Accurate', () => {
  const page = source('src/pages/GoodsReceiptEntry.tsx');
  const railButton = source('src/components/AccurateActionRailButton.tsx');
  const rail = source('src/components/AccurateFormActionRail.tsx');
  assert.match(railButton, /h-14 w-\[72px\]/);
  assert.match(railButton, /grid-cols-\[1fr_20px\]/);
  assert.match(railButton, /border-l border-black\/10 bg-black\/5/);
  assert.match(page, /AccurateFormActionRail/);
  assert.match(rail, /Simpan, Dokumen, Lampiran/);
  assert.match(rail, /tone="danger"/);
  assert.match(page, /disabled:saving,onClick:\(\)=>void submit\('Diterima'\)/);
  assert.doesNotMatch(page, /disabled=\{saving\|\|!form\.items\.length\}/);
  assert.match(page, /Hapus tersedia setelah data disimpan/);
});

test('rail aksi form baru dipakai bersama oleh penerimaan dan penyesuaian stok', () => {
  const receipt = source('src/pages/GoodsReceiptEntry.tsx');
  const adjustment = source('src/pages/OpeningStockImport.tsx');
  const rail = source('src/components/AccurateFormActionRail.tsx');
  assert.match(receipt, /AccurateFormActionRail/);
  assert.match(adjustment, /AccurateFormActionRail/);
  assert.match(rail, /ariaLabel = 'Aksi formulir'/);
  assert.match(rail, /title=\{remove\?\.title \|\| 'Hapus'\}/);
});

test('ikon kalender tanggal Indonesia membuka native date picker secara eksplisit', () => {
  const input = source('src/components/IndonesianDateInput.tsx');
  assert.match(input, /pickerRef=useRef<HTMLInputElement>/);
  assert.match(input, /typeof picker\.showPicker==='function'/);
  assert.match(input, /onClick=\{openPicker\}/);
  assert.match(input, /title="Pilih tanggal"/);
  assert.doesNotMatch(input, /inset-y-0 right-0 w-10 cursor-pointer opacity-0/);
});

test('penerimaan mewajibkan satu cabang dan gudang yang sesuai', () => {
  const entry = source('src/pages/GoodsReceiptEntry.tsx');
  const list = source('src/pages/GoodsReceipt.tsx');
  const endpoint = source('api/endpoints/goods-receipts.php');
  assert.match(entry, /const branchId=currentBranchId==='ALL'\?'':currentBranchId/);
  assert.match(entry, /Pilih Cabang Transaksi/);
  assert.match(entry, /Semua Cabang hanya digunakan untuk melihat gabungan data/);
  assert.match(entry, /warehouses\.find\(warehouse=>warehouse\.id===form\.warehouseId\)/);
  assert.match(entry, /warehouseId:selectedWarehouse\.id/);
  assert.doesNotMatch(entry, /currentBranchId==='ALL'\?currentUser\?\.branchId:currentBranchId/);
  assert.match(list, /const openNewReceipt=.*currentBranchId==='ALL'/);
  assert.match(list, /Gudang tujuan tidak sesuai dengan cabang transaksi/);
  assert.match(endpoint, /SELECT id FROM warehouses WHERE id=\? AND branch_id=\? AND is_active=1/);
  assert.match(endpoint, /Gudang tujuan tidak valid/);
});

test('tampilan lihat penerimaan mengikuti header baru dan daftar menampilkan keterangan', () => {
  const detail = source('src/pages/GoodsReceiptDetail.tsx');
  const list = source('src/pages/GoodsReceipt.tsx');
  const warehouseHeader = source('src/components/ActiveWarehouseHeader.tsx');
  assert.match(detail, /lg:grid-cols-\[448px_minmax\(24px,1fr\)_300px\]/);
  assert.match(detail, /receipt-notes-inline/);
  assert.match(detail, /disabled=\{!editing\} value=\{form\.notes\}.*placeholder="Keterangan \(opsional\)"/);
  assert.match(detail, /Edit Penerimaan/);
  assert.match(detail, /Simpan perubahan/);
  assert.match(detail, /ActiveWarehouseHeader/);
  assert.match(warehouseHeader, /receipt-active-warehouse/);
  assert.match(warehouseHeader, /Gudang Aktif/);
  assert.match(warehouseHeader, /hidden whitespace-nowrap font-medium sm:inline/);
  assert.match(list, /'Nomor #','Tanggal','Keterangan','Diterima Oleh','Jumlah Barang','Gudang','Status'/);
  assert.match(list, /\{r\.notes\|\|'-'\}/);
  assert.match(list, /\{r\.items\.length\} item \(\{r\.items\.reduce/);
  assert.match(list, /space-y-2 px-2 py-2 lg:hidden/);
  assert.match(list, /hidden lg:block/);
  assert.match(list, /const totalQuantity=/);
  assert.match(list, /\{r\.receivedBy\|\|'-'\}/);
  assert.match(list, /\{r\.items\.length\} item \(\{totalQuantity\} pcs\)/);
  assert.match(list, /Status: Semua[\s\S]*className="w-40 flex-shrink-0"[\s\S]*title="Tampilkan mulai tanggal"[\s\S]*title="Bersihkan filter"/);
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

test('daftar Order Kerja memakai kepadatan desktop dan field standar Accurate', () => {
  const layout = source('src/components/Layout.tsx');
  const page = source('src/pages/WorkOrders.tsx');
  const styles = source('src/index.css');
  assert.match(layout, /lg:h-12 lg:py-1/);
  assert.match(layout, /h-\[34px\]/);
  assert.match(layout, /items-start gap-0\.5 overflow-x-auto/);
  assert.match(layout, /className=\{`\$\{ui\.workspaceBar\} hidden lg:flex`\}/);
  assert.match(styles, /\.app-workspace-bar[\s\S]*height: 34px/);
  assert.match(styles, /\.app-child-tab[\s\S]*height: 40px/);
  assert.match(styles, /\.app-child-bar[\s\S]*gap: 2px/);
  assert.match(styles, /\.app-control,[\s\S]*height: 36px/);
  assert.match(styles, /\.app-table-shell table thead th[\s\S]*height: 32px/);
  assert.match(page, /className=\{`\$\{ui\.search\} w-full pl-9 pr-3`\}/);
  assert.match(page, /className="h-9 w-40 text-sm"/);
  assert.match(page, /className=\{`\$\{ui\.tableShell\} mx-3 mt-0\.5 hidden shadow-sm lg:block`\}/);
  assert.match(page, /space-y-6 lg:-mx-6 lg:-mt-6 lg:space-y-0/);
  assert.match(layout, /app-brand-header/);
  assert.doesNotMatch(layout, /app-brand-header absolute left-0 top-0 flex h-12 w-\[320px\]/);
  assert.match(layout, /bg-\[#061a3a\] pt-12/);
  assert.match(layout, /lg:fixed lg:inset-x-0 lg:top-0 lg:z-\[75\]/);
  assert.match(layout, /Dashboard tetap tersedia di tab atas; spacer menjaga posisi menu desktop lain/);
  assert.match(layout, /mx-auto w-12 justify-center p-0/);
  assert.match(layout, /top-12[^"\n]*rounded-r-xl/);
  assert.match(layout, /left-\[84px\]/);
  assert.doesNotMatch(layout, /left-\[5\.75rem\]/);
  assert.match(styles, /\.app-brand-header::before[\s\S]*data:image\/svg\+xml/);
  assert.match(styles, /\.app-brand-header::after[\s\S]*linear-gradient/);
  assert.doesNotMatch(styles, /\.app-brand-header\s*\{[^}]*position:\s*relative/);
});

test('filter daftar WO memakai satu tanggal dan clear mengembalikan semua tanggal', () => {
  const page = source('src/pages/WorkOrders.tsx');
  assert.match(page, /selectedWorkOrderDate/);
  assert.match(page, /Filter satu tanggal WO/);
  assert.match(page, /Bersihkan tanggal — tampilkan semua tanggal/);
  assert.match(page, /Kosongkan tanggal untuk menampilkan semua tanggal/);
  const toolbar = page.slice(page.indexOf('{\/\* Filters \*\/}'), page.indexOf('<div className="hidden px-3 py-0.5">'));
  assert.doesNotMatch(toolbar, /Status: Semua/);
  assert.doesNotMatch(toolbar, /Tanggal: Semua/);
});

test('toolbar Barang dan Jasa mengikuti ukuran baku Order Kerja', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  const items = source('src/pages/ItemsAndServices.tsx');
  assert.match(workOrders, /className="order-3 inline-flex h-9 w-14/);
  assert.match(workOrders, /className="order-4 inline-flex h-9 w-11/);
  assert.match(items, /title="Data Baru" className="flex h-9 w-14/);
  assert.match(items, /title="Refresh" className="flex h-9 w-11/);
  assert.match(items, /title="Download \/ Export" className="flex h-9 w-9/);
  assert.match(items, /title="Cetak \/ Simpan PDF sesuai filter" className="flex h-9 w-9/);
  assert.match(items, /title="Pengaturan Kolom" className="flex h-9 w-9/);
  assert.match(items, /className="relative w-\[360px\]"/);
  assert.match(items, /className=\{`\$\{ui\.tableShell\} mx-1 lg:mx-3 lg:mt-0\.5`\}/);
  assert.match(items, /<th colSpan=\{9\} className="!h-8 !p-0">/);
  assert.match(items, /className="flex h-8 items-center text-xs font-semibold uppercase"/);
});

test('daftar Faktur Penjualan mengikuti kepadatan dan perataan Order Kerja', () => {
  const page = source('src/pages/SalesInvoice.tsx');
  assert.match(page, /space-y-3 lg:-mx-6 lg:-mt-6 lg:space-y-0/);
  assert.match(page, /\$\{ui\.toolbar\} border border-gray-300 p-3 shadow-sm lg:border-x-0 lg:border-y lg:px-3 lg:py-2/);
  assert.match(page, /className="flex flex-wrap items-center gap-x-2 gap-y-1\.5"/);
  assert.match(page, /title="Filter daftar faktur"/);
  assert.match(page, /Filter Faktur Penjualan/);
  assert.match(page, /activeFilterCount/);
  assert.match(page, /resetInvoiceFilters/);
  assert.doesNotMatch(page, /<option value="">Pelanggan: Semua<\/option>/);
  assert.match(page, /className="order-4 inline-flex h-9 w-11 items-center justify-center rounded border border-blue-600/);
  assert.match(page, /ariaLabel="Filter satu tanggal faktur"/);
  assert.match(page, /title="Buat faktur penjualan baru"/);
  assert.match(page, /title=\{`Buat faktur dari WO/);
  assert.match(page, /className="order-3 inline-flex h-9 w-14/);
  assert.match(page, /className="order-3 relative inline-flex h-9 w-14/);
  assert.match(page, /className="order-5 relative ml-auto min-w-\[260px\] flex-\[0_1_360px\]/);
  assert.match(page, /\$\{ui\.tableShell\} mx-1 shadow-sm lg:mx-3 lg:mt-0\.5/);
  assert.match(page, /<thead className="sticky top-0 z-20 bg-blue-800 text-white">/);
  assert.doesNotMatch(page, /<th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tanggal<\/th>/);
});

test('daftar Pembayaran Pelanggan mengikuti kepadatan dan perataan Order Kerja', () => {
  const page = source('src/pages/CustomerPayments.tsx');
  assert.match(page, /space-y-3 lg:-mx-6 lg:-mt-6 lg:space-y-0/);
  assert.match(page, /className=\{`\$\{ui\.childBar\} hidden lg:flex`\}/);
  assert.match(page, /\$\{ui\.toolbar\} border border-gray-300 p-3 shadow-sm lg:border-x-0 lg:border-y lg:px-3 lg:py-2/);
  assert.match(page, /title="Pembayaran Baru" aria-label="Pembayaran Baru" className="flex h-9 w-14/);
  assert.match(page, /title="Muat ulang" className="flex h-9 w-11/);
  assert.match(page, /title="Filter daftar pembayaran"/);
  assert.match(page, /Filter Pembayaran/);
  assert.match(page, /activeFilterCount/);
  assert.match(page, /setShowFilterPanel\(false\)/);
  assert.match(page, /className="relative w-full min-w-\[240px\] sm:w-\[360px\]"/);
  assert.match(page, /\$\{ui\.tableShell\} mx-1 hidden overflow-x-auto shadow-sm md:block lg:mx-3 lg:mt-0\.5/);
  assert.match(page, /<thead className="bg-blue-800 text-white">/);
  assert.doesNotMatch(page, /label="Total Diterima"/);
  assert.doesNotMatch(page, /label="Tunai Belum Disetor"/);
});

test('dashboard HP menukar posisi Pembayaran dengan Terima Barang', () => {
  const page = source('src/components/MobileDashboard.tsx');
  assert.match(page, /\['Terima Barang','Penerimaan & Riwayat',PackagePlus,'\/receipts','from-green-400 to-emerald-600','receipt:view'\]/);
  assert.match(page, /\['Pembayaran',Banknote,'\/customer-payments','payment:view'\]/);
  assert.doesNotMatch(page, /\['Pembayaran','Terima & Riwayat Bayar',Banknote,'\/customer-payments'/);
});

test('form WO memakai header Accurate, keluhan multi pilih, dan tab dokumen samping', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const complaints = source('src/components/ComplaintMultiSelect.tsx');
  const tabs = source('src/components/AccurateDocumentSideTabs.tsx');
  assert.match(page, /Pelanggan <span className="text-red-500">\*<\/span>/);
  assert.match(page, /Kendaraan <span className="text-red-500">\*<\/span>/);
  assert.match(page, /Baris utama Accurate: pelanggan \+ kendaraan, lalu tanggal\/waktu; keluhan selebar kedua isian/);
  assert.match(page, /lg:max-w-\[980px\] lg:grid-cols-\[85px_minmax\(0,1fr\)_minmax\(0,\.8fr\)_64px_130px_112px\] lg:gap-x-1/);
  assert.doesNotMatch(page, /<span>Nomor: <strong className="text-gray-900">\{editingWO\?\.woNumber/);
  assert.doesNotMatch(page, /<span>Cabang: <strong className="text-gray-900">\{data\.branches\.find\(branch/);
  assert.match(page, /ariaLabel="Aksi Work Order"/);
  assert.match(page, /top-2 z-50 hidden gap-1\.5 lg:flex \[&>div\]:mt-1\.5/);
  assert.match(page, /Terjadi Permasalahan pada Pemrosesan/);
  assert.match(page, /Pelanggan harus diisi/);
  assert.match(page, /disabled: editingWO \? \(statusLabel\(editingWO\.status\) === 'Lost Sales' && !customerVehicleCorrectionUnlocked\) : isAutoRegistering/);
  assert.match(page, /AccurateFormActionRail/);
  assert.match(page, /lg:pr-\[88px\]/);
  assert.match(page, /form: 'work-order-entry-form'/);
  assert.match(page, /Hapus barang atau jasa terpilih/);
  assert.match(page, /<td colSpan=\{6\} className="h-48/);
  assert.match(page, /setSelectedServiceId\(service\.id\)/);
  assert.match(page, /Waktu WO desktop/);
  assert.match(page, /data-wo-inline-actions className="hidden items-center justify-end gap-1\.5 lg:col-span-3 lg:flex"/);
  assert.match(page, /Register WO terlebih dahulu/);
  assert.match(page, /ComplaintMultiSelect/);
  assert.match(page, /selectedAction=\{!customerVehicleLocked/);
  assert.doesNotMatch(page, />Kontak kunjungan</);
  assert.doesNotMatch(page, /Kontak utama otomatis digunakan/);
  assert.match(page, /AccurateDocumentSideTabs active=\{documentTab\}/);
  assert.match(page, /Register WO terlebih dahulu untuk menambah barang\/jasa/);
  assert.match(complaints, /Ketik bebas lalu tekan Enter/);
  assert.match(complaints, /aria-label="Buka pilihan keluhan"/);
  assert.match(source('src/components/CustomerPicker.tsx'), /formatPlateNumber\(vehicle\.plateNumber\)/);
  assert.match(source('src/components/CustomerPicker.tsx'), /const vehicleLabel = vehicle \? getVehicleLabel\(vehicle\) : ''/);
  assert.match(source('src/components/CustomerPicker.tsx'), /\[\{vehicleLabel\}\]/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), /Belum ada kendaraan/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), /NA#/);
  assert.match(source('src/components/CustomerPicker.tsx'), /placeholder="Ketik nama, HP, atau nopol\.\.\."/);
  assert.match(source('src/components/CustomerPicker.tsx'), /onVehicleSelect\?\.\(vehicle\.id\)/);
  assert.match(source('src/components/CustomerPicker.tsx'), /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(source('src/components/VehiclePicker.tsx'), /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(complaints, /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(source('src/pages/WorkOrders.tsx'), /onVehicleSelect=\{handleVehicleSelect\}/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), />\{customer\.customerCode\}<\/span>/);
  assert.match(complaints, /Hapus keluhan \$\{entry\}/);
  assert.match(complaints, /entries\.join\(', '\)/);
  assert.match(tabs, /lg:absolute lg:right-full lg:top-0/);
  const styles = source('src/index.css');
  assert.match(styles, /--app-field-border: #a6a6a6/);
  assert.match(styles, /--app-field-focus: #1683ff/);
  assert.match(styles, /--app-field-error: #dc2626/);
  assert.match(styles, /height: 36px !important/);
  assert.match(styles, /box-shadow: 0 0 0 1px rgba\(22, 131, 255, \.28\) !important/);
  assert.match(styles, /\.app-combobox-field:focus-within/);
  assert.match(styles, /\.app-workspace-tab[\s\S]*?flex: 0 0 auto;/);
  assert.match(styles, /\.app-workspace-bar[\s\S]*?gap: 2px;[\s\S]*?overflow-anchor: none;/);
  assert.match(styles, /\.app-child-bar[\s\S]*?position: sticky;[\s\S]*?top: var\(--app-child-sticky-top, 0px\);[\s\S]*?z-index: 60;[\s\S]*?gap: 2px;[\s\S]*?overflow-anchor: none;/);
  assert.match(styles, /\.app-page-scroll--padded[\s\S]*?--app-child-sticky-top: -0\.75rem;[\s\S]*?@media \(min-width: 640px\)[\s\S]*?--app-child-sticky-top: -1\.5rem;/);
  assert.match(styles, /\.app-child-tab[\s\S]*?flex: 0 0 auto;/);
  assert.match(styles, /\.app-child-list-tab[\s\S]*?flex: 0 0 60px;/);
  assert.match(source('src/components/Layout.tsx'), /app-page-scroll min-h-0 flex-1/);
  assert.match(source('src/components/Layout.tsx'), /app-page-scroll--padded overflow-y-auto p-3 pb-24 sm:p-6 lg:pb-6/);
  assert.match(styles, /\.app-page-scroll[\s\S]*?scrollbar-width: none;/);
  assert.match(styles, /\.app-page-scroll--document-locked[\s\S]*?overflow-y: hidden !important;/);
  assert.match(styles, /\.app-page-scroll::\-webkit-scrollbar[\s\S]*?display: none;/);
  const documentCanvas = source('src/lib/useAccurateDocumentCanvas.ts');
  assert.match(documentCanvas, /page\.classList\.toggle\('app-page-scroll--document-locked', shouldLock\)/);
  assert.match(documentCanvas, /if \(shouldLock\) page\.scrollTop = 0/);
  assert.match(source('src/pages/WorkOrders.tsx'), /useAccurateDocumentCanvas\(showModal\)/);
  assert.match(source('src/pages/SalesInvoice.tsx'), /useAccurateDocumentCanvas\(showModal\)/);
  assert.match(source('src/pages/ItemsAndServices.tsx'), /useAccurateDocumentCanvas\(showItemModal\)/);
  assert.match(complaints, /app-combobox-field/);
  assert.match(complaints, /app-field-unstyled/);
  assert.match(tabs, /border-r-white bg-white text-rose-500/);
  assert.match(tabs, /before:w-0\.5 before:bg-rose-500/);
});

test('tombol Ambil dan Proses WO serta Faktur memakai ukuran dan posisi baku yang sama', () => {
  const standards = source('src/components/ui/interfaceStandards.ts');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const invoices = source('src/pages/SalesInvoice.tsx');
  assert.match(standards, /documentAction: 'inline-flex h-9 w-\[104px\]/);
  assert.match(workOrders, /Ambil <span className="text-xs transition-transform group-open:rotate-180">⌄<\/span>/);
  assert.match(workOrders, /disabled title="Register WO terlebih dahulu" className=\{ui\.documentAction\}>Proses/);
  assert.match(invoices, /disabled title="Simpan faktur terlebih dahulu" className=\{ui\.documentAction\}>Proses/);
  assert.ok((workOrders.match(/ui\.documentAction/g) || []).length >= 4);
  assert.ok((invoices.match(/ui\.documentAction/g) || []).length >= 4);
  assert.match(workOrders, /data-wo-inline-actions className="hidden items-center justify-end gap-1\.5 lg:col-span-3 lg:flex"/);
});

test('Daftar Laporan memakai katalog kategori Accurate yang padat dan responsif', () => {
  const page = source('src/pages/ReportsIndex.tsx');
  assert.match(page, /lg:grid-cols-\[270px_minmax\(0,1fr\)\]/);
  assert.match(page, /aria-label="Kategori laporan"/);
  assert.match(page, /\{ id: 'memorize', label: 'Memorize'/);
  assert.match(page, /\{ id: 'gudang', label: 'Gudang'/);
  assert.match(page, /className="grid gap-x-8 lg:grid-cols-2"/);
  assert.match(page, /label: 'Stok per Gudang'/);
  assert.match(page, /label: 'Lembar Penghitungan Stok'/);
  assert.match(page, /MEMORIZED_REPORTS_KEY = 'drac\.reports\.memorized\.v1'/);
  assert.match(page, /placeholder="Cari laporan\.\.\."/);
});

test('faktur baru dari WO dibuka sebagai subtab Data Baru tanpa modal melayang', () => {
  const page = source('src/pages/SalesInvoice.tsx');

  assert.match(page, /showWOPicker\s*&&\s*\([\s\S]*?ui\.childTabActive[\s\S]*?'Data Baru'/);
  assert.match(page, /aria-label="Data Baru Faktur dari Order Kerja"/);
  assert.match(page, /showWOPicker \? 'hidden' : showModal \|\| viewingInvoice \? 'lg:hidden'/);
  assert.doesNotMatch(page, /showWOPicker\s*&&\s*\(\s*<div className="fixed inset-0 bg-black\/50/);
  assert.match(page, /createInvoiceFromWO\([\s\S]*?woDraftItems[\s\S]*?normalizedManualReceiptNumber/);
});

test('form Faktur Penjualan mengikuti kerangka padat Data Baru Order Kerja', () => {
  const page = source('src/pages/SalesInvoice.tsx');

  assert.match(page, /aria-label="Aksi Faktur Penjualan"/);
  assert.match(page, /lg:grid-cols-\[120px_minmax\(0,1fr\)_minmax\(0,\.8fr\)_82px_190px_44px\]/);
  assert.match(page, />Pelanggan <span className="ml-1 text-red-500">\*<\/span>/);
  assert.match(page, />No\. Nota Fisik<\/label>/);
  assert.match(page, /className="flex justify-end gap-1 lg:col-span-2"/);
  assert.match(page, /aria-label="Tab rincian Faktur Penjualan"/);
  assert.match(page, /setSelectedFormItemId\(item\.id\)/);
  assert.match(page, /lg:pr-\[82px\]/);
  assert.doesNotMatch(page, /order-first mr-auto flex flex-wrap gap-x-5/);
});
