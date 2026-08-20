# DOKUMENTASI PROGRAM DOKTER AC MOBIL

## 1. Ringkasan Program

**Dokter AC Mobil Management System** adalah aplikasi operasional bengkel AC mobil berbasis web. Aplikasi ini dirancang sebagai versi sederhana dari sistem bisnis seperti Accurate Online, tetapi disesuaikan khusus untuk kebutuhan bengkel AC mobil dan operasional multi-cabang.

Aplikasi mendukung tiga cabang:

1. **Cabang Perintis**
2. **Cabang Cakalang**
3. **Cabang Mamuju**

Program mencakup pengelolaan pelanggan, kendaraan, order kerja, barang dan jasa, stok, penerimaan barang, supplier, faktur penjualan, faktur pembelian, pembayaran, pengguna, hak akses, serta asisten AI menggunakan Groq.

---

## 2. Tujuan Program

Program dibuat untuk membantu bengkel dalam:

- Menyimpan data pelanggan dan kendaraan secara terpusat.
- Mencatat pemeriksaan, rekomendasi, estimasi, dan pengerjaan kendaraan.
- Mengelola pekerjaan bengkel menggunakan Order Kerja atau WO.
- Mengelola barang, sparepart, jasa, paket, dan stok.
- Membuat faktur penjualan dari Order Kerja.
- Mencatat penerimaan barang dari supplier.
- Membuat faktur pembelian dan pembayaran hutang supplier.
- Memantau pendapatan, piutang, hutang, dan aktivitas setiap cabang.
- Mengatur akses pengguna berdasarkan jabatan.
- Menggunakan AI untuk pencarian data, pengecekan harga, stok, dan pembuatan WO.

---

## 3. Teknologi yang Digunakan

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- React Router
- Lucide React Icons
- read-excel-file untuk import Excel `.xlsx` dan parser bawaan untuk CSV

### Backend Opsi A

- PHP Native
- REST API berbasis JSON
- PDO MySQL
- Apache `.htaccess` untuk routing API

### Database

- MySQL atau MariaDB
- Cocok digunakan pada hosting DirectAdmin atau cPanel

### AI

- Groq API
- Model yang tersedia di antarmuka:
  - Llama 3.3 70B
  - Llama 3.1 8B
  - GPT-OSS 120B

---

## 4. Arsitektur Sistem

```text
Browser Pengguna
       |
       v
Frontend React
       |
       | HTTP/JSON
       v
Backend PHP Native
       |
       | PDO MySQL
       v
Database MySQL/MariaDB
```

Pada server produksi, struktur folder yang disarankan:

```text
public_html/
|-- index.html
|-- .htaccess
`-- api/
    |-- index.php
    |-- config.php
    |-- .htaccess
    `-- endpoints/
```

Frontend mengakses API pada URL relatif `/api` sehingga frontend dan backend dapat ditempatkan pada domain yang sama.

---

## 5. Modul Program

### 5.1 Login dan Autentikasi

Fitur:

- Login menggunakan username dan password.
- Pengguna harus aktif agar dapat login.
- Data user terhubung dengan role dan cabang.
- Session pengguna frontend disimpan agar tetap login setelah refresh.
- Logout tersedia pada menu pengguna.

Tidak ada kredensial produksi yang boleh ditulis dalam dokumentasi atau repository.
Owner membuat akun operasional, mengatur role, cabang, jam login, dan mengganti
password awal sebelum aplikasi dipakai.

---

### 5.2 Dashboard

Dashboard menampilkan:

- Total pendapatan.
- Jumlah kendaraan.
- Jumlah pelanggan.
- Jumlah WO aktif.
- Faktur hari ini.
- Pendapatan hari ini.
- Piutang belum lunas.
- Faktur terbaru.
- Ringkasan setiap cabang.
- Pilihan cabang untuk Administrator atau Supervisor.

Administrator dapat memilih:

