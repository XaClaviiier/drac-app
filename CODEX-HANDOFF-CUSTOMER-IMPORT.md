# Handoff ke Codex — Import Customer CerdikApp

## Permintaan aktif
User (Alex Fong/Pak Bos) ingin melanjutkan di Codex. Bangun sampai selesai fitur IMPORT CUSTOMER, lalu jelaskan apa yang dibangun dan hasil pengujiannya. Jangan berhenti pada rencana/manifest. Fitur kendaraan menyusul, jangan memperlebar scope sebelum customer selesai.
Bahasa komunikasi: Indonesia, ringkas. User sudah frustrasi karena assistant berkali-kali menjanjikan implementasi tetapi belum mengerjakannya. Jangan meminta konfirmasi ulang untuk keputusan yang tercatat di bawah.

## Status aktual yang diverifikasi saat handoff
- Repo: `D:\PROJECT\DRAC-APP`, branch `main`.
- `git diff --stat` kosong: BELUM ada perubahan kode tracked untuk fitur import ini.
- `git status --short`: hanya untracked `accurate_export_analysis.csv`, tiga `faktur-*-raw.xlsx`, `migration-work/`, `perbandingan-september-2026.csv`, dan `tools/`.
- Belum ada tombol upload/preview/import customer yang diimplementasikan pada pekerjaan ini.
- Belum ada importer massal, test importer, atau build/typecheck untuk fitur baru ini.
- Belum ada commit/push/deploy fitur import.
- Belum ada customer/kendaraan produksi ditambah, diubah, atau dihapus oleh proses migrasi ini.
- Yang benar-benar dikerjakan: membaca kode, mengambil snapshot tabel customer/kendaraan live, membaca Excel, membuat script analisis dan CSV kandidat. Bukan implementasi aplikasi.
- Re-check git status sebelum mengedit. Jangan commit file data pelanggan/nomor telepon ke GitHub.

## Keputusan user yang sudah final
1. Customer satu master GLOBAL, dapat dipakai semua cabang.
2. Cabang pertama input hanya metadata asal input, bukan alasan membuat customer baru.
3. SEMUA customer termasuk Cakalang, Perintis, Mamuju, Hertasning, dan Umum ikut cakupan. User juga menyetujui semua kendaraan, tetapi implementasi kini prioritaskan CUSTOMER.
4. Kategori Accurate tetap KATEGORI customer, BUKAN `branchId`/`firstSeenBranchId`.
5. Nomor telepon kunci pencocokan. Nama sama + telepon berbeda jangan digabung. Nama sedikit berbeda + telepon sama adalah kandidat customer yang sama; jangan otomatis menimpa nama yang sangat berbeda/ambigu.
6. Data existing jangan ditimpa/diubah diam-diam. Existing match di-skip dan diaudit; konflik masuk review.
7. File Excel asli harus tetap utuh; semua pemrosesan pada salinan/hasil terpisah.
8. Untuk kendaraan: Keterangan faktur sumber utama nopol/model; Customer ID Accurate hanya referensi audit, bukan sumber nopol final.
9. Jangan menyamakan instruksi semua master customer/kendaraan dengan import seluruh transaksi/stok Hertasning. Scope master dan transaksi berbeda.
10. Bangun dan uji lokal dulu. Jangan melakukan import produksi sebagai bagian tes, jangan deploy/commit/push tanpa instruksi.

## Sumber data
File sumber customer:
`C:\Users\axlfo\AppData\Local\hermes\attachments\daftar-pelanggan drac.xlsx`
Sheet: `Daftar Pelanggan`. Kolom penting: `No.`, `Kategori`, `ID Pelanggan`, `Nama`, `Kontak`, `No. Telp. Bisnis`, `Handphone`, `Email`, `Alamat Penagihan`, `Default Deskripsi`.

Faktur untuk kendaraan/histori:
`C:\Users\axlfo\AppData\Local\hermes\attachments\rincian_faktur_penjualan_dokteracmobil_260914210103 ver2.xlsx`
Arsip tersedia juga dalam `migration-work/01-raw/`.

