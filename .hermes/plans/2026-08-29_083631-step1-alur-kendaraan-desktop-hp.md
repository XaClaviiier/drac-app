# Step 1 — Alur Kendaraan sampai Pembayaran (Desktop + HP) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Menstabilkan satu alur operasional lengkap dan konsisten di desktop maupun HP: kendaraan Register → pelanggan setuju → Dikerjakan → penambahan layanan → Selesai → Faktur → Pembayaran.

**Architecture:** Aturan status ditempatkan di API/domain layer agar desktop dan HP memakai aturan yang sama. Data kendaraan, WO, layanan, persetujuan, faktur, pembayaran, dan mutasi stok memakai ID permanen serta audit trail; UI desktop dan HP hanya menjadi dua tampilan dari transaksi yang sama, bukan dua alur terpisah.

**Tech Stack:** React 19, TypeScript, Vite, PHP API, SQL, Node test runner (`node --test`).

---

## 1. Ruang Lingkup Step 1

### Termasuk

- [ ] Registrasi pelanggan dan kendaraan.
- [ ] Pembuatan WO status `Register`.
- [ ] Pencatatan keluhan, diagnosis, estimasi, dan daftar layanan awal.
- [ ] Persetujuan pelanggan terhadap layanan dan nilai estimasi.
- [ ] Perubahan status menjadi `Proses`/Dikerjakan.
- [ ] Penambahan layanan/barang setelah pekerjaan berjalan.
- [ ] Persetujuan tambahan untuk kenaikan nilai/layanan.
- [ ] Penyelesaian pekerjaan dan hasil akhir pemeriksaan.
- [ ] Pembuatan faktur satu kali dari WO.
- [ ] Pengeluaran stok barang saat faktur dibuat sesuai aturan yang berlaku.
- [ ] Pembayaran penuh atau sebagian.
- [ ] Tampilan dan aksi yang setara di desktop dan HP.
- [ ] Audit trail serta perlindungan terhadap klik ganda/koneksi lambat.

### Tidak termasuk pada Step 1

- [ ] Buku besar dan laporan akuntansi lengkap.
- [ ] Pajak lengkap.
- [ ] Purchase Order dan utang supplier.
- [ ] Rekonsiliasi bank.
- [ ] Migrasi penuh Accurate.

Step 1 tetap menyimpan data yang diperlukan agar modul akuntansi berikutnya dapat melakukan backfill jurnal tanpa input ulang.

---

## 2. Status dan Aturan Transisi Baku

### Alur utama

`Register` → `Proses` → `Selesai` → Faktur dibuat → Pembayaran sebagian/lunas

Status faktur tetap terpisah dari status WO:

- WO: `Register`, `Proses`, `Selesai`, `Closed`.
- Faktur: `Belum Lunas`, `Lunas`.
- Pembayaran: dokumen transaksi tersendiri, bukan hanya angka pada faktur.

### Checklist aturan transisi

#### Register

- [ ] Kendaraan dan pelanggan sudah memiliki ID permanen.
- [ ] Nomor WO unik.
- [ ] Keluhan pelanggan tercatat.
- [ ] Teknisi/PIC dapat diisi.
- [ ] Diagnosis dan layanan awal dapat ditambahkan.
- [ ] Total estimasi dihitung server dari detail, bukan dipercaya dari total kiriman UI.
- [ ] WO belum boleh difakturkan.

#### Setuju Dikerjakan

- [ ] Minimal ada satu layanan atau alasan pekerjaan tanpa biaya.
- [ ] Sistem menyimpan snapshot layanan yang disetujui.
- [ ] Sistem menyimpan total estimasi yang disetujui.
- [ ] Sistem menyimpan waktu persetujuan.
- [ ] Sistem menyimpan nama/kontak pemberi persetujuan.
- [ ] Sistem menyimpan petugas yang mencatat persetujuan.
- [ ] Metode persetujuan tersedia: langsung, telepon, WhatsApp, atau lainnya.
- [ ] Setelah valid, status berubah dari `Register` menjadi `Proses`.
- [ ] Klik ganda tidak boleh membuat dua log/transaksi.

#### Proses/Dikerjakan

- [ ] Teknisi dapat mengisi temuan dan progres.
- [ ] Identitas pelanggan/kendaraan terkunci; koreksi hanya dengan izin dan alasan.
- [ ] Layanan yang sudah disetujui tidak dapat diubah diam-diam.
- [ ] Penghapusan layanan yang sudah disetujui wajib alasan dan tercatat.
- [ ] Penambahan layanan membuat revisi/delta persetujuan baru.

