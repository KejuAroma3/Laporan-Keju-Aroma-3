# Keju Aroma Tiga — Aplikasi Stok dan Penjualan

Aplikasi web (bisa dipasang di HP) untuk stok masuk/keluar, penjualan offline dan
online (GoFood/GrabFood/ShopeeFood), menu terlaris, dan laporan keuangan.

Teknologi: Next.js 14, React 18, Tailwind CSS 3, Supabase.

## Menjalankan di komputer

    npm install
    npm run dev

Buka http://localhost:3000

File `.env.local` berisi alamat dan kunci Supabase. Jika belum ada, salin dari `.env.example`.
Sejak fitur Karyawan ditambahkan, ada satu kunci baru yang wajib diisi:
`SUPABASE_SERVICE_ROLE_KEY`, diambil dari Supabase > Project Settings > API > service_role key.
Kunci ini RAHASIA (jangan pernah pakai awalan `NEXT_PUBLIC_`, jangan dibagikan ke siapa pun) —
hanya dipakai di server untuk membuat/mengubah akun karyawan, tidak pernah dikirim ke browser.

## Database (Supabase, SQL Editor)

1. Database baru/kosong: jalankan berurutan `supabase/1-skema.sql`, `supabase/2-tambahan.sql`,
   `supabase/3-foto-dan-dashboard.sql`, `supabase/4-karyawan.sql`, `supabase/5-satuan-bahan.sql`,
   `supabase/6-pengaturan-aplikasi.sql` (butuh tabel dari langkah karyawan), lalu
   `supabase/7-tanggal-belanja.sql` (mengganti fungsi record_purchase; jangan jalankan ulang 1-skema.sql sesudahnya),
   `supabase/8-koreksi-penjualan.sql`, `supabase/9-stok-produk.sql`, `supabase/10-satuan-produk-dan-akses.sql`, `supabase/11-kategori-bahan.sql`, lalu
   `supabase/12-pengaturan-struk.sql`.
2. Sudah pernah menjalankan skema sebelumnya: cukup jalankan file yang belum pernah dijalankan,
   urut dari nomor terkecil. Semua file aman dijalankan berulang.
3. Authentication > Users: buat akun untuk Anda dan staf.
4. Authentication > Providers > Email: matikan pendaftaran mandiri (Allow new users to sign up).
5. Storage: file `3-foto-dan-dashboard.sql` otomatis membuat bucket `produk` untuk foto.
   Tidak perlu dibuat manual.

## Deploy ke Vercel

1. Push ke GitHub, lalu Import project di Vercel.
2. Settings > Environment Variables: isi `NEXT_PUBLIC_SUPABASE_URL` dan
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nilainya sama dengan `.env.local`).
3. Isi juga `SUPABASE_SERVICE_ROLE_KEY` di Environment Variables Vercel (nilainya sama
   dengan di `.env.local`). Tanpa ini, menu Karyawan akan gagal dengan pesan
   "Konfigurasi server belum lengkap".
4. Deploy. Setelah itu di Supabase > Authentication > URL Configuration,
   isi Site URL dengan domain Vercel Anda.

## Pasang di HP

- Android (Chrome): menu titik tiga > Instal aplikasi.
- iPhone (Safari): Bagikan > Tambah ke Layar Utama.

## Urutan mengisi data

1. Lainnya > Bahan baku
2. Stok > Masuk (stok awal dan harga beli)
3. Lainnya > Menu dan resep (bisa satu-satu, atau impor massal lewat tombol di halaman ini)
4. Buka tiap menu untuk menambah resep dan foto produk
5. Mulai mencatat penjualan

## Halaman penjualan

- **Rekap** (navigasi bawah, `/sales/online-recap`): satu-satunya halaman untuk mencatat
  penjualan, baik Offline, GoFood, GrabFood, maupun ShopeeFood, termasuk untuk tanggal yang
  sudah lewat. Platform awalnya Offline. Kolom komisi platform otomatis disembunyikan saat
  memilih Offline. Halaman "Jual" yang lama sudah dihapus. Di bawah form pencatatan ada
  daftar penjualan untuk platform dan tanggal yang dipilih, dengan tombol Ubah dan Hapus
  untuk mengoreksi kesalahan input (butuh `supabase/8-koreksi-penjualan.sql`).

## Cetak struk

Dari Rekap penjualan: setelah menyimpan penjualan baru, muncul tombol "Cetak struk penjualan
ini". Untuk penjualan yang sudah tersimpan, ada tombol "Cetak" di daftar riwayat penjualan.
Keduanya membuka halaman pratinjau struk, bisa pilih ukuran 58mm atau 80mm, dengan dua cara
mencetak:
- **Cetak** (dialog print bawaan HP/komputer): paling andal, bisa dipakai di HP apa pun
  (termasuk iPhone). Kalau printer Bluetooth Anda sudah terpasang sebagai printer di sistem
  Android (lewat aplikasi bawaan mereknya), cara ini otomatis bisa memakainya.