Hasil kerja:
`migration-work/04-rekonsiliasi-final/`
- `customer-import-candidate-all.csv`: 913 baris; header `accurate_id,name_clean,phone,customer_category`.
- `cerdik-customers.json`: snapshot tabel HTML 167 customer. BUKAN response API terstruktur; kolom nama tercampur avatar/kode/customer company.
- `customer-compare-final.csv`: 11 baris match exact digit telepon, semua diberi status nama beda oleh parser lama.
- `customer-name-correction.csv`: 11 baris, BELUM layak dijadikan daftar update otomatis.
- `customer-perlu-dibuat.csv`: 902 kandidat dari selisih telepon setelah dedup awal. BUKAN daftar final tervalidasi.
- `dry-run-summary.json`: hitungan file saja, BUKAN dry-run endpoint/importer.
- `import-manifest.json`: metadata saja, status READY_FOR_VALIDATED_IMPORT tidak didukung validasi lengkap.
- `customer-operasional-cakalang-perintis-mamuju.csv` dan `customer-arsip-hertasning.csv`: hasil split lama; bukan lagi batas scope master.
Hasil `04-rekonsiliasi`, `-v2`, `-v3` juga ada; beberapa customer CSV kosong akibat parser lama. Jangan gunakan sebagai input final.

Snapshot kendaraan lama:
`C:\Users\axlfo\AppData\Local\hermes\cache\browser-use\workspace\20260912_234434_4bcdb2\vehicles.json`
182 baris saat dibaca; perlu refresh jika membandingkan produksi. Browser session Hermes bernama `cerdik-compare` tidak otomatis dapat dipakai Codex. Jangan mengekstrak credential/token.

## Masalah kualitas data / klaim lama yang harus dikoreksi
- Parser lama openpyxl menghasilkan 0 meskipun nilai ada. Pembacaan XML berhasil dengan dukungan `inlineStr`, shared strings, dan nilai biasa; gunakan alamat sel untuk posisi kolom, bukan urutan cell array. Validasi kelengkapan workbook/dimensi, jangan asumsikan semua master terekspor (mungkin batas export).
- 913 adalah unique string telepon setelah script memilih `setdefault(phone, row)`; bukan bukti 913 identitas customer valid. Duplikat, kategori alternatif, ID tambahan, dan konflik dibuang diam-diam oleh script lama.
- Klaim dry-run '0 duplikat' salah metodologi: menghitung file yang SUDAH dedup. Rehitung dari raw sebelum dedup.
- Klaim '11 nama perlu dikoreksi' tidak sah. Contoh CSV aktual: nama Accurate `ABD AZIS 081354936354` dibandingkan string DOM `A  ABD AZIZ  PLG-288`. Avatar, kode PLG, nomor di nama, dan spasi menyebabkan false mismatch. Pisahkan field asli sebelum perbandingan.
- Telepon lama hanya strip non-digit, belum normalisasi format +62/62/0, multi-nomor, placeholder, panjang tidak wajar. Jangan memperbaiki digit typo secara otomatis. Nomor `0800000000` berulang tampak placeholder, tidak boleh menggabungkan banyak orang menjadi satu.
- Ada konflik telepon dalam NAMA versus kolom Handphone. Contoh sumber: ABDIL nama berisi `081207533379`, Handphone `081287533379`. Pertahankan dua sumber dan flag konflik.
- Pembersihan nama lama membuang SEMUA isi []/(), dapat menghilangkan informasi sah. Gunakan pembersihan konservatif, simpan nama asli.
- 554 kandidat nopol / 16 match / 538 missing berasal regex kasar dan bukan daftar kendaraan valid. Regex belum menangani plat khusus dan teks menempel dengan baik. Beberapa contoh match yang pernah diklaim di chat bukan hasil lookup tervalidasi.
- Script model kendaraan lama menggabungkan kolom tahun ke string model. Jangan gunakan CSV kendaraan sebagai payload produksi.
- `migration-work/README.txt` masih punya `exclude=Hertasning` dan operational_customer_branches tanpa Hertasning. Itu stale untuk MASTER; pisahkan scope transaksi/stok dengan scope master.
- `import-manifest.json` menunjuk `vehicle-compare.csv` relatif di folder final, padahal file ada di folder lama; perbaiki bila digunakan.
- Jangan membuat kategori cuma di CSV lalu mengklaim tersimpan di aplikasi: pada tipe/API customer yang telah dibaca belum terlihat field category.