#### Penambahan layanan

- [ ] Sistem menampilkan layanan awal, layanan tambahan, nilai awal, nilai tambahan, dan total baru.
- [ ] Layanan tambahan berstatus `Menunggu Persetujuan`, `Disetujui`, atau `Ditolak`.
- [ ] Layanan tambahan belum disetujui tidak ikut total final dan tidak boleh difakturkan.
- [ ] Persetujuan tambahan menyimpan kontak, metode, waktu, petugas, dan snapshot harga.
- [ ] Penolakan tetap tersimpan dalam audit, tetapi tidak masuk faktur.
- [ ] Harga snapshot tidak berubah jika harga master barang/jasa berubah kemudian.
- [ ] Barang tambahan memerlukan gudang pengeluaran saat faktur dibuat.

#### Selesai

- [ ] Hanya WO `Proses` yang dapat menjadi `Selesai`.
- [ ] Tidak ada layanan tambahan yang masih menunggu persetujuan.
- [ ] Hasil pekerjaan/temuan akhir tercatat.
- [ ] Temperatur, LP, dan HP akhir dapat dicatat sesuai data yang sudah tersedia.
- [ ] Teknisi utama terisi atau ada alasan pengecualian.
- [ ] Waktu selesai dan pengguna yang menyelesaikan tercatat.
- [ ] Setelah `Selesai`, detail komersial terkunci kecuali dibuka dengan izin dan alasan.

#### Faktur

- [ ] Faktur hanya dapat dibuat dari WO `Selesai`.
- [ ] Satu WO hanya boleh memiliki satu faktur aktif.
- [ ] Nomor faktur unik dan idempotent.
- [ ] Faktur mengambil snapshot layanan yang disetujui, bukan harga master terbaru.
- [ ] Layanan ditolak/menunggu tidak masuk faktur.
- [ ] Gudang dipilih untuk setiap barang persediaan.
- [ ] Pembuatan faktur, mutasi stok, dan relasi ke WO berjalan dalam satu transaksi database.
- [ ] Kegagalan salah satu langkah membatalkan seluruh langkah.
- [ ] Setelah berhasil, WO tetap `Selesai` dan memiliki `invoiceId`/`invoiceNumber`.

#### Pembayaran

- [ ] Pembayaran hanya dapat dibuat terhadap faktur aktif.
- [ ] Pembayaran dapat sebagian atau penuh.
- [ ] Nilai tidak boleh nol/negatif.
- [ ] Nilai tidak boleh melebihi sisa tagihan.
- [ ] Metode pembayaran, tanggal-jam, cabang, petugas, dan kas/rekening tujuan tersimpan.
- [ ] Bukti/referensi transfer dapat disimpan.
- [ ] Pembayaran menggunakan idempotency key agar klik ganda tidak menggandakan uang diterima.
- [ ] Status faktur dihitung ulang dari total pembayaran aktif.
- [ ] Pembayaran penuh mengubah faktur menjadi `Lunas`.
- [ ] Pembayaran sebagian mempertahankan `Belum Lunas` dan menampilkan sisa.
- [ ] Koreksi pembayaran memakai void/reversal dengan alasan, bukan edit diam-diam.

---

## 3. Kontrak Data Permanen

**Files likely to change:**
- Modify: `src/types/index.ts`
- Create: `database/migrate_step1_workflow.sql`
- Modify: `database/dokterac_schema.sql`
- Modify: `api/helpers.php`

### Checklist struktur data

- [ ] Pertahankan ID kendaraan, pelanggan, WO, faktur, dan pembayaran yang sudah ada.
- [ ] Tambahkan metadata persetujuan awal tanpa menghapus `approvedServices`, `estimateTotal`, dan `approvedAt` lama.
- [ ] Tambahkan revision/approval record untuk layanan tambahan.
- [ ] Tambahkan waktu mulai proses dan waktu selesai.
- [ ] Tambahkan idempotency key pada persetujuan, faktur, dan pembayaran bila belum ada.
- [ ] Tambahkan audit actor dan alasan koreksi.
- [ ] Migration hanya `CREATE/ADD`; tidak melakukan drop/rename destruktif.
- [ ] Buat migrasi backfill untuk data WO lama dengan status yang kompatibel.
- [ ] Data lama yang tidak lengkap ditandai, bukan dihapus atau ditebak.