- Semua Cabang
- Cabang Perintis
- Cabang Cakalang
- Cabang Mamuju

---

### 5.3 Data Pelanggan

Fitur:

- ID pelanggan dibuat otomatis, contoh `PLG-001`.
- Tambah, edit, hapus, dan cari pelanggan.
- Data yang disimpan:
  - Nama
  - Nomor telepon
  - Email
  - Alamat
  - Cabang pendaftaran
- Data pelanggan bersifat global dan dapat ditemukan dari semua cabang.
- Setiap pelanggan menampilkan jumlah kendaraan, WO, dan faktur.

Kode dan nomor telepon dapat digunakan oleh Asisten AI untuk mencari data pelanggan.

---

### 5.4 Register Kendaraan

Fitur:

- Tambah, edit, hapus, cari, dan filter kendaraan.
- Data kendaraan:
  - Nomor plat
  - Merek
  - Model
  - Tahun
  - Warna
  - Pemilik
  - Telepon
  - Alamat
  - Catatan
- Data kendaraan bersifat global dan dapat ditemukan dari semua cabang.
- Kendaraan terhubung dengan pelanggan.
- Kendaraan baru dapat dibuat langsung dari form Order Kerja.

---

### 5.5 Order Kerja

Order Kerja menggunakan alur operasional berikut:

1. **Diagnosa** (mobil masuk/register)
2. **Pending** atau **Dikerjakan** setelah hasil diagnosa
3. **Selesai** dan siap dibuatkan faktur
4. **Invoiced/Dibayar** mengikuti faktur dan pembayaran

#### Diagnosa

- Pemeriksaan awal kendaraan.
- Pengecekan diberikan gratis.
- Teknisi mencatat keluhan dan hasil pemeriksaan.
- Sistem menyimpan rekomendasi serta estimasi harga.
- Jika pelanggan belum setuju, WO dipindahkan ke Pending beserta alasannya.

#### Dikerjakan

- Digunakan setelah pelanggan menyetujui estimasi.
- Barang, sparepart, dan jasa masih dapat ditambahkan.
- Qty, harga satuan, harga paket, dan keterangan dapat diubah.
- Komponen paket dapat memiliki harga nol karena sudah termasuk harga paket.

#### Selesai

- Pekerjaan sudah selesai.
- Total akhir sudah diketahui.
- WO siap dibuatkan faktur.

#### Invoiced/Dibayar

- Faktur sudah dibuat dan pembayaran telah dicatat.
- Stok barang persediaan dipotong pada tahap akhir melalui proses faktur.

#### Filter WO

- Toggle **Hari Ini**:
  - ON: hanya WO hari ini.
  - OFF: semua tanggal atau mengikuti range tanggal.
- Toggle cabang mengikuti dropdown cabang pada header:
  - ON: hanya WO cabang yang dipilih.
  - OFF: seluruh cabang aktif.
- Filter range tanggal:
  - Dari Tanggal
  - Sampai Tanggal
  - 7 Hari Terakhir
  - Bulan Ini
  - Reset
- Filter status dan pencarian nomor WO, pelanggan, atau plat.

---

### 5.6 WO Lintas Cabang

Jika kendaraan diperiksa di satu cabang tetapi dilanjutkan di cabang lain, sistem tidak memindahkan WO lama. Sistem membuat WO baru di cabang tujuan.

Contoh:

1. Kendaraan diperiksa di Cakalang.
2. WO Cakalang berada pada status Pengecekan.
3. Perintis memilih **Lanjutkan di Sini**.
4. Sistem membuat WO baru di Perintis dengan status Proses.
5. Data pelanggan, kendaraan, keluhan, hasil pemeriksaan, rekomendasi, dan estimasi disalin.
6. WO Cakalang ditandai:

```text
Sudah dilanjutkan di WO-P-2026-xxx (Cabang Perintis)
```

Dengan metode ini:

