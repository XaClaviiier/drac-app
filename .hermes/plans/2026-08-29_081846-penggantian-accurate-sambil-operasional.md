# Penggantian Accurate Online Sambil Operasional Berjalan — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Menjadikan DRAC-APP sistem operasional dan akuntansi utama Dokter AC Mobil yang dapat menggantikan Accurate Online tanpa menghentikan kegiatan tiga cabang dan tanpa kehilangan jejak transaksi.

**Architecture:** Pengembangan dilakukan bertahap dengan modul baru di belakang feature flag, migrasi database yang backward-compatible, jurnal double-entry sebagai sumber laporan keuangan, serta rekonsiliasi paralel terhadap Accurate. Accurate tetap menjadi sumber kebenaran keuangan sampai seluruh gerbang cutover terpenuhi; DRAC-APP tetap dipakai untuk operasional yang sudah stabil.

**Tech Stack:** React 19, TypeScript, Vite, PHP API, SQL database, Node test runner (`node --test`), ExcelJS untuk impor/ekspor dan rekonsiliasi.

**Step 1 yang disepakati:** Fokus pertama adalah alur kendaraan dari Register → Setuju Dikerjakan → Penambahan Layanan → Selesai → Faktur → Pembayaran dengan kesetaraan desktop dan HP. Rencana rinci: `.hermes/plans/2026-08-29_083631-step1-alur-kendaraan-desktop-hp.md`.

---

## 1. Aturan Utama Agar Operasional Tidak Terganggu

- [ ] Jangan mematikan atau mengubah alur WO, faktur, pembayaran, stok, dan pembelian yang sedang dipakai tanpa uji regresi.
- [ ] Accurate tetap digunakan sebagai sumber angka resmi selama fase paralel.
- [ ] Semua tabel/kolom baru dibuat backward-compatible; jangan rename/drop kolom produksi pada tahap awal.
- [ ] Setiap modul baru berada di balik feature flag dan hanya dibuka untuk Administrator/Pak Bos lebih dahulu.
- [ ] Uji pertama dilakukan pada data salinan atau mode bayangan, bukan langsung mengubah saldo produksi.
- [ ] Rilis dilakukan di luar jam ramai dan selalu memiliki langkah rollback.
- [ ] Backup database harus berhasil sebelum setiap migrasi/rilis.
- [ ] Tidak boleh menghapus transaksi keuangan; pembetulan memakai void, reversal, atau dokumen koreksi.
- [ ] Nomor dokumen harus idempotent dan unik per jenis dokumen/cabang/periode.
- [ ] Setiap perubahan saldo harus memiliki `created_by`, `updated_by`, waktu, alasan, dan audit trail.

### Kontrak kesinambungan data tahap operasional

Data yang dimasukkan sejak tahap pertama wajib menjadi data permanen yang dapat dinaikkan ke modul berikutnya, bukan data percobaan:

- [ ] Kendaraan yang sudah teregistrasi tetap memakai ID yang sama pada WO, faktur, pembayaran, dan histori servis berikutnya.
- [ ] Master pelanggan, kendaraan, barang, jasa, gudang, supplier, pengguna, dan cabang tidak dibuat ulang saat modul akuntansi ditambahkan.
- [ ] Stok awal dan seluruh mutasi stok disimpan sebagai ledger transaksi; nilai/HPP berikutnya dihitung dari histori tersebut atau dari adjustment pembuka yang terdokumentasi.
- [ ] Uang yang diterima selalu dicatat sebagai dokumen pembayaran terpisah dan ditautkan ke faktur/WO, metode pembayaran, akun kas/bank, cabang, tanggal, serta penerima.
- [ ] Nomor/ID dokumen lama tidak boleh berubah akibat migrasi schema.
- [ ] Kolom dan tabel baru ditambahkan secara backward-compatible; perubahan struktur memakai migration script dan tidak menghapus data lama.
- [ ] Transaksi lama yang belum memiliki jurnal diberi status `unposted/legacy`, lalu diposting melalui proses backfill yang idempotent setelah pemetaan akun disetujui.
- [ ] Koreksi data lama menggunakan adjustment, void, atau reversal dengan alasan; bukan mengedit saldo akhir secara diam-diam.
- [ ] Setiap backfill/migrasi memiliki dry-run, jumlah record, control total, error report, dan backup sebelum eksekusi.
- [ ] Sebelum tahap pertama go-live, buat automated test yang membuktikan satu kendaraan, satu stok masuk/keluar, satu faktur, dan satu pembayaran tetap utuh setelah migrasi akuntansi simulasi.