### Model yang disarankan

- `work_order_approval_revisions`
  - `id`, `work_order_id`, `revision_number`, `kind` (`initial`/`additional`)
  - `status` (`pending`/`approved`/`rejected`)
  - `subtotal`, `approved_at`, `approved_by_contact_id/name/phone`
  - `approval_method`, `recorded_by_user_id/name`, `notes`, timestamps
- `work_order_approval_lines`
  - snapshot `item_id`, `code`, `name`, `description`, `qty`, `unit_price`, `subtotal`
- Tambahan pada `work_orders`
  - `processing_started_at/by`, `completed_at/by`, `workflow_version`

### Gerbang selesai

- [ ] Snapshot database sebelum migrasi dapat direstore.
- [ ] Migrasi berhasil pada salinan data produksi.
- [ ] Jumlah kendaraan, WO, faktur, dan pembayaran sebelum/sesudah sama.

---

## 4. Task 1 — State Machine dan Validasi Server

**Objective:** Menjadikan API satu-satunya penentu transisi status yang sah.

**Files:**
- Create: `api/services/work-order-workflow.php`
- Modify: `api/endpoints/work-orders.php`
- Test: `tests/workorder-workflow-state-machine.test.mjs`

### TDD checklist

1. [ ] Tulis test transisi `Register → Proses` berhasil hanya dengan persetujuan valid.
2. [ ] Jalankan test dan pastikan gagal.
3. [ ] Implementasikan validator transisi.
4. [ ] Tulis test `Register → Selesai` ditolak.
5. [ ] Tulis test `Proses → Selesai` ditolak bila approval tambahan masih pending.
6. [ ] Tulis test WO berfaktur tidak dapat kembali ke proses tanpa prosedur koreksi.
7. [ ] Tulis test klik ganda transisi tidak menggandakan status log.
8. [ ] Jalankan test spesifik hingga lulus.
9. [ ] Jalankan `npm run check`.

### Acceptance criteria

- [ ] Desktop dan HP menerima pesan penolakan yang sama dari API.
- [ ] Tidak ada UI yang dapat melewati aturan dengan request manual.

---

## 5. Task 2 — Register Kendaraan dan WO

**Objective:** Membuat registrasi kendaraan dan WO aman, cepat, dan tidak menduplikasi master.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: komponen picker pelanggan/kendaraan terkait
- Modify: `api/endpoints/work-orders.php`
- Modify: endpoint kendaraan/pelanggan terkait
- Test: `tests/workorder-register-contract.test.mjs`
- Extend: `tests/workorder-mobile-editor-contract.test.mjs`

### Checklist desktop

- [ ] Pencarian nomor polisi sebelum membuat kendaraan baru.
- [ ] Peringatan duplikat nomor polisi.
- [ ] Pilih pelanggan lama atau buat pelanggan baru.
- [ ] Pilih kendaraan lama atau registrasi kendaraan baru.
- [ ] Isi keluhan, PIC/driver, cabang, teknisi, tanggal, dan jam.
- [ ] Simpan menghasilkan satu kendaraan dan satu WO.
- [ ] Tampilkan nomor WO dan status `Register`.

### Checklist HP

- [ ] Form satu kolom dan nyaman digunakan satu tangan.
- [ ] Identitas kendaraan/pelanggan terlihat sebelum simpan.
- [ ] Tombol Simpan persisten tetapi tidak menutupi field.
- [ ] Loading mencegah klik ganda.
- [ ] Setelah tersimpan, identitas pelanggan/kendaraan terkunci.
- [ ] Koreksi identitas membutuhkan izin dan alasan.

### Acceptance criteria

- [ ] WO yang dibuat lewat HP langsung terlihat di desktop dengan ID dan data sama.
- [ ] WO yang dibuat lewat desktop langsung terlihat di HP.

---

## 6. Task 3 — Diagnosis, Estimasi, dan Persetujuan Awal

**Objective:** Mengunci layanan dan harga yang benar-benar disetujui pelanggan.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `api/endpoints/work-orders.php`
- Create/Modify: approval endpoints under `api/endpoints/`
- Test: `tests/workorder-approval.test.mjs`
- Extend: `tests/workorder-audit-contract.test.mjs`