- Tanggung jawab setiap cabang tetap jelas.
- Stok dipotong dari cabang penyelesai.
- Faktur menggunakan prefix cabang penyelesai.
- WO pemeriksaan awal tidak ditagih dua kali.

---

### 5.7 Barang dan Jasa

Jenis item:

- Persediaan
- Jasa
- Non Persediaan
- Group atau Paket

Data item:

- Kode
- Nama
- Jenis
- Kategori
- Merek
- Satuan
- Stok
- Harga beli
- Harga jual
- Status aktif
- Layanan Cepat
- Keterangan

Fitur:

- Tambah, edit, hapus, dan cari item.
- Filter jenis, kategori, merek, dan status aktif.
- Harga jual dapat diubah saat digunakan pada WO.
- Barang atau jasa baru dapat dibuat langsung dari form WO.
- Item dapat ditandai sebagai Layanan Cepat agar muncul sebagai shortcut WO.

---

### 5.8 Group atau Paket

Group menggabungkan beberapa barang atau jasa menjadi satu paket.

Fitur:

- Tambah beberapa item ke dalam paket.
- Atur qty setiap komponen.
- Atur harga setiap komponen, termasuk harga nol.
- Atur harga satu paket secara terpisah.
- Pada WO, paket menampilkan:
  - Baris paket dengan harga paket.
  - Baris komponen sebagai rincian.
  - Komponen dapat memiliki harga nol.
- Stok komponen persediaan tetap dapat dipotong sesuai qty.

---

### 5.9 Kategori Barang dan Jasa

Tersedia menu kategori khusus.

Fitur:

- Tambah, edit, hapus, dan cari kategori.
- Kode kategori harus unik.
- Nama kategori harus unik.
- Kategori menampilkan jumlah item yang menggunakannya.
- Kategori tidak dapat dihapus jika masih digunakan barang atau jasa.
- Jika penghapusan ditolak, sistem menampilkan daftar item yang masih menggunakan kategori.

---

### 5.10 Import dan Export Barang/Jasa

Aplikasi mendukung:

- CSV
- TXT
- XLS
- XLSX
- File export Barang & Jasa dari Accurate Online

Auto-mapping Accurate Online:

| Kolom Accurate | Kolom Sistem |
|---|---|
| Kode Barang | Kode |
| Nama Barang | Nama |
| Jenis Barang | Jenis |
| Kategori Barang | Kategori |
| Merek Barang | Merek |
| Satuan | Satuan |
| Kts/Stok/Kuantitas | Stok |
| Harga Beli | Harga Beli |
| Harga Jual | Harga Jual |

Sistem menyediakan:

- Download template CSV.
- Upload Excel/CSV.
- Preview sebelum import.
- Validasi kode duplikat.
- Pembuatan kategori baru otomatis.
- Export data barang dan jasa ke CSV.

---

### 5.11 Faktur Penjualan

Fitur:

- Buat faktur manual.
- Buat faktur dari WO.
- Edit dan hapus faktur sesuai hak akses.
- Status Lunas dan Belum Lunas.
- Filter status, tanggal, pelanggan, kendaraan, dan cabang.
- Nomor faktur mengikuti cabang:

| Cabang | Prefix |
|---|---|
| Perintis | D- |
| Cakalang | C- |
| Mamuju | M- |

- Saat faktur dari WO dibuat, WO tetap Selesai dan ditautkan ke nomor faktur.
- Setiap barang Persediaan wajib memiliki Gudang Pengeluaran Stok.
- Modal faktur menampilkan kebutuhan dan saldo barang per gudang dengan indikator CUKUP atau KURANG.
- Stok barang persediaan dipotong dari gudang yang dipilih saat faktur dibuat; jasa tidak memengaruhi stok.
- Faktur tidak dapat dibuat bila stok kurang. Pengguna harus memilih gudang lain atau mencatat penerimaan, transfer, atau penyesuaian stok yang sah.
- Jika faktur dihapus, stok dikembalikan.