### Data minimum yang wajib dicatat sejak tahap pertama

- **Kendaraan:** ID permanen, pelanggan, nomor polisi, merek/model/tahun, VIN/nomor rangka bila ada, cabang, dan histori WO.
- **Barang/stok:** ID permanen, SKU, satuan, gudang, kuantitas, tanggal mutasi, jenis mutasi, dokumen sumber, harga beli/nilai jika tersedia, dan pengguna pencatat.
- **Penerimaan uang:** ID pembayaran, tanggal-jam, cabang, pelanggan, faktur/WO, nilai, metode pembayaran, kas/rekening tujuan, referensi transfer, penerima, dan bukti bila ada.
- **Dokumen operasional:** status, tanggal transaksi, tanggal posting, pembuat, pengubah, cabang, dan hubungan antar dokumen.

## 2. Ritme Kerja Sambil Bengkel Tetap Berjalan

### Checklist harian operasional

- [ ] Pagi: pastikan login, WO, faktur, pembayaran, dan stok dapat digunakan.
- [ ] Periksa proses gagal dan error API dari hari sebelumnya.
- [ ] Pastikan backup malam berhasil dan dapat dibaca.
- [ ] Catat transaksi yang berbeda antara DRAC-APP dan Accurate.
- [ ] Jangan memperbaiki saldo langsung; buat tiket selisih dengan bukti dokumen.
- [ ] Sore: cocokkan kas diterima, transfer, faktur, dan setoran per cabang.
- [ ] Tutup hari hanya jika tidak ada transaksi menggantung tanpa penanggung jawab.

### Checklist setiap rilis

- [ ] Buat backup database dengan nama bertanggal.
- [ ] Jalankan `npm run check`.
- [ ] Jalankan `npm run build`.
- [ ] Uji smoke test: login → WO → faktur → pembayaran → stok → laporan.
- [ ] Pastikan migrasi dapat dijalankan dua kali tanpa merusak data atau memiliki guard.
- [ ] Aktifkan fitur hanya untuk Administrator.
- [ ] Pantau satu hari kerja sebelum membuka fitur ke cabang.
- [ ] Dokumentasikan rollback dan siapa yang berwenang menjalankannya.

### Checklist mingguan Pak Bos

- [ ] Bandingkan omzet per cabang.
- [ ] Bandingkan saldo kas dan bank.
- [ ] Bandingkan total piutang dan utang.
- [ ] Bandingkan nilai dan kuantitas persediaan.
- [ ] Bandingkan HPP serta laba rugi.
- [ ] Tinjau jurnal tidak seimbang, transaksi void, dan perubahan tanggal mundur.
- [ ] Tinjau user yang mengubah transaksi setelah pembayaran.
- [ ] Putuskan apakah fase berikutnya boleh dibuka.

---

## 3. Fase 0 — Baseline, Backup, dan Peta Transaksi

**Tujuan:** Mengetahui kondisi nyata sebelum membangun mesin akuntansi.

**Files likely to change:**
- Create: `docs/accounting/TRANSACTION_MATRIX.md`
- Create: `docs/accounting/COA_MAPPING.md`
- Create: `docs/operations/CUTOVER_RUNBOOK.md`
- Create: `tests/accounting-baseline.test.mjs`
- Review: `database/dokterac_schema.sql`
- Review: `api/endpoints/*.php`
- Review: `src/context/AppContext.tsx`

### Checklist