## Kode yang sudah dibaca / titik integrasi
- `src/pages/Customers.tsx`: halaman customer, export CSV, permission `customer:create`, toolbar sekitar 251-257; belum ada import UI.
- `src/types/index.ts`: Customer sekitar 37-52, ada branchId dan firstSeenBranchId, belum ada category pada versi dibaca.
- `src/lib/apiClient.ts`: generic `get/create/update/remove`; pola request terautentikasi via client existing. Jangan duplikasi auth/ambil token.
- `src/context/AppContext.tsx`: addCustomer sekitar 442, addVehicle sekitar 412. Trace error propagation sebelum reuse.
- `api/index.php`: routing customers/vehicles sekitar 186/197; telusuri permission/middleware terlebih dahulu.
- `api/endpoints/customers.php`: GET global; POST butuh nama+phone (company exception), cek duplicate digit phone, customer code PLG otomatis, branch akses valid, transaksi membuat customer+people+roles+audit. PUT mengubah banyak field dan tidak cocok dipakai sebagai overwrite parsial sembarangan.
- `api/endpoints/vehicles.php`: merek/model/warna wajib valid di catalog, customer existing, duplicate plate, valid branch. Tidak relevan sebagai blocker untuk menyelesaikan CUSTOMER dahulu.
- `api/endpoints/transaction-backup.php` serta client previewTransactionRestore/importTransactionRestore: ada jalur restore transaksi lain. Periksa bila reusable, jangan mengklaim semua bulk API absent tanpa inspect.
- Script lama: `tools/analyze_accurate_export.py`, `tools/compare_customer_vehicle.py`, `tools/split_hertasning.py`, `tools/split_operational_branches.py`, `tools/compare_september.py`.

## Deliverable fitur customer yang diminta
1. Tombol Import Customer di halaman Pelanggan, permission sesuai pola project.
2. Upload CSV/Excel sesuai dependensi proyek (cek package.json, jangan mengasumsikan library). Template unduhan dan format/header yang jelas; dukung file kandidat dan export Accurate dengan mapping field yang dapat ditinjau.
3. Preview tanpa penulisan: raw row number, nama asli/bersih, telepon asli/normalized, kategori, status baru/existing/duplikat/konflik/invalid dan alasan.
4. Kategori persist end-to-end sebagai kategori customer, bukan branch. Tentukan schema/migration sesuai bootstrap proyek dan pertahankan kategori/audit asal dengan tidak membuang variasi saat dedup.
5. Cabang pertama input pilih dari cabang accessible/default konteks import, BUKAN inferred dari kategori Accurate. Pertahankan cabang existing saat skip.
6. Validasi server-side, authorization, ukuran/batas row, duplicate checking dan retry/idempotency; cegah race duplicate saat import bersamaan. Jangan hanya validasi browser.
7. Eksekusi import dengan progress dan hasil setiap baris. Existing tidak diubah. Kegagalan/timeout tidak boleh dianggap berhasil; retry harus aman, tidak membuat duplikat. Bisa batch transaction atau checkpoint yang jelas, tidak wajib all-or-nothing seluruh workbook bila laporan recovery benar.
8. Laporan berhasil/skip/gagal yang dapat diunduh; verifikasi read-back data yang ditulis sebelum klaim sukses. Jangan otomatis submit setelah upload.
9. Uji parser, klasifikasi, duplikat, nama sama/telp beda, format nomor, placeholder/missing, category persistence, permission/cabang, retry, failure dan UI integration.
10. Jalankan typecheck, scoped tests, build, diff --check dan backend tests yang tersedia; laporkan yang belum bisa dijalankan secara jujur. Lakukan smoke test UI lokal dengan fixture jelas tanpa data produksi.

## Lingkungan dan verifikasi
Windows, repo npm React/TS + PHP API. Shell Hermes adalah git-bash (bukan PowerShell). Pakai native path D:/... untuk node/python/git. Python tersedia sebagai `python`.
Canonical commands: `npm run typecheck`, `npm run build`, `npm run check`, scoped `node --test tests/<relevant>.test.mjs`.
Sebagian full tests memerlukan PHP/MySQL; inspect toolchain aktual. Jangan mengklaim gagal environment sebagai regresi atau mengklaim backend test pass bila tidak dijalankan.
Tidak ada test import baru yang sudah dijalankan pada sesi sebelumnya.

## Mulai di sini
Re-read AGENTS/project instructions dan git status, package.json, Customers.tsx, customer endpoint/bootstrap/permissions. Implementasikan fitur customer + tests, gunakan RAW sebagai dasar analisis ulang. Jangan berhenti setelah membuat rencana atau mengulang pertanyaan user. Akhir pekerjaan harus menjelaskan file/perilaku yang diubah, output test, batasan data, dan status lokal vs deploy vs import produksi secara terpisah.