---

### 5.12 Supplier

Fitur:

- Kode supplier otomatis, contoh `SUP-001`.
- Tambah, edit, hapus, dan cari supplier.
- Data supplier:
  - Nama
  - Contact person
  - Telepon
  - Email
  - Alamat
  - Status aktif
- Supplier terhubung dengan penerimaan dan faktur pembelian.

---

### 5.13 Penerimaan Barang

Digunakan untuk mencatat barang yang diterima dari supplier.

Fitur:

- Nomor penerimaan otomatis per cabang:
  - `GR-P-...` untuk Perintis
  - `GR-C-...` untuk Cakalang
  - `GR-M-...` untuk Mamuju
- Input qty dan satuan tanpa harga.
- Barang yang belum ada dapat dibuat langsung dari formulir penerimaan dan otomatis masuk ke baris transaksi.
- Pembuatan cepat barang mewajibkan nama, kategori, satuan, serta minimal Merek Mobil atau `Universal / Semua Mobil`.
- Model/tipe, generasi, dan CC dipilih bertingkat dari Master Kendaraan bila kecocokan barang diketahui.
- Barang baru berstatus `Menunggu Verifikasi`; nama yang sudah ada harus memakai master lama agar stok tidak terpecah menjadi barang duplikat.
- Kesalahan validasi ditampilkan pada formulir dan tombol menampilkan status `Menyimpan...` selama proses berjalan.
- Status barang terpisah dari status faktur.
- Status barang:
  - Draft
  - Diterima
  - Batal
- Status faktur:
  - Belum
  - Sebagian
  - Sudah
- Stok bertambah saat status Diterima.
- Tombol View, Edit, Delete, Terima, dan Faktur.
- Detail penerimaan menampilkan:
  - Tanggal
  - Supplier
  - Surat jalan
  - Cabang
  - Penerima
  - Qty
  - Qty difakturkan
  - Sisa qty

---

### 5.14 Faktur Pembelian

Fitur:

- Membuat faktur dari penerimaan barang.
- Memilih penerimaan yang belum atau baru sebagian difakturkan.
- Input harga beli, diskon, pajak, dan jatuh tempo.
- Status:
  - Belum Lunas
  - Sebagian
  - Lunas
  - Batal
- Pembayaran dapat dilakukan penuh atau dicicil.
- Mendukung Kas, Transfer Bank, Cek, dan metode lain.
- Riwayat pembayaran ditampilkan pada detail faktur.
- Faktur pembelian terhubung kembali dengan nomor penerimaan barang.

---

### 5.15 Pengguna dan Hak Akses

Role awal:

- Administrator
- Supervisor
- Kasir
- Teknisi

Permission dapat diatur untuk setiap modul:

- View
- Create
- Edit
- Delete
- Payment
- All Branches

Menu otomatis disembunyikan jika pengguna tidak memiliki izin melihat modul.

---

### 5.16 Asisten AI Groq

Asisten AI terhubung dengan data bengkel.

Kemampuan:

- Menampilkan nama pelanggan dan nomor telepon.
- Menampilkan kendaraan milik pelanggan.
- Mencari kendaraan berdasarkan nomor plat.
- Menampilkan barang, kategori, harga, dan stok.
- Menampilkan riwayat WO dan faktur.
- Memberikan rekomendasi berdasarkan keluhan AC.
- Menampilkan rekap pendapatan, piutang, dan hutang.
- Menyusun dan membuat WO baru setelah konfirmasi pengguna.
- Membuat pelanggan atau kendaraan baru jika belum terdaftar.

Groq API key disimpan di browser pengguna. Untuk sistem produksi yang lebih aman, pemanggilan Groq sebaiknya dipindahkan ke backend agar API key tidak berada di browser.

---

## 6. Multi-Cabang

Data berikut bersifat global:

- Pelanggan
- Kendaraan