- [ ] Inventaris semua transaksi yang sudah ada: WO, faktur, pembayaran, pembelian, penerimaan, transfer gudang, penyesuaian stok, kas, bank, dan setoran.
- [ ] Petakan tabel, endpoint, status, serta efek saldo setiap transaksi.
- [ ] Identifikasi transaksi yang dapat diedit/dihapus setelah diposting.
- [ ] Dokumentasikan skenario pembayaran sebagian, pembatalan, retur, dan perubahan cabang.
- [ ] Ekspor saldo pembanding dari Accurate: COA, kas/bank, piutang, utang, persediaan, laba rugi, dan neraca.
- [ ] Ambil snapshot database produksi.
- [ ] Lakukan satu uji restore ke database terpisah.
- [ ] Tetapkan satu tanggal awal periode paralel.
- [ ] Tetapkan PIC rekonsiliasi untuk Perintis, Cakalang, dan Mamuju.

### Gerbang selesai

- [ ] Backup berhasil direstore.
- [ ] Semua jenis transaksi memiliki peta efek bisnis.
- [ ] Total awal dari DRAC-APP dan Accurate terdokumentasi beserta selisihnya.

---

## 4. Fase 1 — Fondasi Akuntansi Double-Entry

**Tujuan:** Setiap transaksi keuangan menghasilkan jurnal debit-kredit yang seimbang.

**Files likely to change:**
- Create: `database/migrate_accounting_core.sql`
- Create: `api/endpoints/journal-entries.php`
- Create: `api/services/accounting-posting.php`
- Create: `src/types/accounting.ts`
- Create: `src/lib/accounting.ts`
- Create: `tests/accounting-posting.test.mjs`
- Modify: `api/index.php`
- Modify: `database/dokterac_schema.sql`

### Struktur minimal

- [ ] `fiscal_periods`
- [ ] `chart_of_accounts`
- [ ] `journal_entries`
- [ ] `journal_lines`
- [ ] `posting_rules`
- [ ] `accounting_dimensions` untuk cabang/dokumen sumber
- [ ] Unique key pada `source_type + source_id + posting_version`
- [ ] Status `draft`, `posted`, `reversed`

### Checklist TDD

- [ ] Tulis test jurnal seimbang; jalankan dan pastikan gagal sebelum implementasi.
- [ ] Implementasikan validasi total debit = total kredit.
- [ ] Tulis test idempotensi; satu dokumen tidak boleh terposting dua kali.
- [ ] Implementasikan posting idempotent.
- [ ] Tulis test reversal; jurnal asli tetap ada dan jurnal pembalik tercipta.
- [ ] Implementasikan reversal dengan referensi dokumen asal.
- [ ] Tulis test periode terkunci menolak posting/edit.
- [ ] Implementasikan kontrol periode.
- [ ] Jalankan `npm run check` dan pastikan seluruh test lulus.

### Operasional paralel

- [ ] Jalankan posting dalam `shadow mode`: jurnal dibuat tetapi belum memengaruhi laporan resmi.
- [ ] Tampilkan daftar transaksi yang gagal diposting kepada Administrator.
- [ ] Cocokkan minimal satu minggu transaksi penjualan dan pembayaran.

### Gerbang selesai

- [ ] Nol jurnal tidak seimbang.
- [ ] Nol jurnal ganda dari dokumen sumber yang sama.
- [ ] Semua kegagalan posting terlihat dan dapat ditindak.

---

## 5. Fase 2 — Chart of Accounts dan Saldo Awal

**Tujuan:** Memiliki COA yang sesuai usaha bengkel dan saldo pembuka yang dapat direkonsiliasi.