- **Cetak via Bluetooth (eksperimental)**: menghubungkan langsung dari browser ke printer
  lewat Web Bluetooth. Hanya jalan di Chrome (Android/komputer), tidak jalan di iPhone/Safari,
  dan hanya untuk printer Bluetooth Low Energy (BLE) yang kompatibel — printer yang memakai
  Bluetooth Classic (SPP), yang cukup umum juga, tidak bisa diakses dari browser mana pun.
  Tidak ada standar universal antar merek printer; kalau printer Anda tidak terdeteksi,
  gunakan tombol Cetak biasa sebagai gantinya.

Ukuran kertas bawaan dan teks penutup struk bisa diatur di Pengaturan > Format struk, dan
masih bisa diganti per struk saat mencetak. Butuh `supabase/12-pengaturan-struk.sql`.

## Kategori bahan baku

Di halaman Bahan baku, tiap bahan bisa diberi kategori (contoh: "Bahan baku", "Bahan
kemasan", "Bahan habis pakai" — bebas ketik kategori lain juga). Daftar bahan di Bahan baku
dan Stok bahan dikelompokkan per kategori, begitu juga dropdown pilih bahan di Stok (Masuk/
Keluar/Opname) dan saat menyusun resep di Menu dan resep. Bahan tanpa kategori masuk
kelompok "Tanpa kategori" di urutan paling akhir. Butuh `supabase/11-kategori-bahan.sql`.

## Pembagian akses pemilik vs staf

- **Pemilik**: akses penuh ke semua halaman.
- **Staf**: hanya bisa memakai Rekap penjualan dan Produksi (termasuk tab Sesuaikan).
  Halaman Menu dan resep, Bahan baku, Stok bahan, Biaya operasional, Laporan, Karyawan, dan
  Pengaturan menampilkan pesan "hanya pemilik" untuk akun staf. Di halaman Produksi, staf
  tetap bisa input jumlah produksi dan stok, tapi tidak melihat nilai rupiah (HPP, nilai
  stok). Di Beranda, staf tidak melihat angka pendapatan/laba/biaya, hanya daftar produk
  terlaris (jumlah terjual saja, tanpa omzet) dan peringatan stok menipis (jumlah saja).
- **Penting**: ini pembatasan TAMPILAN, bukan di database. Kebijakan keamanan (RLS) tabel
  ingredients, menu_items, expenses, dan stock_movements masih mengizinkan semua akun yang
  login untuk membaca datanya, termasuk angka rupiah, lewat API Supabase secara langsung
  (bukan lewat tampilan aplikasi ini). Ini cukup untuk staf yang tidak mengakses lewat jalur
  teknis. Kalau butuh jaminan yang diberlakukan di database, itu pekerjaan tambahan terpisah.

## Fitur

- **Beranda**: produk paling banyak terjual, dengan tab Harian / Mingguan / Bulanan dan
  navigasi tanggal (panah kiri-kanan atau pilih tanggal langsung).
- **Impor produk massal**: Menu dan resep > Impor massal. Unduh format CSV, isi nama,
  kategori, dan harga, lalu unggah. Produk dengan nama yang sama akan diperbarui harganya.
  Resep dan foto tetap ditambahkan satu per satu setelah impor.
- **Foto produk**: dibuka dari halaman Menu dan resep, di dalam tiap menu. Foto otomatis
  dikecilkan di perangkat sebelum diunggah agar hemat data dan ruang penyimpanan.
- **Karyawan** (menu di Lainnya, selalu tampil): tambah akun staf baru, ubah nama, email
  (dipakai sebagai username saat masuk), kata sandi, dan peran, atau hapus akun. Hanya akun
  pemilik yang berwenang melakukan ini; akun staf yang membuka menu ini hanya melihat pesan
  penjelasan. Akun yang menjalankan `supabase/4-karyawan.sql` otomatis dijadikan pemilik.
  Jika halaman ini menampilkan pesan bahwa fitur belum diaktifkan, jalankan
  `supabase/4-karyawan.sql` lalu muat ulang. Semua pengguna, staf maupun pemilik, juga bisa
  mengganti kata sandi akun mereka sendiri lewat Lainnya > Ubah kata sandi saya.
- **Tombol kembali**: muncul di semua halaman kecuali Beranda, di pojok kiri atas judul.
- **Menu dan resep**: tiap menu bisa diubah namanya, dan bisa dihapus jika memang salah
  buat. Menu yang sudah pernah terjual tidak bisa dihapus (supaya laporan lama tidak
  berubah) — pakai tombol Sembunyikan untuk kasus itu.
- **Satuan bahan baku**: di halaman Bahan baku, buka "Kelola satuan" untuk menambah,
  mengganti nama, atau menghapus pilihan satuan (gram, ml, pcs, dan sebagainya). Mengganti
  nama satuan ikut memperbarui bahan yang sudah memakainya.
- **Tanggal belanja** (Stok > Masuk): kolom tanggal, awalnya hari ini. Ubah untuk mencatat nota
  yang sudah lewat, dan Laporan > Belanja memakai tanggal itu. Tanggal masa depan ditolak. Butuh
  `supabase/7-tanggal-belanja.sql`; tanpa itu, pencatatan hari ini tetap jalan tetapi tanggal
  yang sudah lewat akan menampilkan pesan agar SQL-nya dijalankan. Harga rata-rata dihitung
  dari stok saat nota diinput, jadi mencatat nota lama tidak mengubah HPP penjualan yang sudah lewat.
- **Laporan belanja** (Laporan > Belanja): total belanja bahan baku pada periode yang dipilih,
  jumlah transaksi, dan jumlah jenis bahan. Tampilan "Per bahan" mengurutkan bahan dari
  pengeluaran terbesar (jumlah pembelian, total jumlah, harga rata-rata, dan persentase), dan
  bisa dibuka untuk melihat tiap transaksinya. Tampilan "Semua transaksi" menampilkan daftar
  urut waktu lengkap dengan catatan nota. Ada pencarian dan tombol unduh CSV. Tombol "Semua"
  di atas laporan menampilkan sepanjang waktu. Tanggal belanja adalah tanggal yang dipilih di
  Stok > Masuk (pembelian lama sebelum ada kolom tanggal memakai tanggal saat dicatat). Reset stok menghapus riwayat pembelian bahan yang direset dari laporan ini.
- **Koreksi harga bahan**: buka bahan apa pun (lewat Bahan baku atau Stok > Sisa), isi
  "Total harga beli" dan "Jumlah barang", lalu aplikasi menghitung harga rata-rata per satuan
  otomatis. Kosongkan keduanya jika harga tidak diubah. Ini hanya mengoreksi harga, tidak
  menambah stok dan tidak tercatat sebagai pembelian (pakai Stok > Masuk untuk itu). Laporan
  penjualan yang sudah lewat tidak berubah.
- **Reset stok** (Stok > Reset): mengulang input stok dari awal, untuk satu bahan atau semua
  bahan. Stok jadi 0, harga rata-rata jadi Rp0, dan riwayat stok masuk/keluar/opname bahan
  itu dihapus. Daftar bahan, resep, menu, penjualan, dan biaya tidak berubah. Selalu ada
  dialog konfirmasi, dan reset semua bahan meminta mengetik RESET. Hanya pemilik yang bisa
  mengakses tab ini. Catatan: pembatasan ini ada di tampilan aplikasi, belum diberlakukan
  di database.
- **Stok produk jadi** (navigasi bawah > Stok): untuk menu yang diproduksi dalam batch (misalnya
  digoreng/dikemas duluan), bukan dibuat saat ada pesanan. Satuannya per pcs secara bawaan
  (bisa diganti per menu di Menu dan resep, misalnya jadi lembar atau botol). Catat produksi
  (jumlah pcs), dan bahan otomatis terpotong sesuai resep dikali jumlah itu, sekaligus
  menghitung HPP produk dari biaya bahan saat itu (rata-rata tertimbang, seperti harga bahan).
  Setelah menu pernah diproduksi sekali, penjualan menu itu mengurangi stok produk (bukan
  menghitung ulang bahan tiap laku), dan HPP di laporan memakai HPP produksi yang sebenarnya,
  bukan estimasi resep. Ada tab Sesuaikan untuk mencatat produk rusak/hilang atau opname
  (hitung fisik). Menu yang belum pernah diproduksi tetap seperti sebelumnya, dibuat saat
  dipesan, tanpa perlu diaktifkan manual. Muncul juga di halaman Menu dan resep (stok dan HPP)
  dan Rekap penjualan (stok saat memilih menu, dengan peringatan kalau jumlah pesanan melebihi
  stok — tetap bisa disimpan). Ubah/hapus penjualan yang memakai stok produk ikut mengembalikan
  stoknya dengan benar. Butuh `supabase/9-stok-produk.sql` dan `supabase/10-satuan-produk-dan-akses.sql`.
  Catatan: tab navigasi bawah "Stok" sekarang menuju stok produk ini; stok bahan baku pindah
  ke Lainnya > Stok bahan.
- **Kontras warna otomatis**: warna teks tombol (putih atau gelap) dipilih otomatis mengikuti
  keterbacaan di atas warna tema yang dipilih di Pengaturan, supaya warna terang seperti
  kuning tetap enak dibaca.