Data berikut tetap memiliki cabang transaksi:

- Order Kerja
- Faktur Penjualan
- Barang dan stok
- Penerimaan Barang
- Faktur Pembelian
- Pengguna

Administrator dan Supervisor dapat melihat semua cabang. Kasir dan teknisi hanya melihat cabang sesuai hak akses.

---

## 7. Tampilan Responsif

Program mendukung:

- Desktop
- Laptop
- Tablet
- Android
- iPhone

Pada desktop:

- Sidebar dapat diperkecil.

Pada perangkat mobile:

- Sidebar disembunyikan.
- Tombol hamburger tampil di header.
- Menu dibuka full-screen.
- Menu menggunakan grid ikon berbentuk doughnut.
- Terdapat kartu user, cabang, pendapatan hari ini, dan tombol logout.
- Form dan tabel memiliki tampilan responsif serta horizontal scroll jika diperlukan.

---

## 8. Struktur Database

Database utama terdiri dari tabel:

1. branches
2. roles
3. users
4. customers
5. vehicles
6. suppliers
7. item_categories
8. items
9. item_group_members
10. work_orders
11. work_order_services
12. sales_invoices
13. sales_invoice_items
14. goods_receipts
15. goods_receipt_items
16. purchase_invoices
17. purchase_invoice_items
18. purchase_payments

File schema:

```text
database/dokterac_schema.sql
```

File migrasi alur WO terbaru:

```text
database/migrate_wo_workflow.sql
```

---

## 9. Endpoint Backend PHP

Endpoint utama:

```text
POST   /api/login
GET    /api/all-data

GET/POST/PUT/DELETE /api/branches
GET/POST/PUT/DELETE /api/roles
GET/POST/PUT/DELETE /api/users
GET/POST/PUT/DELETE /api/customers
GET/POST/PUT/DELETE /api/vehicles
GET/POST/PUT/DELETE /api/suppliers
GET/POST/PUT/DELETE /api/item-categories
GET/POST/PUT/DELETE /api/items
GET/POST/PUT/DELETE /api/work-orders
GET/POST/PUT/DELETE /api/sales-invoices
GET/POST/PUT/DELETE /api/goods-receipts
GET/POST/PUT/DELETE /api/purchase-invoices
```

Backend berada di:

```text
api/
```

Installer otomatis berada di:

```text
api-installer.php
```

---

## 10. Deployment Hosting

### Build Frontend

```bash
npm install
npm run build
```

Hasil build:

```text
dist/index.html
dist/.htaccess
```

### Struktur Hosting DirectAdmin

```text
/domains/nama-domain/public_html/
|-- index.html
|-- .htaccess
`-- api/
    |-- index.php
    |-- config.php
    |-- .htaccess
    `-- endpoints/
```

### Instalasi Database

1. Buat database MySQL.
2. Buat user database.
3. Berikan semua privilege.
4. Import `database/dokterac_schema.sql` melalui phpMyAdmin.
5. Untuk database lama, jalankan `database/migrate_wo_workflow.sql`.
6. Atur environment `DRAC_DB_HOST`, `DRAC_DB_NAME`, `DRAC_DB_USER`, dan
   `DRAC_DB_PASS` di server. Jangan menyimpan password database di repository.

### Test API

```text
https://nama-domain/api/info
https://nama-domain/api/all-data
```

---

## 11. Mode Demo dan Produksi

Jika backend API tidak dapat diakses, aplikasi masuk ke **Demo Mode**.

Demo Mode:

- Menggunakan data contoh.
- Data hanya tersimpan sementara.
- Data hilang saat refresh.
- Banner peringatan tampil di aplikasi.

Production Mode:

- Data dibaca dari MySQL.
- Perubahan disimpan melalui PHP API.
- Data dapat digunakan lintas komputer dan cabang.
- Data tetap ada setelah browser ditutup atau refresh.

---

## 12. Catatan Keamanan Produksi

