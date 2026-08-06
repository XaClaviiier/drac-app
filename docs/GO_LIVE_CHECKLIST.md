# Checklist Go-Live Dokter AC Mobil

## 1. Rahasia dan keamanan

- Rotasi password database hosting sebelum deploy berikutnya.
- Atur `DRAC_DB_HOST`, `DRAC_DB_NAME`, `DRAC_DB_USER`, dan `DRAC_DB_PASS` pada
  environment server. Gunakan `.env.example` hanya sebagai daftar variabel.
- Pastikan HTTPS aktif, CORS hanya mengizinkan domain aplikasi, dan akun owner
  memakai password baru yang kuat.
- Periksa role setiap pengguna, cabang yang diizinkan, jam login, dan sesi aktif.

## 2. Backup sebelum deploy

- Export database lengkap melalui phpMyAdmin/DirectAdmin dalam format SQL.
- Simpan salinan folder `public_html` yang sedang aktif.
- Beri nama backup dengan waktu WITA, misalnya
  `drac-before-release-2026-08-06-1430-WITA.sql`.
- Jangan lanjut deploy sebelum file SQL dapat dibuka dan berisi struktur serta data.

## 3. Deploy

- Jalankan `npm ci`, `npx tsc --noEmit`, dan `npm run build`.
- Upload hasil `dist/` dan API. Workflow sengaja tidak menimpa
  `api/config.php` milik server.
- Buka `/api/info`, lalu login menggunakan akun pengujian non-owner.

## 4. Uji transaksi wajib

1. Register pelanggan dan kendaraan, lalu buat WO tanpa layanan.
2. Isi diagnosa, estimasi, Pending/Dikerjakan, dan Selesai.
3. Buat faktur dari WO; pastikan identitas pelanggan/kendaraan terkunci.
4. Tambah/kurangi item faktur dan pastikan hanya faktur yang memotong stok.
5. Catat pembayaran Tunai dan Transfer; hapus pembayaran dan pastikan faktur
   kembali terutang.
6. Hapus faktur uji dan pastikan stok serta status WO kembali benar.
7. Buat penerimaan barang, faktur pembelian, pembayaran supplier, mutasi gudang,
   dan pembatalannya.
8. Periksa kas cabang, setoran belum disetor, setoran ke bank, laporan, dashboard,
   serta bonus kinerja.
9. Uji pengguna yang hanya memiliki satu cabang dan pastikan tidak dapat membaca
   atau mengubah data cabang lain melalui URL/API.
10. Uji sesi kadaluarsa dan batas jam login.

## 5. Rekonsiliasi awal

- Cocokkan saldo stok per gudang dengan stok fisik.
- Cocokkan kas tunai, rekening bank, piutang, hutang, dan setoran belum disetor.
- Periksa item berharga nol, stok negatif, pelanggan/kendaraan duplikat, serta
  transaksi migrasi sebelum laporan dijadikan dasar keputusan.