### Checklist desktop dan HP

- [ ] Tambahkan barang/jasa/paket.
- [ ] Tampilkan qty, harga, subtotal, dan total.
- [ ] Simpan diagnosis tanpa otomatis memulai pekerjaan.
- [ ] Tombol `Setuju Dikerjakan` terpisah dari `Simpan`.
- [ ] Tampilkan ringkasan persetujuan sebelum konfirmasi.
- [ ] Pilih kontak pemberi persetujuan.
- [ ] Pilih metode persetujuan.
- [ ] Simpan snapshot layanan/harga.
- [ ] Setelah setuju, ubah status menjadi `Proses`.
- [ ] Audit mencatat siapa, kapan, kontak, metode, dan nilai.

### Acceptance criteria

- [ ] Perubahan harga master setelah persetujuan tidak mengubah snapshot WO.
- [ ] Refresh/perangkat lain menampilkan persetujuan yang sama.

---

## 7. Task 4 — Penambahan Layanan saat Dikerjakan

**Objective:** Mengelola pekerjaan tambahan tanpa mengubah persetujuan awal secara diam-diam.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `api/endpoints/work-orders.php`
- Create/Modify: approval revision endpoints
- Test: `tests/workorder-additional-services.test.mjs`

### Checklist desktop dan HP

- [ ] Tombol `Tambah Layanan` tersedia saat `Proses`.
- [ ] Layanan tambahan ditampilkan terpisah dari layanan awal.
- [ ] Total awal, tambahan, dan total baru terlihat.
- [ ] Status persetujuan per revisi terlihat jelas.
- [ ] Tombol `Minta/Catat Persetujuan` tersedia.
- [ ] Layanan pending tidak dihitung sebagai total final.
- [ ] Layanan ditolak tetap terlihat di riwayat tetapi tidak dapat difakturkan.
- [ ] Layanan disetujui masuk total final.
- [ ] Edit/hapus sesudah disetujui membuat revisi baru atau membutuhkan reversal beralasan.

### Acceptance criteria

- [ ] Tidak mungkin menyisipkan layanan ke faktur tanpa approval yang sah.
- [ ] Riwayat persetujuan dapat dibaca di HP dan desktop.

---

## 8. Task 5 — Selesaikan Pekerjaan

**Objective:** Menutup pekerjaan hanya jika data operasional dan persetujuan lengkap.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `api/endpoints/work-orders.php`
- Test: `tests/workorder-completion.test.mjs`

### Checklist

- [ ] Modal `Selesaikan Pekerjaan` menampilkan ringkasan final.
- [ ] Validasi tidak ada approval pending.
- [ ] Isi hasil akhir/temuan.
- [ ] Isi temperatur, LP, dan HP akhir bila relevan.
- [ ] Konfirmasi teknisi utama.
- [ ] Simpan `completedAt` dan aktor.
- [ ] Status berubah ke `Selesai`.
- [ ] Detail komersial terkunci.
- [ ] Tombol berikutnya adalah `Buat Faktur`, bukan pembayaran langsung.

### Acceptance criteria

- [ ] WO selesai dari HP dapat difakturkan dari desktop dan sebaliknya.

---

## 9. Task 6 — Faktur dari WO

**Objective:** Membuat faktur dan mutasi stok secara atomik dari snapshot layanan final.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `src/pages/SalesInvoice.tsx`
- Modify: `api/endpoints/sales-invoices.php`
- Extend: `tests/transaction-flow.test.mjs`
- Create: `tests/workorder-invoice-idempotency.test.mjs`

### Checklist desktop

- [ ] Preview faktur lengkap.
- [ ] Pilih gudang per barang persediaan.
- [ ] Tampilkan peringatan stok kurang/negatif sesuai kebijakan yang sekarang berlaku.
- [ ] Konfirmasi membuat faktur.
- [ ] Link ke faktur dan status pembayaran tampil pada WO.

### Checklist HP

- [ ] Ringkasan faktur mudah dibaca.
- [ ] Pemilih gudang tidak memerlukan tabel horizontal lebar.
- [ ] Total dan peringatan stok terlihat sebelum konfirmasi.
- [ ] Tombol konfirmasi memiliki loading dan perlindungan klik ganda.

### Acceptance criteria

- [ ] Satu WO tidak dapat menghasilkan dua faktur aktif.
- [ ] Jika mutasi stok gagal, faktur dan relasi WO tidak tersimpan.
- [ ] Faktur hanya berisi layanan initial/additional yang disetujui.