**Files likely to change:**
- Modify: `src/pages/ChartOfAccounts.tsx`
- Create: `src/pages/OpeningBalances.tsx`
- Create: `api/endpoints/opening-balances.php`
- Create: `tests/opening-balances.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

### Checklist

- [ ] Definisikan akun aset, kewajiban, modal, pendapatan jasa, pendapatan barang, HPP, dan beban.
- [ ] Tandai akun kas, bank, piutang, utang, persediaan, pajak, dan laba ditahan sebagai akun kontrol.
- [ ] Cegah posting manual langsung ke akun kontrol tanpa dokumen sumber.
- [ ] Buat pemetaan akun default per barang, jasa, metode pembayaran, dan cabang.
- [ ] Impor COA Accurate atau mapping ke COA baru.
- [ ] Impor saldo awal per tanggal cutover.
- [ ] Validasi total debit saldo awal = total kredit saldo awal.
- [ ] Batasi perubahan saldo awal hanya untuk Administrator dan wajib alasan.

### Gerbang selesai

- [ ] Neraca saldo awal seimbang.
- [ ] Total kas, bank, piutang, utang, dan persediaan cocok dengan data pembanding.

---

## 6. Fase 3 — Penjualan, Piutang, dan Pembayaran

**Tujuan:** Menyelesaikan siklus pendapatan dari WO sampai pelunasan dan reversal.

**Files likely to change:**
- Modify: `api/endpoints/sales-invoices.php`
- Modify/Create: endpoint pembayaran pelanggan di `api/endpoints/`
- Modify: `src/pages/SalesInvoice.tsx`
- Modify: `src/pages/CustomerPayments.tsx`
- Create: `tests/sales-accounting.test.mjs`
- Extend: `tests/transaction-flow.test.mjs`

### Checklist

- [ ] Faktur posting: debit piutang/kas; kredit pendapatan dan pajak terkait.
- [ ] Pisahkan pendapatan jasa dan spare part.
- [ ] Dukung pembayaran tunai, transfer, QRIS, gabungan, dan pembayaran sebagian.
- [ ] Dukung uang muka pelanggan dan alokasinya ke faktur.
- [ ] Hitung umur piutang dan jatuh tempo.
- [ ] Implementasikan kredit nota/retur penjualan bila diperlukan.
- [ ] Void faktur setelah pembayaran harus menolak atau membuat reversal terkontrol.
- [ ] Nomor faktur unik per cabang/periode.
- [ ] Buat buku pembantu piutang per pelanggan.
- [ ] Rekonsiliasi faktur dan pembayaran harian dengan Accurate.

### Gerbang selesai

- [ ] Total penjualan harian dan bulanan cocok.
- [ ] Total pembayaran dan saldo piutang cocok.
- [ ] Semua skenario pembayaran sebagian dan void memiliki test.

---

## 7. Fase 4 — Persediaan Perpetual dan HPP

**Tujuan:** Setiap pergerakan spare part memengaruhi kuantitas, nilai persediaan, dan HPP secara benar.

**Files likely to change:**
- Create: `database/migrate_inventory_valuation.sql`
- Create: `api/services/inventory-valuation.php`
- Modify: `api/endpoints/work-orders.php`
- Modify: `api/endpoints/stock-opnames.php`
- Modify: endpoint gudang/transfer/receipt
- Create: `tests/inventory-valuation.test.mjs`
- Extend: `tests/stock-count-category-order.test.mjs`

### Checklist

- [ ] Tetapkan metode HPP rata-rata bergerak dan dokumentasikan aturan.
- [ ] Simpan layer/pergerakan nilai stok, bukan hanya kuantitas akhir.
- [ ] Penerimaan menambah kuantitas dan nilai.
- [ ] Pemakaian spare part pada WO mengurangi stok dan membentuk HPP.
- [ ] Transfer gudang memindahkan nilai tanpa menciptakan laba/rugi.
- [ ] Penyesuaian stok membentuk jurnal selisih persediaan.
- [ ] Retur pembelian dan retur penjualan mengembalikan kuantitas/nilai secara konsisten.
- [ ] Blokir stok negatif atau minta otorisasi khusus dengan audit trail.
- [ ] Hilangkan duplikasi menu “Penyesuaian Stok” pada `src/components/Layout.tsx`.
- [ ] Buat laporan kartu stok bernilai dan rekonsiliasi persediaan ke buku besar.

### Gerbang selesai

- [ ] Kuantitas subledger = kuantitas fisik yang disetujui.
- [ ] Nilai subledger persediaan = saldo akun persediaan.
- [ ] HPP per WO dapat ditelusuri ke item yang dipakai.

---

## 8. Fase 5 — Pembelian, Utang, dan Supplier

**Tujuan:** Menutup siklus pengadaan sampai pembayaran supplier.

**Files likely to change:**
- Create: `src/pages/PurchaseRequests.tsx`
- Create: `src/pages/PurchaseOrders.tsx`
- Create: `src/pages/SupplierPayments.tsx`
- Create: `src/pages/PurchaseReturns.tsx`
- Create corresponding endpoints under `api/endpoints/`
- Modify: `src/pages/PurchaseInvoices.tsx`
- Modify: `src/pages/GoodsReceipt.tsx`
- Create: `tests/purchase-cycle.test.mjs`

### Checklist

- [ ] Permintaan Barang aktif.
- [ ] Persetujuan berdasarkan cabang dan batas nominal.
- [ ] Purchase Order aktif dan dapat diterima sebagian.
- [ ] Penerimaan barang dapat dicocokkan dengan PO.
- [ ] Faktur supplier dapat dicocokkan dengan penerimaan.
- [ ] Pembayaran supplier aktif, termasuk pembayaran sebagian.
- [ ] Utang supplier dan umur utang aktif.
- [ ] Retur pembelian aktif.
- [ ] Tangani barang diterima belum ditagih.
- [ ] Tangani faktur supplier sebelum barang lengkap.
- [ ] Rekonsiliasi utang per supplier dengan Accurate.

### Gerbang selesai

- [ ] Total faktur pembelian, pembayaran, dan saldo utang cocok.
- [ ] Tidak ada penerimaan tanpa status tindak lanjut.

---

## 9. Fase 6 — Kas, Bank, Setoran, dan Rekonsiliasi

**Tujuan:** Semua uang masuk/keluar dapat ditelusuri dari transaksi sampai rekening.

**Files likely to change:**
- Modify: `src/pages/CashAccounts.tsx`
- Modify: `src/pages/BranchDeposits.tsx`
- Create: `src/pages/OtherReceipts.tsx`
- Create: `src/pages/Expenses.tsx`
- Create: `src/pages/BankReconciliation.tsx`
- Create matching endpoints and `tests/cash-bank.test.mjs`
- Modify: `src/components/Layout.tsx`

### Checklist

- [ ] Aktifkan Penerimaan Lain.
- [ ] Aktifkan Pengeluaran.
- [ ] Implementasikan transfer antar-akun.
- [ ] Implementasikan kas kecil dan pertanggungjawabannya.
- [ ] Setoran cabang terhubung dengan uang tunai yang diterima.
- [ ] Verifikasi setoran tidak dapat dilakukan oleh pembuat yang sama bila segregation of duties diterapkan.
- [ ] Impor mutasi bank/CSV.
- [ ] Cocokkan mutasi dengan transaksi.
- [ ] Catat biaya admin, bunga, dan selisih.
- [ ] Buat rekonsiliasi bank per tanggal.

### Gerbang selesai

- [ ] Saldo buku per akun cocok dengan saldo hasil rekonsiliasi.
- [ ] Tunai belum disetor memiliki rincian per cabang dan umur.

---

## 10. Fase 7 — Laporan Keuangan dan Tutup Buku

**Tujuan:** Menghasilkan laporan lengkap langsung dari jurnal, bukan dari perhitungan terpisah.

**Files likely to change:**
- Create: `src/pages/GeneralJournal.tsx`
- Create: `src/pages/GeneralLedger.tsx`
- Create: `src/pages/TrialBalance.tsx`
- Create: `src/pages/ProfitLoss.tsx`
- Create: `src/pages/BalanceSheet.tsx`
- Create: `src/pages/CashFlow.tsx`
- Create: `src/pages/FiscalPeriods.tsx`
- Create reporting endpoints and `tests/financial-statements.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

