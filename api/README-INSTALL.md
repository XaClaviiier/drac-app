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

Untuk database yang sudah berjalan, lakukan backup lalu jalankan migrasi berikut
secara berurutan:

1. `database/migrate_updates.sql`
2. `database/migrate_wo_workflow.sql`
3. `database/migrate_settings.sql`
4. `database/migrate_relational_integrity.sql`

Migrasi terakhir menambahkan foreign key, stok per cabang, dan sequence nomor
dokumen. Jangan menjalankannya sebelum tiga migrasi sebelumnya selesai.
5. Klik **"Go"** → Sukses!

Cek: Di panel kiri akan muncul **18 tabel** (branches, users, items, dll)

---

### **STEP 3: Atur Konfigurasi Rahasia**

Atur environment server berikut (lihat juga `.env.example`):

```text
DRAC_DB_HOST
DRAC_DB_NAME
DRAC_DB_USER
DRAC_DB_PASS
```

Jangan menulis password database di repository. Workflow deployment tidak
menimpa `api/config.php` milik server agar konfigurasi hosting tetap terjaga.

---

### **STEP 4: Upload File ke cPanel**

Struktur folder di `public_html/` harus jadi seperti ini:

```
public_html/
├── index.html          ← Frontend (dari dist/index.html)
├── .htaccess           ← Config routing (dari dist/.htaccess)
└── api/
    ├── index.php
    ├── config.php      ← Membaca environment server
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
  "password": "PASSWORD_AKUN_UJI"
}
```

---

### **STEP 6: Uji Frontend dan API**

Frontend sudah menggunakan API relatif `/api`. Login, buka setiap modul, kemudian
jalankan skenario pada `docs/GO_LIVE_CHECKLIST.md` sebelum digunakan untuk transaksi nyata.

---

## 🔒 KEAMANAN (PENTING!)

### Sebelum dipakai untuk operasional:

1. **Rotasi password database dan akun awal**
2. **Aktifkan HTTPS** — wajib memakai SSL/Let's Encrypt
3. **Verifikasi session dan rate limit login**
4. **Batasi role serta cabang setiap pengguna**
5. **Backup database** — harian, serta uji restore berkala

---

## ❓ TROUBLESHOOTING

### ❌ 500 Internal Server Error
- Cek environment `DRAC_DB_*` dan akses user database.
- Cek versi PHP → minimal 7.4
- Cek error log di cPanel

### ❌ 404 Not Found saat akses `/api/...`
- Cek file `api/.htaccess` sudah ter-upload (aktifkan "Show Hidden Files")
- Cek mod_rewrite aktif → hubungi hosting provider

### ❌ CORS error dari browser
- Cek header origin pada `api/.htaccess` dan pastikan domain produksi yang dipakai.

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