---

## 10. Task 7 — Pembayaran Pelanggan

**Objective:** Mencatat uang diterima sebagai transaksi terpisah dan dapat diaudit.

**Files:**
- Modify: `src/pages/CustomerPayments.tsx`
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `api/endpoints/customer-payments.php`
- Extend: `tests/transaction-flow.test.mjs`
- Create: `tests/customer-payment-idempotency.test.mjs`

### Checklist desktop dan HP

- [ ] Dari WO/faktur tersedia tombol `Terima Pembayaran`.
- [ ] Tampilkan total faktur, sudah dibayar, dan sisa.
- [ ] Isi nominal pembayaran.
- [ ] Pilih metode: tunai, transfer, QRIS/non-tunai, atau campuran bila didukung.
- [ ] Pilih kas/rekening tujuan.
- [ ] Isi referensi dan bukti bila ada.
- [ ] Tampilkan konfirmasi uang diterima sebelum simpan.
- [ ] Cegah nilai melebihi sisa tagihan.
- [ ] Cegah request ganda.
- [ ] Setelah simpan, tampilkan kuitansi/nomor pembayaran.
- [ ] Status faktur otomatis diperbarui.
- [ ] Riwayat pembayaran terlihat dari WO dan faktur.

### Acceptance criteria

- [ ] Pembayaran HP muncul pada desktop dengan nomor, nilai, waktu, dan petugas yang sama.
- [ ] Dua request dengan idempotency key sama menghasilkan satu pembayaran.

---

## 11. Task 8 — Kesetaraan Desktop dan HP

**Objective:** Memastikan tidak ada fitur kritis yang hanya tersedia pada salah satu perangkat.

**Files:**
- Modify: `src/pages/WorkOrders.tsx`
- Modify: `src/pages/CustomerPayments.tsx`
- Modify: components responsive terkait
- Extend: `tests/workorder-mobile-editor-contract.test.mjs`
- Create: `tests/workflow-responsive-parity.test.mjs`

### Matriks parity

| Aksi | Desktop | HP |
|---|---:|---:|
| Cari/registrasi kendaraan | [ ] | [ ] |
| Buat WO Register | [ ] | [ ] |
| Tambah diagnosis/layanan | [ ] | [ ] |
| Setuju Dikerjakan | [ ] | [ ] |
| Tambah layanan saat Proses | [ ] | [ ] |
| Setujui/tolak tambahan | [ ] | [ ] |
| Selesaikan pekerjaan | [ ] | [ ] |
| Buat faktur | [ ] | [ ] |
| Pilih gudang barang | [ ] | [ ] |
| Terima pembayaran | [ ] | [ ] |
| Lihat audit/riwayat | [ ] | [ ] |

### Checklist UX HP

- [ ] Tidak ada scroll horizontal untuk aksi inti.
- [ ] Minimum touch target memadai.
- [ ] Satu footer aksi persisten.
- [ ] Aksi status terpisah dari tombol Simpan.
- [ ] Dialog ringkas dan dapat discroll.
- [ ] Keyboard HP tidak menutup field/tombol penting.
- [ ] Data tersimpan setelah refresh.

---

## 12. Task 9 — Audit, Concurrency, dan Pemulihan Error

**Objective:** Menjamin transaksi tidak hilang atau ganda ketika dua perangkat bekerja bersamaan.

**Files:**
- Modify: `api/endpoints/work-orders.php`
- Modify: `api/endpoints/sales-invoices.php`
- Modify: `api/endpoints/customer-payments.php`
- Modify: `api/helpers.php`
- Extend: `tests/workorder-audit-contract.test.mjs`
- Extend: `tests/transaction-flow.test.mjs`

### Checklist

- [ ] Optimistic concurrency/version check pada WO.
- [ ] Jika data berubah di perangkat lain, pengguna mendapat pesan refresh/compare, bukan overwrite diam-diam.
- [ ] Semua transisi status mencatat from/to/actor/time/reason.
- [ ] Approval memiliki audit snapshot.
- [ ] Faktur dan pembayaran memiliki idempotency key.
- [ ] Semua operasi multi-tabel memakai transaction + rollback.
- [ ] Error jaringan tidak menampilkan sukses palsu.
- [ ] Retry aman tidak menggandakan dokumen.

---