### Checklist

- [ ] Jurnal Umum aktif.
- [ ] Buku Besar aktif.
- [ ] Neraca Saldo aktif.
- [ ] Laba Rugi aktif per cabang dan gabungan.
- [ ] Neraca aktif per cabang dan gabungan.
- [ ] Arus Kas aktif.
- [ ] Drill-down dari laporan ke jurnal dan dokumen sumber.
- [ ] Periode dapat dikunci.
- [ ] Periode terkunci menolak edit/posting backdate.
- [ ] Buka periode hanya oleh otorisasi khusus dan wajib alasan.
- [ ] Ekspor Excel/PDF memiliki total yang sama dengan layar.

### Gerbang selesai

- [ ] Neraca selalu seimbang.
- [ ] Laba bersih konsisten antara laba rugi dan perubahan ekuitas.
- [ ] Semua angka dapat ditelusuri sampai dokumen sumber.

---

## 11. Fase 8 — Pajak dan Kepatuhan

**Tujuan:** Menyediakan pencatatan pajak yang cukup untuk operasional dan pelaporan Indonesia.

**Files likely to change:**
- Create: `database/migrate_tax.sql`
- Create: `api/endpoints/tax.php`
- Create: `src/pages/TaxSettings.tsx`
- Create: `src/pages/TaxReports.tsx`
- Create: `tests/tax-posting.test.mjs`

