# Audit Accurate Online vs CerdikApp — Persediaan

**Waktu audit:** 2026-09-05 09:16 +0800  
**Repository:** `feat/historical-stock-opname`  
**Snapshot source yang dibandingkan:** `e4752e03141163a2c4cad81c1ec1a615937a6227`  
**Status audit:** live inspection non-destruktif + triangulasi source code. Tidak ada transaksi Accurate yang disimpan, diposting, dibatalkan, atau dihapus.

## Kesimpulan eksekutif

CerdikApp sudah mempunyai fondasi operasional bengkel yang lebih tepat daripada Accurate pada hubungan WO–kendaraan–teknisi–cabang–gudang serta desain Stok Opname historis. Namun CerdikApp belum aman menggantikan Accurate sepenuhnya karena inventory valuation/HPP, purchasing lifecycle, retur, period close, accounting subledger, audit trail, serta rekonsiliasi kuantitas dan nilai belum setara atau belum terbukti.

Historical Stok Opname CerdikApp secara fungsional lebih kaya daripada form Accurate yang terlihat: mendukung rentang tanggal, In/Out/Stok, kategori, petugas, barang stok nol yang bergerak, barang nol tidak pernah dipakai, dan penambahan manual. Tetapi snapshot staged saat audit masih ditolak reviewer independen; jangan ship sebelum blocker integritas, otorisasi, exact quantity, transfer history, migration/rollback, dan MySQL 5.7 selesai.

## Bukti live Accurate Online

### Persediaan

Menu transaksi:

- Permintaan Barang
- Pemindahan Barang
- Penyesuaian Persediaan
- Pekerjaan Pesanan
- Penambahan Bahan Baku
- Penyelesaian Pesanan
- Perintah Stok Opname
- Hasil Stok Opname

Master:

- Barang & Jasa
- Gudang
- Satuan Barang
- Kategori Barang
- Merek Barang

Laporan cepat:

- Pemenuhan Pesanan
- Barang per Gudang
- Barang Stok Minimum

### Stok Opname

Accurate memakai dua dokumen: **Perintah Stok Opname → Hasil Stok Opname**.

Perintah yang terlihat menyimpan tanggal SPK/mulai, nomor SPK, penanggung jawab, petugas, gudang, kategori, pemasok, merek, keterangan, dan lampiran. Hasil menyimpan tanggal opname, referensi perintah, item, kuantitas, dan satuan. Daftar Perintah memiliki filter tanggal, status, pencarian, cetak, dan pengaturan kolom.

Pada layar utama Accurate tidak terlihat rentang tanggal movement, In/Out/Stok/Selisih, include-zero-unused, atau manual-row exception seperti rancangan CerdikApp.

### Pemindahan dan Penyesuaian

Pemindahan memiliki Proses (default terlihat “Kirim Barang”), gudang asal, gudang tujuan, tanggal, nomor form, item, quantity, satuan, dan keterangan. Penyesuaian menampilkan quantity sekaligus **Total Rupiah**, membuktikan dampak valuation.

### Barang per Gudang dan stok minimum

Barang per Gudang menerima barang + tanggal dan menampilkan gudang, kuantitas multi-satuan, stok dapat dijual, dan alamat gudang.

Barang Stok Minimum menggabungkan pemasok, gudang, stok tersedia, dipesan, diminta, batas minimum, serta aksi Pesan/Minta.

### Master Barang

Tab yang terlihat: Umum, Penjualan/Pembelian, Stok, Akun, Gambar, Lain-lain.

- Umum: jenis barang, SKU, barcode/UPC, satuan, kategori, merek, nomor seri/produksi.
- Penjualan/Pembelian: harga jual/beli, diskon, minimum jual/beli, grosir, substitusi, pemasok utama, minimum stok, pajak.
- Stok: saldo awal bertanggal per gudang dengan quantity, satuan, biaya satuan; ringkasan quantity, nilai satuan, dan beban pokok.
- Akun: Persediaan, Penjualan, Retur Penjualan, Diskon Penjualan, Barang Terkirim, Beban Pokok Penjualan, Retur Pembelian, dan akun terkait lain.

### Pembelian dan Penjualan

Pembelian terverifikasi sebagai:

`Pesanan Pembelian → Penerimaan Barang → Faktur Pembelian → Pembayaran Pembelian → Retur Pembelian`, ditambah uang muka, harga pemasok, perintah pembayaran, dan transfer pemasok.

Penerimaan menyimpan pemasok, tanggal, nomor terima eksternal, nomor form internal, item dan quantity; aksi **Ambil** menarik Pesanan dan tombol **Faktur** melanjutkan ke invoice.

