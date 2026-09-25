# Kafe Stok

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
   `supabase/3-foto-dan-dashboard.sql`, `supabase/4-karyawan.sql`, lalu `supabase/5-satuan-bahan.sql`.
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

- **Jual** (navigasi bawah, `/sales/new`): kasir cepat untuk hari ini, dipakai sehari-hari.
- **Rekap penjualan** (Lainnya > Rekap penjualan, `/sales/online-recap`): satu halaman untuk
  mencatat Offline, GoFood, GrabFood, atau ShopeeFood, termasuk untuk tanggal yang sudah
  lewat. Kolom komisi platform otomatis disembunyikan saat memilih Offline.

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