### Checklist

- [ ] Tetapkan status PKP/non-PKP dan tanggal efektif.
- [ ] Dukung harga termasuk/belum termasuk pajak.
- [ ] Catat PPN masukan dan keluaran.
- [ ] Catat nomor faktur pajak dan referensi dokumen.
- [ ] Dukung pemotongan PPh yang relevan setelah divalidasi konsultan pajak.
- [ ] Buat rekap pajak per periode.
- [ ] Sediakan ekspor sesuai format yang disepakati akuntan/konsultan pajak.
- [ ] Uji pembulatan dan koreksi pajak.

### Gerbang selesai

- [ ] Rekap pajak disetujui pihak pajak/akuntan Pak Bos.
- [ ] Nilai pajak dapat direkonsiliasi ke buku besar.

---

## 12. Fase 9 — Audit Trail, Hak Akses, dan Kontrol Internal

**Tujuan:** Mencegah dan mendeteksi perubahan keuangan yang tidak sah.

**Files likely to change:**
- Create: `database/migrate_audit_controls.sql`
- Create: `api/services/audit-log.php`
- Create: `api/endpoints/audit-log.php`
- Create: `src/pages/AuditLog.tsx`
- Modify: `src/pages/UsersAndRoles.tsx`
- Create: `tests/accounting-permissions.test.mjs`

### Checklist

- [ ] Log immutable untuk create/update/void/reversal/login/export.
- [ ] Simpan nilai sebelum dan sesudah perubahan.
- [ ] Wajib alasan untuk void, reversal, backdate, dan buka periode.
- [ ] Pisahkan izin buat, edit, posting, bayar, void, approve, dan buka periode.
- [ ] Terapkan batas persetujuan berdasarkan nominal.
- [ ] Tinjau konflik wewenang kasir/approver/verifikator.
- [ ] Buat laporan perubahan transaksi setelah pembayaran.
- [ ] Buat peringatan nomor dokumen loncat atau duplikat.

### Gerbang selesai

- [ ] Pengguna cabang tidak dapat melihat/mengubah transaksi cabang lain tanpa izin.
- [ ] Semua perubahan keuangan kritis dapat ditelusuri ke satu pengguna.

---

## 13. Fase 10 — Migrasi Accurate dan Operasi Paralel

**Tujuan:** Memindahkan saldo dan histori yang dibutuhkan dengan bukti rekonsiliasi.