Sebelum aplikasi digunakan untuk operasional nyata, disarankan:

1. Gunakan HTTPS/SSL.
2. Ganti semua password awal dan nonaktifkan akun yang tidak dipakai.
3. Pastikan password user tersimpan sebagai hash.
4. Pastikan session server, pembatasan jam login, dan pencabutan sesi aktif.
5. Batasi CORS hanya ke domain aplikasi.
6. Jangan membagikan `api/config.php`.
7. Jangan menyimpan Groq API key pada repository publik.
8. Backup database setiap hari dan uji proses restore secara berkala.
9. Batasi akses phpMyAdmin.
10. Audit aktivitas edit/hapus untuk transaksi penting.

---

## 13. File Utama Program

```text
src/App.tsx
src/context/AppContext.tsx
src/types/index.ts
src/components/Layout.tsx
src/pages/
src/lib/apiClient.ts
src/lib/demoData.ts

api/
api-installer.php
database/dokterac_schema.sql
database/migrate_wo_workflow.sql
```

---

## 14. Status Program

Fitur utama frontend telah tersedia dan build produksi berhasil. Sistem sudah memiliki struktur backend PHP serta database MySQL untuk deployment Opsi A.

Sebelum go-live penuh, lakukan pengujian berikut:

- Login semua role.
- Hak akses setiap role.
- Tambah pelanggan dan kendaraan.
- Alur WO Pengecekan sampai Dibayar.
- WO lintas cabang.
- Potong dan pengembalian stok.
- Penerimaan barang.
- Faktur pembelian dan pembayaran.
- Import Excel Accurate Online.
- Asisten AI Groq.
- Tampilan Android dan desktop.
- Backup dan restore database.

---

## 15. Aturan Operasional Stok dan Gudang

1. `warehouse_stocks` adalah sumber saldo stok per gudang. Saldo cabang dan stok
   pada master barang merupakan hasil sinkronisasi.
2. Setiap penerimaan, faktur penjualan, transfer, penyesuaian, dan hasil stok
   opname yang diposting wajib membuat jurnal mutasi dengan nomor dokumen sumber.
3. Faktur penjualan mengurangi gudang penjualan yang dipilih. Gudang harus aktif,
   berada pada cabang faktur, dan diizinkan untuk penjualan.
4. Transfer dapat disimpan sebagai Draft. Saat dikirim, stok gudang asal berkurang;
   saat diterima, stok gudang tujuan bertambah. Penerimaan sebagian diperbolehkan.
5. Draft dapat dihapus. Transfer atau penyesuaian yang sudah diposting tidak
   dihapus langsung; gunakan pembatalan dengan alasan agar mutasi pembalik tercatat.
6. Gudang tidak dapat dinonaktifkan atau dipindahkan cabang apabila masih memiliki
   saldo, transfer terbuka, penerimaan Draft, atau stok opname yang belum selesai.
7. Hasil stok opname menyimpan versi saldo ketika penghitungan dimulai. Posting
   ditolak bila ada mutasi pada barang/gudang tersebut selama proses penghitungan.
8. Petugas yang ditunjuk mengisi hitungan, sedangkan persetujuan dan posting hanya
   dilakukan Owner atau role dengan izin `stock_opname:post`.
9. Kartu Stok dapat difilter per gudang. Saldo berjalan dihitung relatif terhadap
   gudang yang dipilih dan menampilkan nomor dokumen sumber.

## 16. Penutup

Dokter AC Mobil Management System dirancang sebagai pusat operasional bengkel multi-cabang. Data pelanggan dan kendaraan dapat digunakan bersama, sedangkan transaksi, stok, nomor dokumen, dan tanggung jawab pekerjaan tetap dapat dilacak berdasarkan cabang.

Dokumen ini menjadi ringkasan utama untuk pengguna, administrator, developer, dan pihak hosting yang akan melakukan instalasi atau pengembangan lanjutan.
