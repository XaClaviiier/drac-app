# Import Customer

## Alur

Pelanggan → Import Customer → pilih CSV/XLSX → periksa pemetaan → pilih cabang pertama input → Preview tanpa menyimpan → tinjau status dan centang konfirmasi → Import.

- Permission `customer:create` diperiksa oleh router dan endpoint, termasuk preview. Cabang harus aktif dan dapat diakses pengguna.
- Master tetap global. `customers.categories` menyimpan array kategori sumber; kedua API pembaca customer mengembalikannya sebagai array. Kategori tampil di daftar desktop/mobile dan dapat dicari. Cabang berasal dari pilihan pengguna.
- Template mendukung `name,phone,customer_category,accurate_id,email,address,business_phone,contact,description`. Export Accurate memakai sheet `Daftar Pelanggan`; pemetaan otomatis bisa ditinjau/diubah. CSV kandidat lama tetap dapat dibaca, tetapi data yang telah dibuang oleh dedup lama tidak bisa dipulihkan dari CSV itu.
- Maksimal file/payload 8 MB dan 5.000 baris. Nama tersimpan maksimal 100 karakter, email 100, kategori per sumber 150. XLS lama, formula/error Excel, header duplikat dan baris rusak ditolak. Nomor baris mengikuti baris workbook atau record CSV (record quoted multiline tetap satu baris data).
- Pembaca XLSX menggunakan alamat sel aktual, termasuk file dengan dimension `A1` yang keliru, shared strings, inline strings, dan kolom kosong.

## Pencocokan dan audit

- Format `+62`/`62` dinormalisasi ke `0`; spasi, tanda hubung, titik dan kurung pada nomor dapat dinormalisasi. Prefix hilang, placeholder, nomor terlalu pendek/panjang atau multi-nomor tidak ditebak.
- Nama dibersihkan konservatif: hanya token telepon yang valid dibuang dan spasi dirapikan. Isi kurung/bracket tetap dipertahankan.
- Nama sama, telepon berbeda menghasilkan identitas berbeda. Telepon sama, nama berbeda (termasuk ejaan mirip) masuk konflik untuk review. Nama/nomor existing tidak pernah ditimpa.
- Nomor dalam nama yang berbeda dari Handphone, atau telepon bisnis berbeda/tidak valid, ditahan. Satu baris bermasalah pada kelompok nomor yang sama menahan seluruh kelompok.
- Duplikat identik membuat satu customer; kategori alternatif digabung. Semua baris asli, ID Accurate, kontak, deskripsi, kategori, email, alamat, hasil dan alasan disimpan dalam `customer_import_runs.result_json`, termasuk existing/invalid/konflik. Data tambahan tersebut adalah audit sumber, bukan otomatis kontak/perusahaan baru.
- Snapshot HTML/DOM lama tidak digunakan untuk pencocokan. Preview menggunakan field terstruktur dari database API yang sedang dipakai aplikasi.

## Penyimpanan dan recovery

- Bootstrap versi `api_support_20260915_customer_import_v1` menambahkan kolom kategori dan tabel audit import. Tidak perlu menjalankan SQL dari browser.
- Preview hanya melakukan klasifikasi/SELECT; penyiapan skema mengikuti bootstrap API proyek.
- Eksekusi menggunakan satu transaksi untuk customer, orang/PIC, peran, dan laporan. Konflik/invalid/existing di-skip. Kesalahan penyimpanan membatalkan transaksi.
- Named lock `customer_code_sequence` digunakan saat klasifikasi ulang dan insert. POST/PUT customer biasa memakai lock yang sama dan pemeriksaan nomor ternormalisasi. Dua import bersamaan tidak membuat customer ganda; preview yang berubah harus diulang.
- Digest mengikat hasil preview, sumber dan cabang. ID percobaan + hash payload disimpan atomik; retry ID/payload sama mengembalikan hasil yang sama. ID sama dengan payload/pengguna berbeda ditolak.
- Customer yang dibuat dibaca ulang sebelum dan sesudah commit, termasuk kategori, nama, nomor, alamat, email dan cabang asal. Respons sukses hanya sesudah verifikasi.
- Request browser dibatasi 120 detik. Koneksi putus/timeout bukan sukses atau bukti rollback; dialog mempertahankan payload dan ID untuk tombol **Coba ulang aman / verifikasi hasil**. Jangan menutup tab sebelum recovery selesai. Laporan saat hasil belum diketahui memakai `executionState=unverified`, bukan klaim berhasil.
- Setelah sukses, daftar direfresh; gagal refresh dilaporkan terpisah. Laporan CSV per baris dapat diunduh, dengan proteksi formula CSV. Tidak ada upload yang otomatis memulai import.

## Pengujian lokal

Unit/parser (PHP harus ada di PATH atau `PHP_BINARY`):

```powershell
node --test tests/customer-import.test.mjs
```

Persistence menggunakan MySQL **disposable**, bind `127.0.0.1`, port selain 3306, root tanpa password khusus fixture. Jangan arahkan ke instance bisnis: fixture menyiapkan ulang tabel dalam database `drac_customer_import_test`.

```powershell
$env:CUSTOMER_IMPORT_TEST_PORT='33317'
node --test tests/customer-import-db.test.mjs
```

Smoke UI memakai halaman Customers dan importer asli, context/aktor sintetis, PHP endpoint asli serta helper permission/cabang asli; tidak memuat konfigurasi/kredensial aplikasi atau produksi. Memerlukan Playwright dengan Chrome dan port 5178/8187 kosong:

```powershell
$env:CUSTOMER_IMPORT_UI_TEST='1'
$env:PLAYWRIGHT_MODULE='path-ke-modul-playwright'
node --test tests/customer-import-ui.test.mjs
```

Jalankan tes database dan smoke UI secara terpisah: keduanya mereset fixture database yang sama. `npm run check` tanpa flag UI menjalankan suite biasa; suite MySQL dilewati jika port fixture belum disediakan. Lengkapi dengan `npm run build`, PHP lint dan `git diff --check`.

## Batas hasil

Import tidak memperbaiki konflik otomatis atau mengimpor kendaraan/transaksi. Lengkap membaca workbook tidak membuktikan ekspor Accurate mencakup semua customer; jumlah tepat kelipatan 1.000 ditandai di UI. Validasi terhadap database produksi memerlukan preview di lingkungan tujuan saat pengguna memang siap; pekerjaan lokal tidak melakukannya.