**Files likely to change:**
- Create: `scripts/import-accurate/*.mjs`
- Create: `scripts/reconcile/*.mjs`
- Create: `src/pages/AccountingMigration.tsx`
- Create: `tests/accurate-import.test.mjs`
- Create: `docs/accounting/MIGRATION_MAPPING.md`

### Checklist migrasi

- [ ] Impor master akun.
- [ ] Impor pelanggan dan supplier.
- [ ] Impor barang/jasa, satuan, gudang, dan saldo stok.
- [ ] Impor saldo kas dan bank.
- [ ] Impor piutang terbuka per faktur.
- [ ] Impor utang terbuka per faktur supplier.
- [ ] Impor saldo akun lainnya.
- [ ] Tentukan apakah histori penuh diimpor atau disimpan sebagai arsip read-only.
- [ ] Setiap batch impor memiliki checksum, jumlah baris, total nilai, dan error report.
- [ ] Impor dapat diulang di database uji tanpa duplikasi.

### Checklist periode paralel

- [ ] Jalankan DRAC-APP dan Accurate bersama selama minimal dua kali tutup buku bulanan yang sukses.
- [ ] Rekonsiliasi harian penjualan, pembayaran, kas, dan setoran.
- [ ] Rekonsiliasi mingguan stok, pembelian, utang, serta bank.
- [ ] Rekonsiliasi bulanan neraca saldo, laba rugi, dan neraca.
- [ ] Setiap selisih memiliki penyebab, pemilik, bukti, dan status selesai.

### Gerbang selesai

- [ ] Dua periode tutup buku berturut-turut berhasil.
- [ ] Tidak ada selisih material yang belum dijelaskan.
- [ ] Pak Bos dan penanggung jawab akuntansi menyetujui hasil rekonsiliasi.

---

## 14. Fase 11 — Cutover dan Penghentian Accurate

**Tujuan:** Menjadikan DRAC-APP satu-satunya sistem transaksi baru secara terkendali.

### Checklist H-7 sampai H-1

- [ ] Umumkan tanggal dan jam cutover.
- [ ] Bekukan perubahan master yang tidak penting.
- [ ] Selesaikan transaksi menggantung.
- [ ] Latih pengguna per cabang dan per peran.
- [ ] Siapkan panduan satu halaman untuk transaksi utama.
- [ ] Lakukan simulasi cutover dan rollback.
- [ ] Verifikasi backup DRAC-APP dan ekspor lengkap Accurate.

### Checklist hari H

- [ ] Tutup input Accurate pada waktu yang disepakati.
- [ ] Ekspor saldo final Accurate.
- [ ] Impor saldo/transaksi final.
- [ ] Cocokkan neraca saldo, persediaan, piutang, utang, kas, dan bank.
- [ ] Kunci tanggal cutover.
- [ ] Buka DRAC-APP untuk transaksi baru.
- [ ] Jadikan Accurate arsip baca-saja; jangan langsung menghapus akun/database.

### Checklist H+1 sampai H+30

- [ ] Rekonsiliasi harian selama minggu pertama.
- [ ] Rekonsiliasi mingguan sampai satu bulan.
- [ ] Pantau jurnal gagal, stok negatif, transaksi duplikat, dan edit backdate.
- [ ] Pastikan backup harian dan restore drill berjalan.
- [ ] Tutup buku pertama pasca-cutover dengan pendampingan penuh.

### Kriteria rollback

Rollback dipertimbangkan jika salah satu terjadi:

- [ ] Jurnal tidak seimbang atau banyak transaksi gagal posting.
- [ ] Saldo kas/bank tidak dapat direkonsiliasi.
- [ ] Stok berubah tanpa jejak atau terjadi kehilangan transaksi.
- [ ] Aplikasi tidak tersedia pada jam operasional dan pemulihan melewati batas yang disepakati.
- [ ] Backup tidak dapat direstore.

---

## 15. Urutan Modul yang Boleh Tetap Berjalan

### Tetap digunakan seperti sekarang

