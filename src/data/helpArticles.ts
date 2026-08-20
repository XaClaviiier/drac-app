export type HelpSection = {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  rules?: string[];
};

export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  route?: string;
  sources?: Array<{ label: string; url: string }>;
  updatedAt: string;
  sections: HelpSection[];
};

export const helpCategories = [
  "Mulai Menggunakan",
  "Servis & WO",
  "Penjualan",
  "Pembelian",
  "Persediaan",
  "Kas & Bank",
  "Laporan",
  "Administrasi",
] as const;

export const helpArticles: HelpArticle[] = [
  {
    id: "pilih-cabang-dan-hak-akses",
    category: "Mulai Menggunakan",
    title: "Memilih Cabang dan Memahami Hak Akses",
    summary: "Cabang aktif menentukan lokasi transaksi dan data yang dapat dilihat pengguna.",
    keywords: ["cabang", "akses", "role", "semua cabang", "login"],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Tujuan", paragraphs: ["Gunakan cabang aktif agar transaksi, stok, kas, dan laporan tercatat pada lokasi yang benar."] },
      { title: "Cara pakai", steps: ["Pilih cabang dari pemilih cabang di bagian atas aplikasi.", "Gunakan Semua Cabang hanya untuk melihat gabungan data atau laporan.", "Sebelum membuat transaksi, pilih satu cabang tertentu."] },
      { title: "Aturan", rules: ["Pembuatan transaksi diblokir ketika posisi masih Semua Cabang.", "Menu dan tindakan mengikuti hak akses role pengguna.", "Pengguna hanya dapat membuka cabang yang diberikan kepadanya."] },
    ],
  },
  {
    id: "alur-order-kerja",
    category: "Servis & WO",
    title: "Alur Order Kerja dari Register sampai Selesai",
    summary: "Urutan operasional servis: Register, Dikerjakan, lalu Selesai atau Lost Sales.",
    keywords: ["wo", "order kerja", "register", "dikerjakan", "selesai", "servis"],
    route: "/workorders",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Alur kerja", steps: ["Buat WO dengan memilih pelanggan, kendaraan, keluhan, cabang, dan waktu kedatangan.", "Saat Register, lakukan pemeriksaan dan tambahkan layanan atau barang beserta estimasinya.", "Setelah pelanggan menyetujui pekerjaan dan harga, ubah menjadi Dikerjakan.", "Tambahkan pekerjaan aktual bila diperlukan, lalu tandai Selesai.", "Buat faktur berdasarkan pekerjaan dan barang final."] },
      { title: "Aturan", rules: ["Keluhan wajib dipilih sebelum WO dibuat.", "Status Dikerjakan memerlukan minimal satu layanan/barang dan estimasi lebih dari Rp0.", "WO tidak memotong stok. Stok barang berkurang ketika faktur penjualan dibuat.", "Status pekerjaan dan status pembayaran adalah dua hal terpisah."] },
    ],
  },
  {
    id: "lost-sales-dan-lanjutkan-wo",
    category: "Servis & WO",
    title: "Lost Sales dan Melanjutkan WO Lama",
    summary: "Catat pekerjaan yang tidak dilanjutkan tanpa kehilangan histori penawaran.",
    keywords: ["lost sales", "batal", "lanjutkan", "alasan"],
    route: "/workorders",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buka WO yang tidak dilanjutkan.", "Pilih Batalkan atau Lost Sales.", "Pilih alasan dan isi catatan jika diwajibkan.", "Untuk masalah yang sama di kemudian hari, gunakan tindakan Lanjutkan dari WO lama."] },
      { title: "Aturan", rules: ["WO yang sudah mempunyai faktur tidak dapat dijadikan Lost Sales sebelum faktur terkait dihapus.", "Masalah berbeda dibuat sebagai WO baru.", "Histori Lost Sales dipertahankan untuk analisis konversi penjualan."] },
    ],
  },
  {
    id: "faktur-penjualan",
    category: "Penjualan",
    title: "Membuat dan Mengoreksi Faktur Penjualan",
    summary: "Faktur mengunci hasil akhir servis dan mengurangi stok barang pada cabang transaksi.",
    keywords: ["faktur", "invoice", "penjualan", "stok", "hapus"],
    route: "/invoices",
    sources: [
      { label: "Accurate: Cara menghapus Faktur Penjualan", url: "https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/faktur-penjualan/cara-menghapus-faktur-penjualan/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara membuat", steps: ["Buka WO berstatus Selesai.", "Periksa pelanggan, kendaraan, tanggal, layanan, barang, harga, dan diskon.", "Untuk setiap barang Persediaan, pilih Gudang Pengeluaran Stok dan perhatikan saldo setelah faktur.", "Jika muncul AKAN NEGATIF, faktur tetap dapat dibuat setelah memastikan gudang yang dipilih benar.", "Simpan faktur.", "Catat pembayaran sekarang atau biarkan sebagai piutang."] },
      { title: "Dampak", paragraphs: ["Saat faktur dibuat, barang persediaan mengurangi stok gudang yang dipilih. Jasa tidak memengaruhi stok.", "Stok yang kurang diperbolehkan menjadi negatif dan tetap dicatat dalam mutasi gudang. Segera cocokkan dengan penerimaan, transfer antar gudang, atau penyesuaian stok yang sah agar saldo kembali sesuai kondisi fisik."] },
      { title: "Aturan koreksi", rules: ["Faktur yang sudah memiliki pembayaran tidak dapat dihapus; hapus pembayaran terlebih dahulu.", "Menghapus faktur mengembalikan stok secara otomatis dan melepas relasi faktur dari WO.", "WO tetap tersimpan sebagai histori pekerjaan Selesai."] },
    ],
  },
  {
    id: "pembayaran-pelanggan",
    category: "Penjualan",
    title: "Mencatat Pembayaran Pelanggan",
    summary: "Pembayaran mengurangi piutang dan masuk ke akun kas atau bank cabang.",
    keywords: ["pembayaran", "piutang", "kas", "bank", "lunas"],
    route: "/customer-payments",
    sources: [
      { label: "Accurate: Menghapus Penerimaan Penjualan", url: "https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/penerimaan-penjualan/menghapus-penerimaan-penjualan/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buka Pembayaran Pelanggan dan pilih faktur.", "Isi tanggal, nilai pembayaran, metode, dan akun kas/bank.", "Simpan pembayaran dan periksa sisa tagihan."] },
      { title: "Aturan", rules: ["Nilai pembayaran tidak boleh melebihi sisa tagihan.", "Menghapus pembayaran membuat faktur kembali terutang.", "Pembayaran yang sudah masuk setoran cabang harus dilepas dari setoran terlebih dahulu."] },
    ],
  },
  {
    id: "alur-pembelian",
    category: "Pembelian",
    title: "Alur Penerimaan, Faktur, dan Pembayaran Pembelian",
    summary: "Urutan dokumen pembelian memastikan stok dan utang supplier tercatat dengan benar.",
    keywords: ["supplier", "penerimaan", "faktur pembelian", "utang", "bayar"],
    route: "/receipts",
    sources: [
      { label: "Accurate: Faktur Pembelian dari Penerimaan Barang", url: "https://help.accurate.id/product/accurate-online/fitur-aol/pembelian/faktur-pembelian/membuat-faktur-pembelian-berasal-dari-penerimaan-barang/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Alur kerja", steps: ["Buat Penerimaan Barang ketika barang tiba di gudang.", "Jika barang belum ada, pilih Barang belum ada lalu isi Nama Barang, Kode Barcode/Kode Barang Asli bila tersedia, Kategori, dan Merek Barang. Barcode bersifat opsional.", "Pilih minimal Merek Mobil, lalu model/generasi/CC bila diketahui.", "Periksa gudang dan jumlah fisik, lalu terima barang agar stok bertambah.", "Buat Faktur Pembelian dari penerimaan terkait.", "Catat pembayaran supplier sebagian atau lunas."] },
      { title: "Aturan", rules: ["Barang baru dari penerimaan disimpan sebagai Menunggu Verifikasi; gunakan Universal / Semua Mobil hanya bila barang memang tidak khusus kendaraan tertentu.", "Jika nama barang sudah ada, pilih barang lama agar master dan stok tidak terduplikasi.", "Penerimaan yang sudah difakturkan tidak dapat diedit atau dihapus.", "Untuk koreksi, hapus pembayaran supplier, lalu faktur pembelian, kemudian penerimaan barang.", "Menghapus penerimaan yang belum difakturkan mengoreksi stok otomatis."] },
    ],
  },
  {
    id: "siklus-stok-end-to-end",
    category: "Persediaan",
    title: "Siklus Stok Barang dari Masuk sampai Keluar",
    summary: "Pedoman utama seluruh mutasi stok DRAC dari saldo awal, pembelian, transfer, penjualan, hingga stok opname.",
    keywords: ["alur stok", "siklus", "masuk", "keluar", "mutasi", "saldo", "accurate"],
    route: "/warehouses",
    sources: [
      { label: "Accurate: Kumpulan panduan Persediaan", url: "https://help.accurate.id/product/persediaan/" },
      { label: "Accurate: Pemindahan Barang antar Gudang", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemindahan-barang/mencatat-pemindahan-barang-antar-gudang/" },
      { label: "Accurate: Perintah dan Hasil Stok Opname", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/perintah-stok-opname/mengenal-fitur-perintah-stok-opname/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Peta alur", steps: ["Saldo awal atau Penyesuaian Stok membentuk posisi awal barang per gudang.", "Penerimaan Barang menambah stok gudang penerima.", "Transfer Kirim mengurangi stok gudang asal; Transfer Terima menambah stok gudang tujuan.", "Faktur Penjualan final mengurangi stok dari gudang penjualan yang dipilih.", "Retur atau penyesuaian yang sah menambah/mengurangi stok sesuai kejadian sebenarnya.", "Stok Opname membandingkan saldo sistem dengan fisik; selisih yang disetujui Supervisor menghasilkan Penyesuaian Stok."] },
      { title: "Dokumen yang mengubah stok", rules: ["Tambah stok: penerimaan barang, transfer diterima, penyesuaian positif, dan retur penjualan ketika modul retur tersedia.", "Kurangi stok: faktur penjualan, transfer dikirim, penyesuaian negatif, dan retur pembelian ketika modul retur tersedia.", "Tidak mengubah stok: WO/Register, estimasi layanan, pembayaran pelanggan, pembayaran supplier, dan lembar hitung yang belum diposting."] },
      { title: "Kontrol wajib", rules: ["Setiap mutasi harus mempunyai tanggal, barang, gudang, kuantitas, jenis transaksi, nomor dokumen, dan pembuat.", "Stok dilihat per gudang; angka Semua Cabang merupakan hasil agregasi, bukan gudang tersendiri.", "Dokumen Draft boleh diedit atau dihapus. Dokumen Posted tidak dihapus; batalkan dengan mutasi pembalik dan alasan.", "Gudang yang masih mempunyai saldo atau dokumen terbuka tidak dapat dinonaktifkan.", "Koreksi dimulai dari dokumen paling akhir agar hubungan sumber dan turunan tetap konsisten.", "Sesudah koreksi, cocokkan Stok per Gudang, Kartu Stok/Mutasi, serta laporan terkait."] },
      { title: "Perbedaan penerapan DRAC", paragraphs: ["Accurate dapat memisahkan Pengiriman Pesanan dan Faktur Penjualan. Pada alur servis DRAC saat ini, stok barang jasa servis berkurang ketika Faktur Penjualan final dibuat. Perbedaan ini harus tetap disebutkan dalam dokumentasi agar pengguna tidak mengira WO sudah memotong stok."] },
    ],
  },
  {
    id: "barang-jasa-dan-stok",
    category: "Persediaan",
    title: "Barang, Jasa, dan Perhitungan Stok",
    summary: "Bedakan barang persediaan dan jasa agar laporan stok tidak tercampur.",
    keywords: ["barang", "jasa", "stok", "kategori", "merek", "satuan"],
    route: "/items",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buat kategori, merek, dan satuan yang diperlukan.", "Pilih tipe Persediaan untuk barang yang jumlahnya dilacak.", "Pilih tipe Jasa untuk pekerjaan yang tidak mempunyai kuantitas stok.", "Gunakan filter stok = 0, stok > 0, atau stok < 0 saat memeriksa data."] },
      { title: "Aturan", rules: ["Stok per barang dihitung dari seluruh mutasi pada gudang/cabang yang dipilih.", "Jasa ditampilkan dengan stok kosong dan tidak masuk lembar penghitungan stok.", "Master yang sudah digunakan transaksi sebaiknya dinonaktifkan, bukan dihapus."] },
    ],
  },
  {
    id: "transfer-gudang",
    category: "Persediaan",
    title: "Transfer Barang antar Gudang",
    summary: "Kirim dari gudang asal lalu terima di gudang tujuan agar stok perjalanan dapat dilacak.",
    keywords: ["transfer", "gudang", "kirim", "terima", "stok perjalanan"],
    route: "/warehouse-transfers",
    sources: [
      { label: "Accurate: Pemindahan Barang antar Gudang", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemindahan-barang/mencatat-pemindahan-barang-antar-gudang/" },
      { label: "Accurate: Barang hilang saat pengiriman", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/stok-hilang-pengiriman/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Alur kerja", steps: ["Pilih gudang asal dan gudang tujuan.", "Tambahkan barang dan simpan sebagai Draft jika belum final.", "Kirim transfer; stok gudang asal berkurang dan barang berstatus Dalam Perjalanan.", "Saat barang tiba, catat penerimaan sebagian atau seluruhnya; stok gudang tujuan bertambah.", "Jika transfer yang sudah dikirim harus dibatalkan, isi alasan dan gunakan Batalkan agar sistem membuat mutasi pembalik."] },
      { title: "Aturan", rules: ["Gudang asal dan tujuan harus berbeda.", "Jumlah kirim harus tersedia pada gudang asal.", "Jumlah terima tidak boleh melebihi sisa kiriman.", "Transfer selesai setelah seluruh jumlah diterima.", "Hanya Draft yang dapat dihapus langsung.", "Pembatalan ditolak jika barang yang sudah diterima tidak lagi cukup untuk dikembalikan.", "Barang hilang atau rusak di perjalanan dicatat melalui penyesuaian yang merujuk transfer; penerimaan tetap memakai jumlah fisik yang benar-benar tiba."] },
    ],
  },
  {
    id: "penyesuaian-stok",
    category: "Persediaan",
    title: "Penyesuaian Stok dan Saldo Awal",
    summary: "Gunakan penyesuaian untuk saldo awal atau koreksi selisih yang dapat dipertanggungjawabkan.",
    keywords: ["adjustment", "penyesuaian", "saldo awal", "import", "hapus", "posted"],
    route: "/opening-stock",
    sources: [
      { label: "Accurate: Penyesuaian Persediaan", url: "https://help.accurate.id/product/penyesuaian-persediaan/" },
      { label: "Accurate: Penghapusan Penyesuaian dari Saldo Awal", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/error-hapus-saldo-awal/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buat atau impor rincian barang, gudang, dan kuantitas.", "Simpan sebagai Draft dan periksa baris yang tidak valid.", "Posting dokumen setelah seluruh nilai benar.", "Periksa hasilnya pada stok per gudang dan mutasi barang."] },
      { title: "Aturan koreksi seperti Accurate", rules: ["Draft dapat diedit atau dihapus.", "Dokumen Posted tidak dapat dihapus langsung.", "Gunakan Batalkan, isi alasan, lalu sistem membuat mutasi pembalik tanpa menghilangkan dokumen asli.", "Pembatalan ditolak jika akan membuat saldo gudang menjadi negatif."] },
    ],
  },
  {
    id: "stok-opname",
    category: "Persediaan",
    title: "Lembar Penghitungan Stok (Stok Opname)",
    summary: "Cetak saldo sistem per tanggal dan gudang untuk dibandingkan dengan hitungan fisik.",
    keywords: ["stok opname", "hitung", "fisik", "gudang", "kategori", "pdf"],
    route: "/reports/stock-count-sheet",
    sources: [
      { label: "Accurate: Perintah dan Hasil Stok Opname", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/perintah-stok-opname/mengenal-fitur-perintah-stok-opname/" },
      { label: "Accurate: Urutan menghapus Stok Opname", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/perintah-stok-opname/hapus-perintah-stok/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buat Perintah Stok Opname dengan Tanggal Mulai, Gudang, Cabang, Petugas, dan kategori bila diperlukan.", "Pada Tanggal Mulai, petugas membuat Hasil Stok Opname lalu mencetak lembar.", "Petugas mengisi Hitung #1 dan, bila diperlukan, Hitung #2, kemudian menyimpan hasil.", "Supervisor yang memiliki izin Posting Stok Opname memeriksa dan menyetujui hasil.", "Sistem membuat Penyesuaian Stok otomatis hanya sebesar selisih yang ditemukan."] },
      { title: "Aturan", rules: ["Tanggal Mulai tidak boleh mundur.", "Saldo dan versi stok dikunci saat Hasil Stok Opname dibuat.", "Hitung #2 menjadi nilai final jika diisi; jika kosong, Hitung #1 menjadi nilai final.", "Hasil hitung fisik belum mengubah stok sebelum diposting.", "Posting ditolak jika ada penerimaan, penjualan, transfer, atau penyesuaian setelah lembar hitung dibuat; hapus Draft Hasil lalu buat ulang.", "Penyesuaian hasil opname yang sudah Posted dibatalkan dengan mutasi pembalik, bukan dihapus."] },
    ],
  },
  {
    id: "aturan-hapus-transaksi",
    category: "Administrasi",
    title: "Aturan Edit, Hapus, dan Urutan Dokumen",
    summary: "DRAC mengikuti pola Accurate: koreksi dilakukan dari dokumen paling akhir.",
    keywords: ["hapus", "edit", "koreksi", "urutan", "accurate", "dokumen turunan"],
    sources: [
      { label: "Accurate: Menghapus Faktur Penjualan", url: "https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/faktur-penjualan/cara-menghapus-faktur-penjualan/" },
      { label: "Accurate: Menghapus Penerimaan Penjualan", url: "https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/penerimaan-penjualan/menghapus-penerimaan-penjualan/" },
      { label: "Accurate: Urutan menghapus Stok Opname", url: "https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/perintah-stok-opname/hapus-perintah-stok/" },
    ],
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Prinsip", paragraphs: ["Dokumen Draft dapat diedit atau dihapus selama belum mempunyai dokumen turunan. Dokumen Posted yang memengaruhi stok tidak dihapus langsung; koreksi dilakukan melalui pembatalan atau dokumen pembalik agar dokumen asli dan jejak audit tetap tersedia."] },
      { title: "Urutan koreksi", steps: ["Hapus pembayaran terlebih dahulu.", "Hapus faktur penjualan atau pembelian.", "Hapus dokumen sumber seperti penerimaan bila masih perlu.", "Periksa kembali stok, piutang/utang, dan laporan setelah koreksi."] },
      { title: "Aturan", rules: ["Sistem menolak penghapusan dokumen yang masih memiliki transaksi turunan.", "Retur digunakan bila benar-benar terjadi pengembalian barang, bukan untuk menutupi salah input.", "Master yang memiliki histori tidak dihapus; nonaktifkan agar referensi transaksi tetap utuh."] },
    ],
  },
  {
    id: "kas-bank-dan-setoran",
    category: "Kas & Bank",
    title: "Kas, Bank, dan Setoran Cabang",
    summary: "Pisahkan uang yang masih berada di cabang dari uang yang sudah disetor.",
    keywords: ["kas", "bank", "setoran", "cabang", "verifikasi"],
    route: "/branch-deposits",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Alur kerja", steps: ["Pembayaran pelanggan masuk ke akun kas/bank yang dipilih.", "Kumpulkan pembayaran tunai yang akan disetor.", "Buat Setoran Cabang dan pilih transaksi sumber.", "Verifikasikan setoran sesuai bukti penerimaan bank/pusat."] },
      { title: "Aturan", rules: ["Pembayaran yang telah masuk setoran tidak dapat diedit atau dihapus sebelum setoran dibatalkan.", "Nilai setoran harus dapat ditelusuri ke transaksi pembayaran sumber."] },
    ],
  },
  {
    id: "laporan-dan-ekspor",
    category: "Laporan",
    title: "Memfilter, Mencetak, dan Mengekspor Laporan",
    summary: "Gunakan parameter laporan untuk memperoleh hasil yang konsisten dan dapat diaudit.",
    keywords: ["laporan", "filter", "pdf", "print", "excel", "kategori"],
    route: "/reports",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Pilih jenis laporan dari Daftar Laporan.", "Tentukan periode, cabang, gudang, dan filter tambahan.", "Klik Tampilkan dan periksa jumlah data.", "Gunakan Cetak untuk PDF atau Ekspor untuk Excel."] },
      { title: "Aturan", rules: ["Judul laporan harus menampilkan parameter utama yang digunakan.", "Semua Cabang berarti gabungan cabang yang dapat diakses pengguna.", "Gunakan pengelompokan kategori ketika diperlukan untuk pemeriksaan fisik atau rekap."] },
    ],
  },
  {
    id: "pengguna-role-dan-owner",
    category: "Administrasi",
    title: "Pengguna, Role, dan Akun Owner",
    summary: "Atur akses berdasarkan tugas pengguna dan prinsip hak minimum.",
    keywords: ["pengguna", "role", "owner", "permission", "hak akses"],
    route: "/users",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Cara pakai", steps: ["Buat role sesuai fungsi kerja.", "Aktifkan hanya izin yang diperlukan.", "Buat pengguna lalu tentukan role dan cabang yang boleh diakses.", "Uji login pengguna sebelum dipakai operasional."] },
      { title: "Aturan", rules: ["Owner memiliki akses penuh dan akunnya tidak dapat dihapus.", "Perubahan tanggal mundur, penghapusan, dan maintenance hanya diberikan kepada pengguna berwenang.", "Nonaktifkan akun yang tidak lagi digunakan."] },
    ],
  },
  {
    id: "asisten-ai",
    category: "Administrasi",
    title: "Menggunakan Asisten AI dengan Aman",
    summary: "Asisten membantu pencarian dan input, tetapi konfirmasi pengguna tetap menjadi kontrol akhir.",
    keywords: ["ai", "reg", "cek", "list", "reginv", "konfirmasi"],
    route: "/ai",
    updatedAt: "20 Agustus 2026",
    sections: [
      { title: "Perintah utama", steps: ["Gunakan reg untuk memulai registrasi WO.", "Gunakan cek untuk mencari pelanggan, kendaraan, atau histori.", "Gunakan list untuk menampilkan daftar master.", "Gunakan reginv hanya bila mempunyai izin transaksi historis."] },
      { title: "Aturan", rules: ["Periksa kembali nama, telepon, kendaraan, cabang, dan keluhan sebelum konfirmasi.", "Pelanggan yang mirip harus dipilih secara eksplisit; sistem tidak boleh mengganti identitas diam-diam.", "Asisten mengikuti hak akses pengguna yang sedang login."] },
    ],
  },
];
