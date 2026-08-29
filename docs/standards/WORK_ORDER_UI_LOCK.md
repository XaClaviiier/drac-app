# Standar Terkunci Modul Work Order

Versi standar: `wo-canonical-2026-08-29`

Versi editor rincian: `wo-item-editor-accurate-2026-08-29`

Dokumen ini menetapkan tampilan dan perilaku Work Order yang aktif saat ini sebagai patokan baku. Penguncian ini tidak membatasi hak akses pengguna. Tujuannya mencegah perubahan tampilan WO secara tidak sengaja saat modul lain diperbaiki.

## Kontrak tampilan

- WO baru, WO yang dibuka, dan WO yang diedit memakai kanvas `Data Baru` yang sama.
- Baris identitas tetap berisi Pelanggan dan Kendaraan di kiri, serta Tanggal, waktu, Ambil, dan Proses di kanan.
- Baris Keluhan berada di bawah identitas tanpa mengubah ukuran field baku.
- Tab dokumen samping menyatu dengan lembar putih dan selalu mulai dari `Rincian`.
- Favorit tertutup secara default dan tertutup kembali saat kehilangan fokus.
- Tabel rincian selalu tampil, termasuk ketika belum ada layanan.
- Panel Sub Total, Diskon, dan Total berada terpisah di bawah kanan tabel.
- Rel aksi kanan mempertahankan urutan Simpan, Cetak, Lampiran, Lain-lain, dan Hapus.
- Warna kanvas, tabel, border, bayangan, jarak, dan ukuran kontrol mengikuti tampilan WO yang telah disetujui.
- Tampilan desktop tidak boleh menambah scroll halaman karena header atau rel aksi bergeser.
- Tab Pembayaran merapatkan ringkasan menjadi dua kolom pada desktop pendek, menyediakan scroll internal pada layar sangat pendek, dan membatasi tinggi daftar riwayat pembayaran agar semua informasi tetap dapat dijangkau.
- Tampilan HP tetap responsif dan tidak mengubah alur transaksi.

Perubahan standar 29 Agustus 2026 disetujui Owner untuk memperbaiki tab Pembayaran yang terpotong pada layar pendek/zoom besar. Perubahan dibatasi pada kepadatan dan scroll internal; alur serta data transaksi tidak berubah.

## Kontrak editor rincian barang/jasa

Status bagian ini: **TERKUNCI**. Sebelum mengubah struktur, urutan informasi, ukuran, perilaku tab, atau aturan data di bawah ini, wajib meminta dan memperoleh konfirmasi eksplisit dari Owner/pemilik aplikasi. Tanpa konfirmasi tersebut, perubahan harus dihentikan.

- Modal mempertahankan lebar `max-w-xl`, header biru, footer tindakan, serta dua tab aktif: `Rincian` dan `Info lainnya`.
- Tab `Rincian` mempertahankan urutan Kode, Nama Barang/Jasa, Keterangan baris, Kuantitas dan Satuan, Harga, lalu Total Harga.
- Lebar label adalah 112 px pada layar kecil dan 168 px pada desktop; lebar Satuan 96 px; kontrol utama setinggi 36 px (`h-9`).
- Nama Barang/Jasa berasal dari master dan bersifat hanya baca. Field yang dapat mengubah deskripsi transaksi adalah `Keterangan baris`.
- Kuantitas hanya bilangan bulat, minimum satu. Satuan berasal dari master dan tidak boleh dibuat seolah-olah tersimpan pada baris WO lama.
- Tab `Info lainnya` mempertahankan Barcode, Jenis/Kategori, Gudang/Stok, Penjual/Teknisi, Kecocokan Kendaraan, dan Isi Paket.
- Barcode, kategori, satuan, stok, dan kecocokan kendaraan diberi konteks sebagai data Master Barang & Jasa saat ini.
- Gudang pada WO hanya informasi baca: gudang pengeluaran stok dipilih saat membuat faktur. Jangan menambahkan input gudang semu pada baris WO.
- Isi Paket memakai baris komponen historis yang tersimpan pada WO, bukan menggantinya diam-diam dengan susunan paket master terbaru.
- Tampilan dan perilaku yang sama berlaku pada desktop dan HP.

Tes pengunci editor rincian tidak boleh dihapus, dilonggarkan, atau diperbarui hanya untuk melewati kegagalan. Setelah Owner menyetujui perubahan, catat alasan dan tanggal persetujuan di dokumen ini, naikkan versi editor rincian, lalu perbarui tes dan implementasi secara bersamaan.

## Kontrak alur

- Perubahan visual tidak boleh mengubah status, stok, faktur, pembayaran, timeline, atau hak akses.
- WO lintas cabang atau tanpa izin edit tetap menggunakan kanvas yang sama dalam keadaan baca saja.
- Setiap perubahan pada standar WO harus disengaja, menaikkan versi standar, memperbarui dokumen ini, dan lulus seluruh pengujian regresi.

## Pemeriksaan wajib

Jalankan `npm run check` dan `npm run build`. Tes `modul WO dikunci pada kontrak tampilan kanvas baku` dan `editor rincian layanan WO terkunci dan wajib dikonfirmasi sebelum berubah` harus tetap lulus sebelum perubahan dipublikasikan.