- [x] WO dan WO Timeline
- [x] Pelanggan dan kendaraan
- [x] Faktur penjualan operasional
- [x] Pembayaran pelanggan operasional
- [x] Barang, gudang, transfer, dan stok opname
- [x] Supplier, penerimaan, serta faktur pembelian
- [x] Dashboard cabang dan laporan operasional

### Dibangun dalam mode bayangan terlebih dahulu

- [ ] Jurnal otomatis
- [ ] HPP
- [ ] Piutang/utang akuntansi
- [ ] Kas/bank akuntansi
- [ ] Laporan keuangan
- [ ] Pajak

### Tidak boleh menjadi sumber resmi sebelum gerbang selesai

- [ ] Laba rugi
- [ ] Neraca
- [ ] Nilai persediaan
- [ ] Rekonsiliasi bank
- [ ] Rekap pajak

---

## 16. Quality Gates per Task Implementasi

Untuk setiap task kode:

1. [ ] Tulis test yang gagal.
2. [ ] Jalankan test spesifik dan pastikan kegagalannya sesuai fitur yang belum ada.
3. [ ] Implementasikan perubahan minimal.
4. [ ] Jalankan test spesifik hingga lulus.
5. [ ] Jalankan `npm run check`.
6. [ ] Jalankan `npm run build`.
7. [ ] Review keamanan, otorisasi, idempotensi, dan audit trail.
8. [ ] Uji terhadap salinan data produksi.
9. [ ] Commit kecil dengan satu tujuan.
10. [ ] Baru gabungkan dan rilis setelah checklist rilis terpenuhi.

## 17. Risiko dan Mitigasi

- **Risiko angka ganda:** gunakan idempotency key pada posting dan impor.
- **Risiko operasi berhenti:** feature flag, rilis bertahap, dan rollback terdokumentasi.
- **Risiko saldo berubah ke belakang:** periode terkunci dan reversal, bukan edit diam-diam.
- **Risiko stok tidak cocok:** satu ledger pergerakan kuantitas+nilai dan rekonsiliasi ke akun persediaan.
- **Risiko migrasi salah:** batch import dengan checksum, control total, dan dry-run.
- **Risiko fraud:** segregation of duties, batas approval, dan audit log immutable.
- **Risiko laporan berbeda:** semua laporan keuangan harus bersumber dari jurnal yang sama.
- **Risiko aturan pajak:** validasi desain dan hasil dengan konsultan pajak sebelum go-live.

## 18. Keputusan yang Harus Ditetapkan Pak Bos Sebelum Fase 1

- [ ] Siapa PIC akuntansi/rekonsiliasi utama.
- [ ] Tanggal awal operasi paralel.
- [ ] Target tanggal cutover (dapat disesuaikan berdasarkan gerbang, bukan dipaksakan).
- [ ] Metode HPP: rekomendasi rata-rata bergerak.
- [ ] Apakah histori Accurate penuh diimpor atau hanya saldo terbuka + arsip.
- [ ] Batas nominal persetujuan per jabatan.
- [ ] Siapa yang boleh membuka periode terkunci.
- [ ] Kebijakan stok negatif.
- [ ] Status dan kebutuhan pajak yang divalidasi konsultan pajak.

## 19. Definition of Done — Accurate Boleh Ditinggalkan

Accurate baru boleh dihentikan sebagai sistem transaksi jika seluruh item berikut terpenuhi:

- [ ] Jurnal seluruh transaksi seimbang dan idempotent.
- [ ] Kas/bank, piutang, utang, persediaan, HPP, laba rugi, dan neraca dapat direkonsiliasi.
- [ ] Dua tutup buku bulanan paralel berhasil.
- [ ] Audit trail dan hak akses lolos uji.
- [ ] Backup otomatis dan restore drill berhasil.
- [ ] Migrasi final memiliki control total dan laporan error nol/material terselesaikan.
- [ ] Semua cabang lulus uji transaksi utama.
- [ ] Pajak diverifikasi pihak yang kompeten.
- [ ] Runbook cutover dan rollback telah disimulasikan.
- [ ] Pak Bos memberikan persetujuan go-live final.
