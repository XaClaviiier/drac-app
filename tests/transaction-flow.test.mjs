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
  assert.match(helpers, /ensureTableColumn\(\$pdo,'stock_movements','is_voided','TINYINT\(1\) NOT NULL DEFAULT 0/);
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

test('audit WO, faktur, dan pembayaran memakai waktu WITA yang konsisten', () => {
  const router = source('api/index.php');
  const endpoint = source('api/endpoints/work-orders.php');
  const page = source('src/pages/WorkOrders.tsx');

  assert.match(router, /SET time_zone = '\+08:00'/);
  assert.match(endpoint, /DateTimeZone\('Asia\/Makassar'\)/);
  assert.match(endpoint, /DateTimeInterface::ATOM/);
  assert.match(endpoint, /'createdAt' => \$formatAuditTimestamp\(\$payment\['created_at'\]/);
  assert.match(endpoint, /\$r\['createdAt'\]\s*=\s*\$formatAuditTimestamp\(\$r\['created_at'\]/);
  assert.match(endpoint, /\$r\['continuedAt'\]\s*=\s*\$formatAuditTimestamp\(\$r\['continued_at'\]/);
  assert.match(endpoint, /\$entry\['at'\]\s*=\s*\$formatAuditTimestamp\(\$entry\['at'\]/);
  assert.match(page, /title: 'Anomali urutan audit'/);
  assert.match(page, /sistem tidak mengubah urutannya secara semu/);
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
  assert.match(endpoint, /result_status'\]==='Posted'[\s\S]*?Hasil Stok Opname yang sudah diposting tidak dapat dihapus/);
  assert.match(page, /Perintah → Hasil Penghitungan → Penyesuaian Stok/);
  assert.match(page, />In<\/th>/);
  assert.match(page, />Out<\/th>/);
  assert.match(page, />Stok<\/th>/);
  assert.match(page, />Opname<\/th>/);
  assert.match(page, />Selisih<\/th>/);
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
  assert.match(helpers, /ensureTableColumn\(\$pdo,'stock_movements','occurred_at','DATETIME NULL/);
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
  assert.match(receiptEndpoint, /ensureTableColumn\(\$pdo,'goods_receipt_items','unit_price','DECIMAL/);
  assert.match(receiptEndpoint, /ensureTableColumn\(\$pdo,'goods_receipt_items','discount_percent','DECIMAL/);
  assert.match(receiptEndpoint, /ensureTableColumn\(\$pdo,'goods_receipt_items','technician_id','VARCHAR/);
  assert.match(receiptEndpoint, /ensureTableColumn\(\$pdo,'goods_receipt_items','is_deferred','TINYINT/);
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

test('Terima Barang mobile memakai ringkasan satu kolom, kartu barang, dan action bar di atas navigasi', () => {
  const entry = source('src/pages/GoodsReceiptEntry.tsx');
  const detail = source('src/pages/GoodsReceiptDetail.tsx');
  const endpoint = source('api/endpoints/goods-receipts.php');
  for (const page of [entry, detail]) {
    assert.match(page, /goods-receipt-mobile-summary/);
    assert.match(page, /goods-receipt-mobile-item/);
    assert.match(page, /goods-receipt-mobile-actions/);
    assert.match(page, /bottom-\[calc\(76px\+env\(safe-area-inset-bottom\)\)\]/);
    assert.match(page, /lg:hidden/);
    assert.match(page, /hidden[^"\n]*lg:block/);
    assert.match(page, /goods-receipt-mobile-summary.*grid grid-cols-1/s);
    assert.match(page, /goods-receipt-mobile-open-item/);
    assert.match(page, /goods-receipt-mobile-delivery-other/);
  }
  assert.match(entry, /className="hidden lg:flex"/);
  assert.match(entry, /pb-\[calc\(11rem\+env\(safe-area-inset-bottom\)\)\][^"\n]*lg:pb-20/);
  assert.match(detail, /pb-\[calc\(11rem\+env\(safe-area-inset-bottom\)\)\][^"\n]*lg:pb-20/);
  assert.match(entry, /whitespace-normal.*line\.itemName/s);
  assert.match(detail, /whitespace-normal.*line\.itemName/s);
  assert.match(detail, /goods-receipt-mobile-purchase-invoice/);
  assert.match(detail, /const save=async\(\)=>\{.*form\.deliveryMethod==='Lainnya'&&!form\.deliveryOther\.trim\(\)/s);
  assert.match(endpoint, /function normalizeGoodsReceiptDelivery/);
  assert.equal((endpoint.match(/normalizeGoodsReceiptDelivery\(/g)||[]).length, 3);
  assert.match(endpoint, /Tuliskan cara pengiriman lainnya/);
  assert.doesNotMatch(entry, /ml-2 mr-\[92px\] mt-1 overflow-hidden/);
});

test('rail aksi penerimaan baru mengikuti ukuran dan split button Accurate', () => {
  const page = source('src/pages/GoodsReceiptEntry.tsx');
  const railButton = source('src/components/AccurateActionRailButton.tsx');
  const rail = source('src/components/AccurateFormActionRail.tsx');
  assert.match(railButton, /h-14 w-\[72px\]/);
  assert.match(railButton, /grid-cols-\[1fr_20px\]/);
  assert.match(railButton, /border-l border-black\/10 bg-black\/5/);
  assert.match(page, /AccurateFormActionRail/);
  assert.match(rail, /Simpan, Cetak, Lampiran/);
  assert.match(rail, /Printer/);
  assert.doesNotMatch(rail, /FileText/);
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
  assert.match(rail, /\{remove && \(/);
  assert.match(rail, /title=\{remove\.title \|\| 'Hapus'\}/);
  assert.match(rail, /title=\{print\?\.title \|\| 'Cetak'\}/);
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

test('nomor penerimaan memakai antrian server atomik dan nomor browser hanya pratinjau', () => {
  const helpers = source('api/helpers.php');
  const router = source('api/index.php');
  const endpoint = source('api/endpoints/goods-receipts.php');
  const context = source('src/context/AppContext.tsx');
  const entry = source('src/pages/GoodsReceiptEntry.tsx');
  const createBlock = endpoint.match(/case 'POST':([\s\S]*?)case 'PUT':/)?.[1] || '';

  assert.match(router, /api_support_20260829_goods_receipt_queue_v1/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS goods_receipt_sequences/);
  assert.match(helpers, /function nextGoodsReceiptNumber/);
  assert.match(helpers, /INSERT IGNORE INTO goods_receipt_sequences/);
  assert.match(helpers, /SELECT last_number FROM goods_receipt_sequences[^;]+FOR UPDATE/s);
  assert.match(helpers, /MAX\(CAST\(SUBSTRING\(receipt_number/);
  assert.match(helpers, /max\(\$stored, \(int\)\$maxStmt->fetchColumn\(\)\) \+ 1/);
  assert.match(createBlock, /\$receiptNumber = nextGoodsReceiptNumber/);
  assert.match(createBlock, /\$rId, \$receiptNumber, \$d\['date'\]/);
  assert.match(createBlock, /'receiptNumber' => \$receiptNumber/);
  assert.doesNotMatch(createBlock, /\$rId, \$d\['receiptNumber'\]/);
  assert.match(createBlock, /Nomor antrian penerimaan baru saja dipakai perangkat lain/);
  assert.doesNotMatch(context, /branchReceipts\.length \+ 1/);
  assert.match(context, /highestSuffix \+ 1/);
  assert.match(entry, /generateReceiptNumber\(branchId,form\.date\)/);
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
  assert.match(list, /Status: Semua[\s\S]*className="w-40 flex-shrink-0"[\s\S]*title="Tampilkan mulai tanggal"[\s\S]*ActiveFilterResetButton active=\{receiptFiltersActive\}/);
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
  assert.match(page, /className="h-9 min-w-0 w-full text-xs sm:text-sm lg:w-40"/);
  assert.match(page, /className=\{`\$\{ui\.tableShell\} mx-3 mt-0\.5 hidden shadow-sm lg:block`\}/);
  assert.match(page, /space-y-0 lg:-mx-6 lg:-mt-6/);
  assert.match(page, /app-workorder-mobile-toolbar border-y/);
  assert.match(page, /space-y-2 px-2 pb-3 pt-2 lg:hidden/);
  assert.match(styles, /\.app-workorder-mobile-toolbar[\s\S]*?position: sticky;[\s\S]*?top: calc\(var\(--app-child-sticky-top, 0px\) \+ 42px\);[\s\S]*?z-index: 50;/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.app-workorder-mobile-toolbar[\s\S]*?position: static;/);
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

test('filter daftar WO memakai satu tanggal dan clear mengembalikan semua filter', () => {
  const page = source('src/pages/WorkOrders.tsx');
  assert.match(page, /selectedWorkOrderDate/);
  assert.match(page, /Filter satu tanggal WO/);
  assert.match(page, /absolute right-0 top-\[calc\(100%\+6px\)\] z-40 w-\[min\(360px,calc\(100vw-16px\)\)\]/);
  assert.match(page, /ActiveFilterResetButton active=\{activeFilterCount > 0\} onReset=\{resetWorkOrderFilters\}/);
  assert.match(page, /Kosongkan tanggal untuk menampilkan semua tanggal/);
  const toolbar = page.slice(page.indexOf('{\/\* Filters \*\/}'), page.indexOf('<div className="hidden px-3 py-0.5">'));
  assert.doesNotMatch(toolbar, /Status: Semua/);
  assert.doesNotMatch(toolbar, /Tanggal: Semua/);
  assert.match(toolbar, /grid-cols-\[auto_auto_minmax\(0,1fr\)_auto\]/);
  assert.match(toolbar, /order-5 col-span-4 relative min-w-0 w-full/);
  assert.match(toolbar, /order-6 hidden flex-wrap items-center gap-2 lg:flex/);
  assert.match(toolbar, /order-6 hidden h-9 min-w-14/);
});

test('perubahan status WO lama tidak diblokir warna kendaraan historis', () => {
  const helpers = source('api/helpers.php');
  const workOrders = source('api/endpoints/work-orders.php');
  assert.match(helpers, /bool \$requireClearColor = true/);
  assert.match(helpers, /function assertVehicleColorClear\(array \$vehicle\): void/);
  assert.match(helpers, /if \(\$requireClearColor\) assertVehicleColorClear\(\$vehicle\)/);
  assert.match(workOrders, /resolveCustomerVehicle\([\s\S]*?true,[\s\S]*?false[\s\S]*?\);/);
  assert.match(workOrders, /\$vehicleChanged = \(string\)\$currentWorkOrder\['vehicle_ref_id'\] !== \(string\)\$vehicle\['id'\]/);
  assert.match(workOrders, /if \(\$vehicleChanged\) assertVehicleColorClear\(\$vehicle\)/);
  assert.match(workOrders, /if \(\$vehicleChanged\) \{[\s\S]*?assertNoActiveWorkOrder/);
});

test('semua daftar utama memakai tombol X Clear Filter hanya saat filter aktif', () => {
  const resetButton = source('src/components/ActiveFilterResetButton.tsx');
  assert.match(resetButton, /if \(!active\) return null/);
  assert.match(resetButton, /title="Clear Filter"/);
  assert.match(resetButton, /aria-label="Clear Filter"/);
  [
    'src/pages/WorkOrders.tsx',
    'src/pages/SalesInvoice.tsx',
    'src/pages/CustomerPayments.tsx',
    'src/pages/ItemsAndServices.tsx',
    'src/pages/GoodsReceipt.tsx',
    'src/pages/PurchaseInvoices.tsx',
    'src/pages/WorkOrderTimeline.tsx',
    'src/pages/Categories.tsx',
    'src/pages/Suppliers.tsx',
    'src/pages/VehicleRegister.tsx',
    'src/pages/Warehouses.tsx',
    'src/pages/WorkOrderReport.tsx',
    'src/pages/SalesReport.tsx',
    'src/pages/PurchaseReport.tsx',
  ].forEach(file => assert.match(source(file), /ActiveFilterResetButton/, file));
});

test('toolbar Barang dan Jasa mengikuti ukuran baku Order Kerja', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  const items = source('src/pages/ItemsAndServices.tsx');
  assert.match(workOrders, /className="order-1 inline-flex h-9 w-11/);
  assert.match(workOrders, /className="order-2 inline-flex h-9 w-11/);
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

test('Master Merek Barang tersedia dari menu Barang dan Jasa serta menerima kode otomatis', () => {
  const layout = source('src/components/Layout.tsx');
  const items = source('src/pages/ItemsAndServices.tsx');
  const endpoint = source('api/endpoints/item-brands.php');
  const saveBrand = items.match(/const saveItemBrand=async[\s\S]*?const removeItemBrand=/)?.[0] || '';

  assert.match(layout, /label: "Merek Barang",\s*path: "\/items\?master=item-brands"/);
  assert.match(items, /searchParams\.get\('master'\) !== 'item-brands'/);
  assert.match(items, /data-item-brand-master-trigger/);
  assert.match(items, /data-item-brand-master-modal/);
  assert.match(items, /data-item-brand-master-form/);
  assert.match(saveBrand, /if\(!payload\.name\)/);
  assert.doesNotMatch(saveBrand, /!payload\.code/);
  assert.match(saveBrand, /api\.create\('item-brands'/);
  assert.match(items, /hasPermission\('item:create'\)/);
  assert.match(items, /hasPermission\('item:edit'\)/);
  assert.match(items, /hasPermission\('item:delete'\)/);
  assert.match(endpoint, /if\(\$code===''\)\$code='NEW-'/);
  assert.match(endpoint, /Nama merek wajib diisi/);
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

test('identitas dan aksi daftar Faktur Penjualan mengikuti daftar Order Kerja', () => {
  const page = source('src/pages/SalesInvoice.tsx');

  assert.match(page, /key: 'customer', label: 'Pelanggan \/ Kendaraan'/);
  assert.match(page, /key: 'number', label: 'Nomor Faktur \/ Status'/);
  assert.match(page, /invoicePaid = invoice\.total > 0 && invoice\.payment >= invoice\.total/);
  assert.match(page, /title=\{`Faktur dibuat dari \$\{invoice\.woNumber\}`\}>\{invoice\.woNumber\}<\/span>/);
  assert.match(page, /\{invoicePaid \? 'Lunas' : 'Belum Lunas'\}/);
  assert.match(page, /No\. Nota Asli:[\s\S]*?\{invoice\.manualReceiptNumber\}/);
  assert.match(page, /invoiceCustomerPhone\(invoice\)[\s\S]*?vehicleSummary\.detail/);
  assert.match(page, /shareInvoiceToWhatsApp\(invoice\)/);
  assert.match(page, /aria-label=\{`Buka Faktur \$\{invoice\.invoiceNumber\}`\}/);
  assert.doesNotMatch(page, /\{invoiceCustomerPhone\(invoice\)\} - \{invoice\.customerId\}/);
  assert.doesNotMatch(page, /isInvoiceColumnVisible\('vehicle'\)/);
});

test('kolom desktop WO dan Faktur dapat diurutkan dipindah dan diubah lebarnya', () => {
  const shared = source('src/components/ConfigurableTable.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const invoices = source('src/pages/SalesInvoice.tsx');

  assert.match(shared, /text\/x-drac-column/);
  assert.match(shared, /cursor-col-resize/);
  assert.match(shared, /current\.direction === 'asc'[\s\S]*?direction: 'desc'[\s\S]*?: null/);
  assert.match(shared, /localStorage\.setItem\(storageKey/);
  assert.match(shared, /fixedRightKeys\.includes\(source\) \|\| fixedRightKeys\.includes\(target\)/);
  assert.match(workOrders, /WORK_ORDER_SORTABLE_COLUMNS[^\n]*'number'[^\n]*'date'[^\n]*'customer'[^\n]*'total'[^\n]*'createdBy'[^\n]*'attention'/);
  assert.doesNotMatch(workOrders, /WORK_ORDER_SORTABLE_COLUMNS[^\n]*'services'/);
  assert.match(invoices, /SALES_INVOICE_SORTABLE_COLUMNS[^\n]*'date'[^\n]*'number'[^\n]*'customer'[^\n]*'attention'[^\n]*'total'[^\n]*'branch'/);
  assert.doesNotMatch(invoices, /SALES_INVOICE_SORTABLE_COLUMNS[^\n]*'actions'/);
  assert.match(invoices, /key: 'attention', label: 'Perhatian'/);
  assert.match(workOrders, /Reset Urutan &amp; Lebar/);
  assert.match(invoices, /Reset Urutan &amp; Lebar/);
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

test('dashboard HP tidak menampilkan kartu ringkasan transaksi', () => {
  const page = source('src/components/MobileDashboard.tsx');
  assert.doesNotMatch(page, /\[orderNew,'Order Baru'\]/);
  assert.doesNotMatch(page, /Dalam Proses/);
  assert.doesNotMatch(page, /Faktur Hari Ini/);
  assert.match(page, /<section className="mt-5 grid grid-cols-3 gap-3">/);
});

test('pemilih cabang HP terlihat untuk akses multi cabang dan tidak tertutup halaman', () => {
  const layout = source('src/components/Layout.tsx');
  assert.match(layout, /const canSwitchBranches = canSelectAllBranches \|\| activeBranches\.length > 1/);
  assert.match(layout, /\{canSwitchBranches && \(/);
  assert.match(layout, /fixed left-3 right-3 top-\[60px\] z-\[90\]/);
  assert.match(layout, /canSelectAllBranches && \(/);
});

test('Teknisi dapat menyimpan layanan dan melanjutkan Register menjadi Dikerjakan', () => {
  const context = source('src/context/AppContext.tsx');
  const helpers = source('api/helpers.php');
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(context, /'wo:view', 'wo:create', 'wo:edit'/);
  assert.match(helpers, /'wo:view', 'wo:create', 'wo:edit'/);
  assert.match(workOrders, /currentUserIsTechnician \? currentUser\?\.id \|\| '' : ''/);
  assert.match(context, /nextStatus === 'Proses' && !wo\.technicianId && currentUserIsTechnician/);
  assert.match(workOrders, /const latest = data\.workOrders\.find\(\(workOrder\) => workOrder\.id === detailWO\.id\)/);
  assert.match(workOrders, /onClick=\{\(\) => requestStartProcessing\(detailWO\)\}/);
  assert.match(workOrders, /formData\.services\.length > 0 && totalServices > 0/);
  assert.match(workOrders, /diagnosisSubmitAction\.current = 'process'/);
  assert.match(workOrders, />\s*Dikerjakan\s*<\/button>/);
});

test('form WO memakai header Accurate, keluhan multi pilih, dan tab dokumen samping', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const complaints = source('src/components/ComplaintMultiSelect.tsx');
  const tabs = source('src/components/AccurateDocumentSideTabs.tsx');
  assert.match(page, /Pelanggan <span className="text-red-500">\*<\/span>/);
  assert.match(page, /Kendaraan <span className="text-red-500">\*<\/span>/);
  assert.match(page, /kelompok tanggal dirapatkan ke kanan dengan urutan tanggal, edit, waktu/);
  assert.match(page, /lg:w-full lg:grid-cols-\[85px_minmax\(0,324px\)_minmax\(0,260px\)_minmax\(16px,1fr\)_64px_142px_132px\] lg:gap-x-1/);
  assert.match(page, /grid-cols-\[42px_82px\] justify-end gap-2 lg:col-start-7 lg:row-start-1 lg:grid/);
  assert.match(page, /data-wo-inline-actions className="hidden items-center justify-end gap-1\.5 lg:col-span-3 lg:col-start-5 lg:row-start-2 lg:flex"/);
  assert.doesNotMatch(page, /<span>Nomor: <strong className="text-gray-900">\{editingWO\?\.woNumber/);
  assert.doesNotMatch(page, /<span>Cabang: <strong className="text-gray-900">\{data\.branches\.find\(branch/);
  assert.match(page, /ariaLabel="Aksi Work Order"/);
  assert.match(page, /lg:pr-\[104px\]/);
  assert.match(page, /bottom-4 right-4 top-4/);
  assert.match(page, /\[&>button:first-child\]:mb-1\.5/);
  assert.match(page, /const openWorkOrderStandard = \(wo: WorkOrder\)/);
  assert.match(page, /const readOnly = !sameBranch \|\| !hasPermission\('wo:edit'\)/);
  assert.match(page, /handleOpenModal\(wo, true\)/);
  assert.match(page, /onClick=\{\(\) => openWorkOrderStandard\(wo\)\}/);
  assert.doesNotMatch(page, /EDIT PEKERJAAN \{editingWO\.woNumber\}/);
  assert.doesNotMatch(page, /Edit Registrasi WO/);
  assert.doesNotMatch(page, />\s*Edit Data Registrasi\s*</);
  assert.match(page, /bottom-4 right-4 top-4 z-50 hidden gap-1\.5 lg:flex \[&>button:first-child\]:mb-1\.5 \[&>div\]:mt-1\.5/);
  assert.match(page, /Terjadi Permasalahan pada Pemrosesan/);
  assert.match(page, /id="active-wo-conflict-title"/);
  assert.match(page, /max-w-\[520px\]/);
  assert.match(page, /grid-cols-\[76px_minmax\(0,1fr\)\]/);
  assert.match(page, /bg-\[#0b3265\]/);
  assert.match(page, /navigator\.clipboard\.writeText\(conflictSummary\)/);
  assert.match(page, /Lanjutkan di Cabang Ini/);
  assert.match(page, /activeWorkOrderActionLabel\(conflict, sameBranch\)/);
  assert.match(page, /Pelanggan harus diisi/);
  assert.match(page, /Boolean\(editingWO\.invoiceId\) \|\| \(statusLabel\(editingWO\.status\) === 'Lost Sales' && !customerVehicleCorrectionUnlocked\)/);
  assert.match(page, /AccurateFormActionRail/);
  assert.match(page, /title: 'Cetak \/ simpan sebagai'/);
  assert.match(page, /title: 'Lain-lain'/);
  assert.match(page, /Cetak Work Order/);
  assert.match(page, /Simpan sebagai PDF/);
  assert.doesNotMatch(page, /title: 'Pembayaran dan pilihan lainnya'/);
  assert.match(page, /lg:pr-\[104px\]/);
  assert.match(page, /form: 'work-order-entry-form'/);
  assert.match(page, /void handleSubmit\(\)/);
  assert.match(page, /setEditingWO\(created\);[\s\S]*?setIsAutoRegisteredDraft\(true\);[\s\S]*?setShowServiceForm\(true\)/);
  assert.match(page, /diagnosisMode && editingWO \? 'Diagnosa' : editingWO \? 'Rincian WO' : 'Data Baru'/);
  assert.match(page, /disabled=\{!editingWO \|\| !customerVehicleReady \|\| isAutoRegistering\}/);
  assert.match(page, /'Hapus Work Order'/);
  assert.match(page, /Hapus Baris/);
  assert.match(page, /<td colSpan=\{6\} className="h-48/);
  assert.match(page, /setSelectedServiceId\(service\.id\)/);
  assert.match(page, /Waktu WO desktop/);
  assert.match(page, /data-wo-inline-actions className="hidden items-center justify-end gap-1\.5 lg:col-span-3 lg:col-start-5 lg:row-start-2 lg:flex"/);
  assert.match(page, /Register WO terlebih dahulu/);
  assert.match(page, /ComplaintMultiSelect/);
  assert.match(page, /selectedAction=\{!customerVehicleLocked/);
  assert.match(page, /aria-label="Tambah kontak"/);
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
  assert.match(source('src/components/CustomerPicker.tsx'), /getSelectedCustomerLabel/);
  assert.match(source('src/components/CustomerPicker.tsx'), /customer\.phone\.trim\(\)/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), /border-blue-400 bg-blue-50 font-medium/);
  assert.match(source('src/components/CustomerPicker.tsx'), /app-locked-field cursor-default border-gray-400 bg-white font-normal text-gray-900/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), /border-blue-400 bg-blue-50 font-normal text-blue-900/);
  assert.doesNotMatch(source('src/components/CustomerPicker.tsx'), /Badge pelanggan terpilih/);
  assert.match(source('src/components/CustomerPicker.tsx'), /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(source('src/components/VehiclePicker.tsx'), /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(source('src/components/VehiclePicker.tsx'), /getSelectedVehicleLabel/);
  assert.doesNotMatch(source('src/components/VehiclePicker.tsx'), /border-orange-400 bg-orange-50 font-bold/);
  assert.match(source('src/components/VehiclePicker.tsx'), /app-locked-field cursor-default border-gray-400 bg-white font-normal text-gray-900/);
  assert.doesNotMatch(source('src/components/VehiclePicker.tsx'), /border-orange-400 bg-orange-50 font-normal text-orange-900/);
  assert.match(source('src/components/VehiclePicker.tsx'), /\.filter\(Boolean\)\.join\(' '\)/);
  assert.doesNotMatch(source('src/components/VehiclePicker.tsx'), /Badge kendaraan terpilih/);
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
  assert.match(styles, /\.app-locked-field:disabled[\s\S]*?background-color: #ffffff !important;[\s\S]*?color: #111827 !important;/);
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
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(workOrders, /useAccurateDocumentCanvas\(showModal\)/);
  assert.match(workOrders, /\$\{ui\.childBar\} \$\{showModal \? '!hidden lg:!flex' : ''\}/);
  assert.match(workOrders, /\$\{ui\.childBar\} !static !z-20 lg:!hidden/);
  assert.match(workOrders, /aria-label="Kembali ke daftar Order Kerja"/);
  assert.match(source('src/pages/SalesInvoice.tsx'), /useAccurateDocumentCanvas\(showModal\)/);
  assert.match(source('src/pages/ItemsAndServices.tsx'), /useAccurateDocumentCanvas\(showItemModal\)/);
  assert.match(complaints, /app-combobox-field/);
  assert.match(complaints, /app-field-unstyled/);
  assert.match(tabs, /border-r-white bg-white text-rose-500/);
  assert.match(tabs, /before:w-0\.5 before:bg-rose-500/);
});

test('tombol Proses WO tetap terpisah dari Simpan dan WO tidak menampilkan tombol Ambil', () => {
  const standards = source('src/components/ui/interfaceStandards.ts');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const invoices = source('src/pages/SalesInvoice.tsx');
  assert.match(standards, /documentAction: 'inline-flex h-9 w-\[104px\]/);
  assert.doesNotMatch(workOrders, />Ambil <span/);
  assert.match(workOrders, /disabled title="Register WO terlebih dahulu" className=\{ui\.documentAction\}>Proses/);
  assert.match(workOrders, /data-wo-mobile-process/);
  assert.match(workOrders, /data-wo-status-lamp/);
  assert.match(workOrders, /data-wo-mobile-status-lamp/);
  assert.match(workOrders, /const statusLampColors: Record<string, string>/);
  assert.match(workOrders, /editingWO\.status === 'Closed'[\s\S]*?Tindak Lanjut Lost Sales/);
  assert.match(invoices, /disabled title="Simpan faktur terlebih dahulu" className=\{ui\.documentAction\}>Proses/);
  assert.ok((workOrders.match(/ui\.documentAction/g) || []).length >= 2);
  assert.ok((invoices.match(/ui\.documentAction/g) || []).length >= 4);
  assert.match(workOrders, /data-wo-inline-actions className="hidden items-center justify-end gap-1\.5 lg:col-span-3 lg:col-start-5 lg:row-start-2 lg:flex"/);
});

test('kanvas rincian WO memakai tabel kontras dan ringkasan total bergaya Accurate', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(workOrders, /work-order-entry-form[^>]*lg:bg-\[var\(--app-canvas\)\]/);
  assert.match(workOrders, /data-wo-document-shell/);
  assert.match(workOrders, /relative min-h-0 bg-white sm:min-h-\[320px\] lg:ml-10 lg:border lg:border-gray-400 lg:bg-white lg:shadow-/);
  assert.match(workOrders, /data-wo-items-table/);
  assert.match(workOrders, /const \[showQuickServices, setShowQuickServices\] = useState\(false\)/);
  assert.doesNotMatch(workOrders, /dokterac_wo_quick_services/);
  assert.match(workOrders, /const handleOpenModal = \(wo\?: WorkOrder, servicesOnly = false, viewOnly = false\) => \{\s+setShowQuickServices\(false\)/);
  assert.match(workOrders, /lg:min-h-\[calc\(100dvh-520px\)\]/);
  assert.match(workOrders, /min-height:820px/);
  assert.match(workOrders, /border-gray-400 bg-white shadow-\[0_2px_7px_rgba\(15,23,42,0\.18\)\]/);
  assert.match(workOrders, /data-wo-total-summary/);
  assert.match(workOrders, /mt-2 hidden w-full max-w-\[700px\]/);
  assert.doesNotMatch(workOrders, /lg:fixed lg:bottom-3 lg:right-\[120px\] lg:z-30/);
  assert.match(workOrders, />Sub Total</);
  assert.match(workOrders, />Diskon</);
  assert.match(workOrders, />Total</);
  assert.match(workOrders, /Rp \{totalServices\.toLocaleString\('id-ID'\)\}/);
});

test('tab samping WO menyatu satu piksel dengan lembar dokumen putih', () => {
  const tabs = source('src/components/AccurateDocumentSideTabs.tsx');
  assert.match(tabs, /lg:absolute lg:right-full lg:top-0/);
  assert.match(tabs, /lg:bg-transparent/);
  assert.match(tabs, /border-r-white bg-white/);
  assert.match(tabs, /lg:-mr-px/);
});

test('kanvas WO saat baru, dibuka, dan diedit selalu mulai dari tampilan baku Rincian', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(workOrders, /const DEFAULT_WORK_ORDER_DOCUMENT_TAB: AccurateDocumentTab = 'details'/);
  assert.match(workOrders, /useState<AccurateDocumentTab>\(DEFAULT_WORK_ORDER_DOCUMENT_TAB\)/);
  assert.match(workOrders, /const handleOpenModal = \(wo\?: WorkOrder, servicesOnly = false, viewOnly = false\) => \{\s+setShowQuickServices\(false\);\s+setDocumentTab\(DEFAULT_WORK_ORDER_DOCUMENT_TAB\);/);
  assert.ok((workOrders.match(/setDocumentTab\(DEFAULT_WORK_ORDER_DOCUMENT_TAB\)/g) || []).length >= 2);
  assert.doesNotMatch(workOrders, /Pelanggan dan kendaraan sudah teregister/);
  assert.doesNotMatch(workOrders, /Pekerjaan \/ Layanan WO/);
  assert.match(workOrders, />Koreksi Customer\/Kendaraan</);
});

test('panel Favorit WO langsung tertutup saat kehilangan fokus', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(workOrders, /const quickServicesRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(workOrders, /document\.addEventListener\('pointerdown', closeWhenFocusLeaves\)/);
  assert.match(workOrders, /document\.addEventListener\('focusin', closeWhenFocusLeaves\)/);
  assert.match(workOrders, /event\.key === 'Escape'/);
  assert.match(workOrders, /<div ref=\{quickServicesRef\} className="relative z-20 mb-3 sm:mb-4">/);
});

test('WO tanpa layanan tetap menampilkan tabel rincian penuh dan panel total', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.doesNotMatch(workOrders, /formData\.services\.length > 0 \|\| !editingWO \? \(/);
  assert.match(workOrders, /data-wo-items-table/);
  assert.match(workOrders, /Belum ada layanan atau barang\./);
  assert.match(workOrders, /data-wo-total-summary/);
});

test('tampilan WO kembali ke kanvas 4d59431 tanpa mengubah alur transaksi', () => {
  const workOrders = source('src/pages/WorkOrders.tsx');
  assert.match(workOrders, /showModal && \(/);
  assert.match(workOrders, /<thead className="bg-\[var\(--app-table-head\)\] text-xs uppercase text-white">/);
  assert.match(workOrders, /diagnosisMode && editingWO \? \(\s*<div className="space-y-3">/);
  assert.doesNotMatch(workOrders, /formData\.services\.length > 0 \|\| !editingWO \?/);
  assert.match(workOrders, /data-wo-items-table/);
  assert.doesNotMatch(workOrders, /editingWO && !isAutoRegisteredDraft \? 'mb-3'/);
  assert.match(workOrders, /editingWO && diagnosisMode && <div className="grid items-stretch justify-end gap-3/);
  assert.match(workOrders, /documentTab === 'info'/);
  assert.match(workOrders, /documentTab === 'payment'/);
});

test('daftar WO selalu menampilkan nama cabang pada desktop dan HP', () => {
  const page = source('src/pages/WorkOrders.tsx');
  assert.match(page, /label: 'No\. WO \/ Status \/ Cabang'/);
  assert.match(page, /<span className="mt-0\.5 block text-xs font-semibold text-gray-500">\{data\.branches\.find\(b => b\.id === wo\.branchId\)\?\.name\.replace\('CABANG ', ''\) \|\| wo\.branchId\}<\/span>/);
  assert.doesNotMatch(page, /wo\.transactionTime \? wo\.transactionTime\.slice\(0, 5\) : '—'\} · \{data\.branches\.find/);
  assert.match(page, /const branchName = data\.branches\.find\(branch => branch\.id === wo\.branchId\)\?\.name\.replace\('CABANG ', ''\) \|\| wo\.branchId;/);
  assert.match(page, /<span className="text-\[10px\] font-semibold text-gray-400">\{branchName\}<\/span>/);
  assert.doesNotMatch(page, /\{canViewAllBranches && \(isAllBranchDropdown \|\| !activeBranchOnly\) && \(\s*<> ·/);
  assert.doesNotMatch(page, /\{canViewAllBranches && <span className="text-\[10px\] font-semibold text-gray-400">\{branchName\}/);
});

test('seluruh notifikasi dan konfirmasi WO memakai modal Accurate, bukan dialog bawaan browser', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const dialog = source('src/components/AccurateNotificationDialog.tsx');
  assert.doesNotMatch(page, /window\.(alert|confirm|prompt)\s*\(/);
  assert.match(page, /const showAccurateNotice = \(message: string/);
  assert.match(page, /const askAccurateConfirmation = \(options:/);
  assert.match(page, /const askAccurateText = \(options:/);
  assert.match(page, /const requestCloseEditor = async \(\): Promise<boolean> =>/);
  assert.match(page, /title: editingWO \? `Tutup \$\{editingWO\.woNumber\}` : 'Tutup Data Baru'/);
  assert.match(page, /message: editingWO[\s\S]*?: 'Data yang belum disimpan akan hilang\. Tutup Data Baru sekarang\?',[\s\S]*?confirmLabel: 'Tutup',[\s\S]*?cancelLabel: 'Batal'/);
  assert.match(page, /setDeleteDialogWO\(wo\)/);
  assert.match(page, /const confirmDeleteWorkOrder = async \(\) =>/);
  assert.match(page, /title="Konfirmasi Penghapusan"[\s\S]*?confirmLabel="Hapus"[\s\S]*?cancelLabel="Batal"/);
  assert.match(page, /title=\{deleteNotice\?\.title \|\| 'Terjadi Permasalahan pada Pemrosesan'\}/);
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /bg-\[#0d3264\]/);
  assert.match(dialog, /inputLabel && onInputChange/);
  assert.match(dialog, /busy \? 'Memproses…' : confirmLabel/);
});

test('Semua Cabang menampilkan seluruh WO yang sudah dibatasi oleh server', () => {
  const page = source('src/pages/WorkOrders.tsx');
  assert.match(page, /const branchScopedWorkOrders = useMemo/);
  assert.match(page, /isAllBranchDropdown\s*\? data\.workOrders\s*:\s*data\.workOrders\.filter/);
  assert.match(page, /buildWorkOrderAttentionItems\(\s*branchScopedWorkOrders/);
  assert.match(page, /return branchScopedWorkOrders\s*\.filter/);
  assert.doesNotMatch(page, /activeBranchIds\.includes\(wo\.branchId\)/);
  assert.doesNotMatch(page, /activeBranchIds\.includes\(workOrder\.branchId\)/);
});

test('sortir WO tersimpan tidak memakai statusLabel sebelum diinisialisasi', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const initialization = page.indexOf('const statusLabel = workOrderStatusLabel;');
  const desktopSorting = page.indexOf('const desktopWOs = useMemo');
  assert.ok(initialization >= 0);
  assert.ok(desktopSorting >= 0);
  assert.ok(initialization < desktopSorting);
  assert.equal(page.indexOf('const statusLabel = workOrderStatusLabel;', initialization + 1), -1);
});

test('data awal WO yang belum lengkap tampil sebagai arahan dan memfokuskan field pertama', () => {
  const page = source('src/pages/WorkOrders.tsx');
  assert.match(page, /WO_ENTRY_GUIDANCE_ISSUES/);
  assert.match(page, /entryGuidanceOnly/);
  assert.match(page, /Lengkapi Data Servis/);
  assert.match(page, /Pilih Pelanggan/);
  assert.match(page, /Pilih Kendaraan/);
  assert.match(page, /Isi Keluhan Pelanggan/);
  assert.match(page, /Tutup/);
  assert.match(page, /document\.querySelector<HTMLElement>\(selector\)\?\.focus\(\)/);
  assert.match(page, /processingIssues\.length > 0 && !entryGuidanceOnly/);
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
  const workOrders = source('src/pages/WorkOrders.tsx');

  assert.match(page, /showWOPicker\s*&&\s*\([\s\S]*?ui\.childTabActive[\s\S]*?'Data Baru'/);
  assert.match(page, /aria-label="Data Baru Faktur dari Order Kerja"/);
  assert.match(page, /showWOPicker \? 'hidden' : showModal \|\| viewingInvoice \? 'lg:hidden'/);
  assert.doesNotMatch(page, /showWOPicker\s*&&\s*\(\s*<div className="fixed inset-0 bg-black\/50/);
  assert.match(page, /createInvoiceFromWO\([\s\S]*?woDraftItems[\s\S]*?normalizedManualReceiptNumber/);
  assert.match(workOrders, /window\.location\.assign\(`\/invoices\?woId=\$\{encodeURIComponent\(wo\.id\)\}`\)/);
  assert.doesNotMatch(workOrders, /const handleOpenInvoiceModal[\s\S]*?setInvoiceWO\(wo\)[\s\S]*?\n\s*};/);
});

test('form Faktur Penjualan mengikuti kerangka padat Data Baru Order Kerja', () => {
  const page = source('src/pages/SalesInvoice.tsx');

  assert.match(page, /<AccurateFormActionRail/);
  assert.match(page, /ariaLabel="Aksi Faktur Penjualan"/);
  assert.match(page, /lg:grid-cols-\[120px_minmax\(0,1fr\)_minmax\(0,\.8fr\)_82px_190px_44px\]/);
  assert.match(page, />Pelanggan <span className="ml-1 text-red-500">\*<\/span>/);
  assert.match(page, />No\. Nota Fisik<\/label>/);
  assert.match(page, /className="flex justify-end gap-1 lg:col-span-2"/);
  assert.match(page, /<AccurateDocumentSideTabs active=\{invoiceDocumentTab\}/);
  assert.match(page, /ariaLabel="Bagian dokumen Faktur Penjualan"/);
  assert.match(page, /data-invoice-document-shell/);
  assert.match(page, /data-invoice-items-table/);
  assert.match(page, /data-invoice-total-summary/);
  assert.match(page, /bg-\[var\(--app-table-head\)\]/);
  assert.match(page, /setSelectedFormItemId\(item\.id\)/);
  assert.match(page, /lg:pr-\[104px\]/);
  assert.doesNotMatch(page, /aria-label="Tab rincian Faktur Penjualan"/);
  assert.doesNotMatch(page, /order-first mr-auto flex flex-wrap gap-x-5/);
});

test('detail Faktur Penjualan mengikuti kanvas dokumen dan tab samping baku WO', () => {
  const page = source('src/pages/SalesInvoice.tsx');

  assert.match(page, /data-invoice-view-document-shell/);
  assert.match(page, /data-invoice-view-identity/);
  assert.match(page, /data-invoice-view-items/);
  assert.match(page, /data-invoice-view-total-summary/);
  assert.match(page, /ariaLabel="Bagian detail Faktur Penjualan"/);
  assert.match(page, /lg:ml-10 lg:border lg:border-gray-400/);
  assert.match(page, /app-locked-field flex h-9 min-w-0 items-center rounded border border-gray-500 bg-white/);
  assert.match(page, /invoiceDocumentTab === 'details'/);
  assert.match(page, /invoiceDocumentTab === 'payment'/);
  assert.match(page, /if \(viewingInvoice\?\.id\) setInvoiceDocumentTab\('details'\)/);
});

test('lonceng, filter, dan kolom Perhatian memakai aturan tindak lanjut WO yang sama', () => {
  const rules = source('src/lib/workOrderAttention.ts');
  const layout = source('src/components/Layout.tsx');
  const mobileDashboard = source('src/components/MobileDashboard.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const help = source('src/data/helpArticles.ts');

  assert.match(rules, /Register Mengambang/);
  assert.match(rules, /Dikerjakan Terlambat/);
  assert.match(rules, /Selesai Belum Faktur/);
  assert.match(rules, /Faktur Belum Lunas/);
  assert.match(rules, /workOrder\.status === 'Register' && workOrder\.date < today/);
  assert.match(rules, /invoice\.payment < invoice\.total/);
  assert.match(layout, /buildWorkOrderAttentionItems/);
  assert.match(layout, /aria-label=\{`Notifikasi, \$\{workOrderAttentionItems\.length\} perlu tindakan`\}/);
  assert.match(layout, /navigateWithEditorGuard\('\/workorders\?attention=1'\)/);
  assert.match(mobileDashboard, /buildWorkOrderAttentionItems/);
  assert.match(mobileDashboard, /aria-label=\{`Notifikasi, \$\{attentionItems\.length\} perlu tindakan`\}/);
  assert.match(mobileDashboard, /navigate\('\/workorders\?attention=1'\)/);
  assert.match(mobileDashboard, /Register Mengambang/);
  assert.doesNotMatch(mobileDashboard, /right-2 top-2 h-2 w-2 rounded-full bg-red-500/);
  assert.match(workOrders, /Aktif — Register &amp; Dikerjakan/);
  assert.match(workOrders, /Nonaktif — Selesai &amp; Lost Sales/);
  assert.match(workOrders, /<option value="attention">Butuh Tindakan<\/option>/);
  assert.match(workOrders, /<option value="overdue">Terlambat \/ Kritis<\/option>/);
  assert.match(workOrders, /key: 'attention', label: 'Perhatian', locked: true/);
  assert.doesNotMatch(workOrders, /key: 'status', label: 'Status'/);
  assert.match(workOrders, /key: 'number', label: 'No\. WO \/ Status \/ Cabang'/);
  assert.match(workOrders, /key: 'date', label: 'Tanggal'/);
  assert.match(workOrders, /formatBusinessDate\(wo\.date\)/);
  assert.doesNotMatch(workOrders, />No\. WO \/ Status \/ Tanggal</);
  assert.match(workOrders, /CircleAlert className="h-5 w-5"/);
  assert.match(workOrders, /AlertTriangle className="h-5 w-5"/);
  assert.match(workOrders, /key: 'customer', label: 'Pelanggan \/ Kendaraan'/);
  assert.match(workOrders, /const WorkOrderCustomerVehicleIdentity/);
  assert.match(workOrders, /customerName=\{customerIdentityForWO\(wo\)\.title\}[\s\S]*?plateNumber=\{wo\.plateNumber\}/);
  assert.match(workOrders, /formatPlateNumber\(plateNumber\)/);
  assert.match(workOrders, /const WorkOrderEstimateAmount/);
  assert.match(workOrders, /line-through decoration-gray-400 decoration-1/);
  assert.match(workOrders, />Estimasi Lost Sales</);
  assert.match(workOrders, /<WorkOrderEstimateAmount amount=\{wo\.total\} isLostSales=\{statusLabel\(wo\.status\) === 'Lost Sales'\}/);
  assert.doesNotMatch(workOrders, /listMode === 'attention'/);
  assert.match(help, /Register hanya antrean sementara pada hari transaksi/);
});

test('status Lunas selalu direkonsiliasi dari ledger pembayaran pelanggan', () => {
  const helpers = source('api/helpers.php');
  const invoices = source('api/endpoints/sales-invoices.php');
  const allData = source('api/endpoints/all-data.php');
  const payments = source('api/endpoints/customer-payments.php');

  assert.match(helpers, /function reconcileCustomerPaymentLedger\(PDO \$pdo\): void/);
  assert.match(helpers, /NOT EXISTS \(SELECT 1 FROM customer_payments existing WHERE existing\.invoice_id=i\.id\)/);
  assert.match(helpers, /COALESCE\(SUM\(amount\),0\) paid/);
  assert.match(helpers, /i\.status=CASE WHEN COALESCE\(ledger\.paid,0\)>=i\.total/);
  assert.match(invoices, /reconcileCustomerPaymentLedger\(\$pdo\)/);
  assert.match(allData, /reconcileCustomerPaymentLedger\(\$pdo\)/);
  assert.match(payments, /reconcileCustomerPaymentLedger\(\$pdo\)/);
  assert.doesNotMatch(invoices, /max\(\$recordedPayment,\(float\)\$current\['payment'\]\)/);
  assert.match(invoices, /\$recordInitialCustomerPayment\([\s\S]*?\$cashPayment,'Tunai'/);
  assert.match(invoices, /\$recordInitialCustomerPayment\([\s\S]*?\$transferPayment,'Transfer'/);
});

test('Closed dan status lama selalu memakai label baku Lost Sales', () => {
  const status = source('src/lib/workOrderStatus.ts');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const timeline = source('src/pages/WorkOrderTimeline.tsx');
  const report = source('src/pages/WorkOrderReport.tsx');
  const assistant = source('src/pages/AIAssistant.tsx');

  assert.match(status, /status === 'Closed' \|\| status === 'Batal'\) return 'Lost Sales'/);
  assert.match(workOrders, /const statusLabel = workOrderStatusLabel/);
  assert.match(timeline, /label: workOrderStatusLabel\('Closed'\)/);
  assert.match(report, /const statusLabel = workOrderStatusLabel/);
  assert.match(assistant, /const woStatusLabel = workOrderStatusLabel/);
  assert.doesNotMatch(timeline, /Lost Sales \/ Batal/);
  assert.doesNotMatch(assistant, /\$\{w\.status\}/);
  assert.match(status, /status === 'Open' \|\| status === 'Terbuka'\) return 'Register'/);
});

test('semua jalur buka WO memakai form Data Baru sebagai kanvas baku', () => {
  const page = source('src/pages/WorkOrders.tsx');

  assert.match(page, /const openWorkOrderStandard = \(wo: WorkOrder\) => \{[\s\S]*?handleOpenModal\(wo, true, readOnly\)/);
  assert.doesNotMatch(page, /const openWorkOrderStandard = \(wo: WorkOrder\) => \{[\s\S]*?if \(readOnly\) \{\s*openDetailTab\(wo\)/);
  assert.match(page, /workOrderViewOnly \|\| \(editingWO/);
  assert.match(page, />Pembayaran \/ Saldo<\/button>/);
});

test('modul WO dikunci pada kontrak tampilan kanvas baku', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const tabs = source('src/components/AccurateDocumentSideTabs.tsx');
  const rail = source('src/components/AccurateFormActionRail.tsx');

  assert.match(page, /const WORK_ORDER_UI_STANDARD_VERSION = 'wo-canonical-2026-08-29'/);
  assert.match(page, /data-wo-ui-standard=\{WORK_ORDER_UI_STANDARD_VERSION\}/);
  assert.match(page, /const DEFAULT_WORK_ORDER_DOCUMENT_TAB: AccurateDocumentTab = 'details'/);
  assert.match(page, /const \[showQuickServices, setShowQuickServices\] = useState\(false\)/);
  assert.match(page, /data-wo-document-shell/);
  assert.match(page, /data-wo-items-table/);
  assert.match(page, /data-wo-total-summary/);
  assert.match(page, /data-wo-inline-actions/);
  assert.match(page, /AccurateFormActionRail/);
  assert.match(page, /AccurateDocumentSideTabs active=\{documentTab\}/);
  assert.match(tabs, /lg:absolute lg:right-full lg:top-0/);
  assert.match(rail, /aria-label=\{ariaLabel\}/);
});

test('Info lainnya WO memisahkan catatan dan audit, mengunci faktur, serta memakai ledger pembayaran', () => {
  const types = source('src/types/index.ts');
  const page = source('src/pages/WorkOrders.tsx');
  const context = source('src/context/AppContext.tsx');
  const endpoint = source('api/endpoints/work-orders.php');
  const helpers = source('api/helpers.php');
  const allData = source('api/endpoints/all-data.php');
  const schema = source('database/dokterac_schema.sql');

  assert.match(types, /complaintComment\?: string/);
  assert.match(types, /assistantTechnicianIds\?: string\[\]/);
  assert.match(page, />Teknisi Utama/);
  assert.match(page, />Teknisi Pendamping/);
  assert.match(page, /const assignedAssistantTechnicians = formData\.assistantTechnicianIds\.map/);
  assert.match(page, /Pilih teknisi pendamping/);
  assert.match(page, /Penugasan lama/);
  assert.match(page, />Komentar \/ Diagnosis Keluhan/);
  assert.match(page, />Hasil Kerja/);
  assert.match(page, /Tidak tampil sebagai Hasil Kerja dan tidak dapat menggantikan bukti penyelesaian/);
  assert.match(page, /setWorkResultText\(wo\.findings \|\| ''\)/);
  assert.doesNotMatch(page, /setWorkResultText\(wo\.findings \|\| wo\.notes/);
  assert.match(context, /const hasCompletionNote = Boolean\(wo\.findings\?\.trim\(\)\)/);
  assert.doesNotMatch(context, /hasCompletionNote[^;]*wo\.notes/);
  assert.match(page, /formData\.complaintComment \|\| formData\.notes \|\| formData\.findings/);
  assert.match(page, /formData\.technicianId \|\| formData\.assistantTechnicianIds\.length > 0/);
  assert.match(page, /documentTab === 'payment'/);
  assert.match(page, /documentTab === 'payment' \|\| documentTab === 'info'/);
  assert.match(page, /work-orders\/\$\{timelineTarget\.id\}\/timeline/);
  assert.match(page, /financialTimeline\.payments\.map/);
  assert.match(page, />Informasi Faktur</);
  assert.match(page, />Riwayat Pembayaran</);
  assert.match(page, /\['Uang Muka', 'Rp 0'/);
  assert.match(page, /\['Retur', 'Rp 0'/);
  assert.match(page, /aria-label="Faktur lunas"/);
  assert.match(page, /data-wo-payment-pane/);
  assert.match(page, /data-wo-payment-summary/);
  assert.match(page, /data-wo-payment-last-row/);
  assert.match(page, /data-wo-payment-history className="relative z-10 max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1"/);
  const styles = source('src/index.css');
  assert.match(styles, /@media \(min-width: 1024px\) and \(max-height: 900px\)[\s\S]*?\[data-wo-payment-summary\][\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1024px\) and \(max-height: 700px\)[\s\S]*?\[data-wo-payment-pane\][\s\S]*?overflow-y: auto/);
  assert.match(page, />Timeline WO</);
  assert.match(page, /const timelineEvents = workOrderAuditTimeline\(editingWO\)/);
  assert.match(page, /Timeline tersedia setelah WO diregister/);
  assert.match(page, /data-wo-info-panel/);
  assert.match(page, /data-wo-technician-panel/);
  assert.match(page, /data-wo-work-notes/);
  assert.match(page, /data-wo-audit-panel/);
  assert.match(page, /setInfoMobilePane\('notes'\)/);
  assert.match(page, /setInfoMobilePane\('timeline'\)/);
  assert.match(page, /aria-pressed=\{infoMobilePane === 'notes'\}/);
  assert.match(page, /aria-pressed=\{infoMobilePane === 'timeline'\}/);
  assert.match(page, /const infoPanelLocked = workOrderViewOnly \|\| infoPanelInvoiceLocked/);
  assert.match(page, /disabled=\{infoPanelLocked\}/);
  assert.match(page, /data-wo-mobile-save[\s\S]*?disabled=\{infoPanelLocked\s*\|\|/);
  assert.match(page, /timelineStageFromReason\(log\.reason \|\| ''\)/);
  assert.match(page, /const isInitialDiagnosis = operationalStage === 'diagnosis' && \/\^WO diregister/);
  assert.match(page, /title: isInitialDiagnosis \? 'Diagnosa dimulai' : stage\.title/);
  assert.match(page, /Faktur \$\{invoice\.invoiceNumber\} dibuat/);
  assert.match(page, /Tanggal faktur \$\{formatBusinessDate\(invoice\.date\)\} · Total Rp \$\{Number\(invoice\.total\)\.toLocaleString\('id-ID'\)\}/);
  assert.doesNotMatch(page, /Total Rp \$\{Number\(invoice\.total\)\.toLocaleString\('id-ID'\)\} · \$\{invoice\.status\}/);
  assert.match(page, /customer-payments\?invoiceId=/);
  assert.doesNotMatch(page, /Pembayaran dikelola melalui faktur penjualan terkait/);
  assert.match(endpoint, /work_order_technicians/);
  assert.match(endpoint, /Teknisi utama wajib dipilih/);
  assert.match(endpoint, /\$hasCompletionNote = trim\(\(string\)\(\$d\['findings'\]/);
  assert.doesNotMatch(endpoint, /\$hasCompletionNote = [^;]*\$d\['notes'\]/);
  assert.match(allData, /assistantTechnicianIds/);
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS work_order_technicians/);
  assert.match(schema, /`complaint_comment` TEXT/);
});
