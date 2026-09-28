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
   `supabase/7-tanggal-belanja.sql` (mengganti fungsi record_purchase; jangan jalankan ulang 1-skema.sql sesudahnya).
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
  memilih Offline. Halaman "Jual" yang lama sudah dihapus.

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