## 13. Task 10 — Pengujian End-to-End dan Pilot Cabang

**Objective:** Membuktikan satu kendaraan dapat melewati alur lengkap di desktop dan HP tanpa kehilangan data.

**Files:**
- Create: `tests/step1-e2e-contract.test.mjs`
- Create: `docs/operations/STEP1_UAT.md`
- Modify: `src/data/helpArticles.ts`

### Skenario UAT wajib

#### Skenario A — Pembayaran penuh

- [ ] Registrasi kendaraan di HP.
- [ ] Buka WO di desktop.
- [ ] Tambahkan diagnosis dan layanan awal.
- [ ] Catat persetujuan.
- [ ] Mulai proses.
- [ ] Tambahkan satu layanan tambahan dari HP.
- [ ] Catat persetujuan tambahan di desktop.
- [ ] Selesaikan WO di HP.
- [ ] Buat faktur di desktop.
- [ ] Terima pembayaran penuh di HP.
- [ ] Pastikan faktur `Lunas` pada kedua perangkat.

#### Skenario B — Pembayaran sebagian

- [ ] Jalankan alur sampai faktur.
- [ ] Bayar sebagian dari desktop.
- [ ] Pastikan sisa muncul di HP.
- [ ] Bayar sisa dari HP.
- [ ] Pastikan total pembayaran tidak melebihi faktur.

#### Skenario C — Layanan tambahan ditolak

- [ ] Tambahkan layanan saat Proses.
- [ ] Tandai ditolak.
- [ ] Selesaikan WO.
- [ ] Pastikan layanan ditolak tidak masuk faktur.

#### Skenario D — Koneksi lambat/klik ganda

- [ ] Klik Setuju dua kali.
- [ ] Klik Buat Faktur dua kali.
- [ ] Klik Bayar dua kali.
- [ ] Pastikan masing-masing hanya menghasilkan satu transaksi.

#### Skenario E — Dua perangkat bersamaan

- [ ] Buka WO sama di desktop dan HP.
- [ ] Ubah di satu perangkat.
- [ ] Simpan versi lama di perangkat lain.
- [ ] Pastikan sistem menolak overwrite dan meminta refresh.

### Urutan pilot

- [ ] Administrator/Pak Bos pada data uji.
- [ ] Satu pengguna pilot di satu cabang.
- [ ] Jalankan minimal beberapa transaksi nyata dengan checklist harian.
- [ ] Tinjau error dan feedback.
- [ ] Buka ke cabang berikutnya hanya setelah gerbang pilot lulus.

---

## 14. Quality Gates

Untuk setiap task:

1. [ ] Tulis failing test.
2. [ ] Jalankan test spesifik dan pastikan gagal dengan alasan yang benar.
3. [ ] Implementasikan perubahan minimal.
4. [ ] Jalankan test hingga lulus.
5. [ ] Jalankan `npm run check`.
6. [ ] Jalankan `npm run build`.
7. [ ] Uji desktop dan viewport HP.
8. [ ] Uji pada salinan data produksi.
9. [ ] Backup sebelum rilis.
10. [ ] Rilis di balik feature flag/admin-only.
11. [ ] Pantau satu hari kerja.
12. [ ] Commit kecil per task.

---

## 15. Definition of Done Step 1

Step 1 dianggap selesai hanya jika:

- [ ] Alur Register → Proses → Selesai tervalidasi server.
- [ ] Persetujuan awal memiliki snapshot dan audit.
- [ ] Layanan tambahan memiliki persetujuan terpisah.
- [ ] Layanan ditolak/pending tidak masuk faktur.
- [ ] Satu WO hanya memiliki satu faktur aktif.
- [ ] Faktur dan mutasi stok atomik.
- [ ] Pembayaran sebagian dan penuh bekerja.
- [ ] Pembayaran ganda dicegah.
- [ ] Desktop dan HP memiliki seluruh aksi inti.
- [ ] Data yang dimasukkan di satu perangkat langsung konsisten di perangkat lain.
- [ ] Konflik dua perangkat tidak menghapus perubahan.
- [ ] Audit trail lengkap dari Register sampai Pembayaran.
- [ ] Seluruh test dan build lulus.
- [ ] Pilot cabang berhasil tanpa mengganggu transaksi harian.
- [ ] Data Step 1 siap diposting ke jurnal akuntansi pada step berikutnya tanpa input ulang.
