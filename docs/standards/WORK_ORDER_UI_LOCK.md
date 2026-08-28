# Standar Terkunci Modul Work Order

Versi standar: `wo-canonical-2026-08-26`

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
- Tampilan HP tetap responsif dan tidak mengubah alur transaksi.

## Kontrak alur

- Perubahan visual tidak boleh mengubah status, stok, faktur, pembayaran, timeline, atau hak akses.
- WO lintas cabang atau tanpa izin edit tetap menggunakan kanvas yang sama dalam keadaan baca saja.
- Setiap perubahan pada standar WO harus disengaja, menaikkan versi standar, memperbarui dokumen ini, dan lulus seluruh pengujian regresi.

## Pemeriksaan wajib

Jalankan `npm run check` dan `npm run build`. Tes `modul WO dikunci pada kontrak tampilan kanvas baku` harus tetap lulus sebelum perubahan dipublikasikan.