Penjualan terverifikasi sebagai:

`Penawaran → Pesanan Penjualan → Pengiriman Pesanan → Faktur Penjualan → Penerimaan Penjualan → Retur Penjualan`, ditambah uang muka, diskon, komisi, target, dan kanal e-commerce.

Accurate memisahkan Pengiriman dari Faktur. CerdikApp perlu menetapkan satu authoritative stock-decrement event agar WO usage, pengiriman, dan invoice tidak mengurangi stok ganda.

### Laporan

Kategori Persediaan berisi:

- Nilai Persediaan dan Rincian Nilai Persediaan/CSV
- Ketersediaan dan Rincian Ketersediaan Stok Penjualan
- Umur dan Rincian Umur Persediaan
- Kartu Stok Persediaan
- laporan permintaan barang

Kartu Stok mendukung rentang tanggal, item, dan filter/kolom tambahan termasuk kategori. Kategori Pembelian memiliki Histori Proses Pembelian yang menelusuri workflow dari permintaan sampai pembayaran.

### Audit/otorisasi

Menu Pengaturan menyediakan Preferensi, Akses Grup, Pengguna, Penomoran, dan Desain Cetakan. Detail matriks Akses Grup dan penguncian periode tidak berhasil dibuka secara aman, sehingga statusnya **belum terverifikasi langsung**.

Satu Penerimaan selesai tampil read-only dengan Simpan nonaktif, namun tombol hapus terlihat untuk akun yang sedang dipakai; lampiran dan komentar tersedia. Perilaku pembatalan/reversal setelah hapus tidak diuji.

## Implementation truth CerdikApp

### Sudah kuat

1. Historical Stok Opname menyimpan `startDate`, `endDate`, gudang, cabang, kategori, petugas, `includeZeroUnused`, snapshot In/Out/Stok, manual row, variance, dan linked adjustment (`src/pages/StockCountSheetReport.tsx`, `api/endpoints/stock-opnames.php`).
2. Transfer mempunyai lifecycle Draft/Kirim/Terima sebagian/Terima/Batal dan melakukan branch/warehouse locking (`api/endpoints/warehouse-transfers.php`).
3. Receipt memiliki source Supplier/Transfer, partial invoicing, correction/reversal, dan stock ledger (`api/endpoints/goods-receipts.php`).
4. Purchase invoice menghubungkan receipt → invoice → payment, mencegah over-invoice dan overpayment (`api/endpoints/purchase-invoices.php`).
5. Warehouse stock memiliki `reserved_quantity`; branch stock memiliki `sellable_stock`; stock movement memiliki effective/recorded time, reference, reversal, correction group, and `unit_cost` (`api/helpers.php`, `api/endpoints/stock-movements.php`).
6. Ada endpoint rekonsiliasi quantity warehouse balance versus stock ledger (`api/endpoints/stock-movements.php:13-26`).

### Gap terverifikasi

| Area | Accurate | CerdikApp | Risiko | Prioritas |
|---|---|---|---|---|
| Valuation/HPP | Unit cost, nilai persediaan, beban pokok, akun per item | Laporan memakai `qty × purchasePrice`, bukan layer costing historis; `unit_cost` belum menjadi authoritative valuation ledger | HPP, margin, aset persediaan salah setelah harga berubah/backdate | P0 |
| Accounting subledger | Pemetaan akun item dan jurnal operasional | Belum ditemukan journal posting/reconciliation persediaan→GL setara | Tidak dapat menggantikan Accurate secara finansial | P0 |
| Integritas snapshot staged | Kontrol mature benchmark | Review exact hash masih `passed:false` | Salah histori, authorization, coercion, rollback | P0 |
| Period close/backdate | Accurate mempunyai area preferensi; detail lock belum terverifikasi | Backdate ada pada beberapa alur, tetapi unified period lock inventory/accounting belum ditemukan | Laporan periode lama bisa berubah | P0 |
| Transfer history | Send/receive terpisah | Known counterexample dapat menghitung pasangan transfer dua kali pada historical stock | Stok tanggal mundur salah | P0 |
| Purchasing | PR/PO/receipt/invoice/payment/return lengkap | Receipt/invoice/payment ada; PR/PO dan purchase return end-to-end tidak ditemukan | Overbuy, retur supplier, outstanding order tidak terkendali | P1 |
| Returns | Purchase dan sales return eksplisit | Return lifecycle/UI/report belum ditemukan setara | Koreksi stok/utang/piutang tidak auditable | P1 |
| Available stock | Fisik, dipesan, diminta, dapat dijual | Field reserved/sellable ada tetapi InventoryReport hanya quantity | Teknisi/CS dapat menjanjikan stok yang sudah dialokasikan | P1 |
| Replenishment | Minimum, requested, ordered, supplier, Pesan/Minta | Menu “Stok Minimum” hanya menuju master item; workflow replenishment tidak ditemukan | Stockout dan pembelian reaktif | P1 |
| Inventory reports | Value, detail, CSV, availability, aging, stock card | InventoryReport dasar dan stock-movement endpoint; aging/cost layer belum ditemukan | Rekonsiliasi dan keputusan pembelian lemah | P1 |
| Audit trail | Lampiran/komentar; activity behavior belum selesai diuji | Ledger references ada, tetapi generic immutable business audit trail belum ditemukan untuk semua stock docs | Sulit menjawab siapa/mengapa koreksi terjadi | P1 |
| Menu truth | Menu menuju modul yang tepat | “Kartu Stok” menuju `/warehouses`; “Stok Minimum” menuju `/items` | User mengira fitur ada padahal route salah/placeholder | P2 |
| Multi-unit/serial | Multi-satuan dan nomor seri/produksi terlihat | Item unit tunggal dominan; serial/batch/expiry belum ditemukan | Traceability part tertentu terbatas | P2 |

