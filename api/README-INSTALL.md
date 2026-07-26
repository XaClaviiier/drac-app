# 🚀 PANDUAN INSTALL BACKEND API - DOKTER AC MOBIL

## ✅ Requirement Hosting cPanel:
- PHP 7.4 atau lebih baru (rekomendasi 8.0+)
- MySQL 5.7 atau MariaDB 10.3+
- mod_rewrite Apache (biasanya aktif default)
- ekstensi PDO_MySQL (biasanya aktif default)

---

## 📋 LANGKAH INSTALL (Ikuti Berurutan)

### **STEP 1: Buat Database di cPanel**

1. Login cPanel → cari **"MySQL® Databases"**
2. **Create New Database**:
   - Nama: `dokterac` (nanti jadi `username_dokterac`)
3. **Create MySQL User**:
   - Username: `admin`
   - Password: (bikin password kuat, catat!)
4. **Add User To Database**:
   - Pilih user + database → centang **ALL PRIVILEGES**

📝 **CATAT INFO INI**:
```
DB_NAME: username_dokterac
DB_USER: username_admin
DB_PASS: [password Anda]
```

---

### **STEP 2: Import Struktur Tabel**

1. Buka **phpMyAdmin** di cPanel
2. Klik nama database `username_dokterac` di panel kiri
3. Klik tab **"Import"**
4. Upload file: `database/dokterac_schema.sql`
5. Klik **"Go"** → Sukses!

Cek: Di panel kiri akan muncul **18 tabel** (branches, users, items, dll)

---

### **STEP 3: Edit File Konfigurasi**

Edit file `api/config.php` dan ganti bagian ini:

```php
define('DB_NAME', 'GANTI_NAMA_DATABASE');      // → username_dokterac
define('DB_USER', 'GANTI_USER_DATABASE');       // → username_admin
define('DB_PASS', 'GANTI_PASSWORD_DATABASE');   // → password Anda
```

---

### **STEP 4: Upload File ke cPanel**

Struktur folder di `public_html/` harus jadi seperti ini:

```
public_html/
├── index.html          ← Frontend (dari dist/index.html)
├── .htaccess           ← Config routing (dari dist/.htaccess)
└── api/
    ├── index.php
    ├── config.php      ← Sudah diedit sesuai DB Anda
    ├── .htaccess
    └── endpoints/
        ├── auth.php
        ├── branches.php
        ├── customers.php
        ├── items.php
        └── ... (dst)
```

**Cara Upload:**

**Opsi A: Compress dulu (Recommended)**
1. Di komputer, compress folder `api/` jadi file `api.zip`
2. Upload `api.zip` ke `public_html/` via File Manager
3. Klik kanan → **"Extract"** → Extract ke folder `api/`

**Opsi B: Upload file per file**
1. Di File Manager cPanel, masuk `public_html/`
2. Bikin folder baru `api/`
3. Masuk ke `api/`, upload:
   - `index.php`, `config.php`, `.htaccess`
4. Bikin folder `endpoints/` di dalam `api/`
5. Upload semua file `.php` dari folder `endpoints/`

---

### **STEP 5: Test Backend**

Buka di browser:
```
https://namadomain.com/api/info
```

Jika berhasil, akan muncul:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "app": "Dokter AC Mobil API",
    "version": "1.0.0",
    "endpoints": [...]
  }
}
```

Test load all data:
```
https://namadomain.com/api/all-data
```

Test login (via Postman/browser dengan tools DevTools):
```
POST https://namadomain.com/api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

---

### **STEP 6: Update Frontend untuk Pakai API**

Frontend perlu dimodifikasi untuk connect ke API ini. Perubahan yang perlu dilakukan:

1. Set base URL API di frontend
2. Ganti semua state management → fetch dari API
3. Setiap add/update/delete → panggil API endpoint

**Info ke saya jika ingin frontend disambungkan ke API ini**, saya akan modify kode React-nya.

---

## 🔒 KEAMANAN (PENTING!)

### Setelah semua jalan, upgrade keamanan:

1. **Hash Password** — Sekarang masih plain text. Update `auth.php` untuk pakai `password_verify()`
2. **Rate Limiting** — Batasi request per menit
3. **JWT Token** — Tambah auth token untuk session management
4. **Aktifkan HTTPS** — Wajib pakai SSL/Let's Encrypt
5. **Backup Database** — Setup cronjob untuk backup mingguan

---

## ❓ TROUBLESHOOTING

### ❌ 500 Internal Server Error
- Cek `api/config.php` → password DB benar?
- Cek versi PHP → minimal 7.4
- Cek error log di cPanel

### ❌ 404 Not Found saat akses `/api/...`
- Cek file `api/.htaccess` sudah ter-upload (aktifkan "Show Hidden Files")
- Cek mod_rewrite aktif → hubungi hosting provider

### ❌ CORS error dari browser
- Sudah di-handle di `.htaccess` dan `config.php`
- Jika masih error, whitelist domain spesifik di `config.php`

### ❌ Database connection failed
- Pastikan nama DB pakai prefix cPanel (username_)
- User sudah di-add ke database dengan ALL PRIVILEGES

---

## 📞 ENDPOINT LIST

### Authentication
- `POST /api/login` — Login user

### Master Data
- `GET|POST|PUT|DELETE /api/branches` — Cabang
- `GET|POST|PUT|DELETE /api/roles` — Role/Grup Akses
- `GET|POST|PUT|DELETE /api/users` — Pengguna
- `GET|POST|PUT|DELETE /api/customers` — Pelanggan
- `GET|POST|PUT|DELETE /api/vehicles` — Kendaraan
- `GET|POST|PUT|DELETE /api/suppliers` — Supplier
- `GET|POST|PUT|DELETE /api/items` — Barang & Jasa
- `GET|POST|PUT|DELETE /api/item-categories` — Kategori

### Transaksi
- `GET|POST|PUT|DELETE /api/work-orders` — Order Kerja
- `GET|POST|PUT|DELETE /api/sales-invoices` — Faktur Penjualan
- `GET|POST|PUT|DELETE /api/goods-receipts` — Penerimaan Barang
- `GET|POST|PUT|DELETE /api/purchase-invoices` — Faktur Pembelian
- `POST /api/purchase-invoices/{id}/payments` — Bayar Hutang

### Bulk Load
- `GET /api/all-data` — Load semua data sekaligus (untuk init app)

---

Semua sudah siap! 🎉 Ada pertanyaan atau butuh bantuan? Beri tahu saya!