## Prioritized roadmap

### P0 — sebelum produksi/cutover

1. Selesaikan seluruh blocker review hash staged saat ini dengan TDD dan dua reviewer `passed:true` pada hash baru.
2. Bangun authoritative inventory valuation ledger:
   - costing method dipilih dan terdokumentasi;
   - tiap movement menyimpan quantity, unit cost, value, effective time, recorded time;
   - receipt/correction/return/backdate memperbarui layers deterministik;
   - laporan quantity dan value direkonsiliasi terpisah.
3. Tentukan authoritative stock event:
   - WO reserve;
   - issue/pemakaian part mengurangi on-hand;
   - invoice tidak mengurangi lagi;
   - cancel/reversal mengembalikan lewat movement pembalik.
4. Terapkan unified period lock untuk stock dan finance; backdate setelah close memerlukan reopen terotorisasi dan audit reason.
5. Buktikan migration, rollback, backfill, transfer-pair history, signed legacy quantity, dan concurrency di MySQL 5.7.

**Acceptance gate P0:** quantity ledger = warehouse balance; value ledger = inventory asset/subledger; setiap mismatch menghasilkan exception queue; tidak ada mutation pada periode terkunci; test MySQL dan independent review lulus.

### P1 — parity operasional Accurate

1. Purchase Request → approval → PO → partial receipt → invoice → payment → purchase return.
2. Sales/WO return yang membalik quantity, HPP, invoice/credit, dan payment secara auditable.
3. Available-to-promise: on-hand, reserved WO, in-transit, requested, ordered, sellable.
4. Minimum/reorder per item-gudang dengan preferred supplier dan suggested quantity.
5. Laporan Stock Card, Inventory Value, Stock Availability, Inventory Aging, transfer outstanding, count variance, dan reconciliation dashboard.
6. Immutable audit event untuk create/edit/post/cancel/reverse/manual-add/reopen-period dengan actor, reason, before/after reference, effective/recorded time.

### P2 — peningkatan setelah fondasi benar

1. Multi-unit conversion.
2. Serial/batch/expiry jika part yang digunakan membutuhkan traceability.
3. Perbaiki menu placeholder/misroute dan tambahkan saved report/filter.
4. Purchasing/sales analytics lanjutan.

## Build vs integrate

Keputusan bisnis tetap: CerdikApp dibangun sebagai pengganti Accurate untuk operasional Dokter AC Mobil. Namun cutover finansial harus bertahap:

1. CerdikApp authoritative untuk WO dan operasional bengkel.
2. Jalankan paralel inventory quantity per item-gudang.
3. Setelah valuation ledger stabil, rekonsiliasi nilai persediaan dan HPP per periode.
4. Baru pindahkan purchasing, returns, accounting journal, dan period close.
5. Hentikan Accurate hanya setelah beberapa periode tutup menunjukkan quantity dan value seimbang tanpa koreksi manual destruktif.

## Batas inspeksi

- Tidak ada credential yang dibaca/disimpan.
- Tidak ada transaksi uji yang disimpan; izin membuat transaksi dari pengguna tidak perlu digunakan karena form, daftar, satu dokumen existing, laporan, dan source code sudah memberi bukti cukup.
- Detail Akses Grup, period lock, dan behavior delete/reversal Accurate belum diverifikasi langsung.
- Nominal, nama pemasok/pelanggan, nomor dokumen, alamat, dan stok riil tidak dimasukkan ke laporan.
