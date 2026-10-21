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
   `supabase/8-koreksi-penjualan.sql`, `supabase/9-stok-produk.sql`, `supabase/10-satuan-produk-dan-akses.sql`, `supabase/11-kategori-bahan.sql`, `supabase/12-pengaturan-struk.sql`, lalu
   `supabase/13-varian-produk.sql`, lalu `supabase/14-urutan-produksi.sql`, lalu `supabase/15-isi-per-penjualan.sql`, lalu `supabase/16-rincian-diskon.sql`, lalu `supabase/17-kemasan-per-penjualan.sql`, lalu `supabase/18-isi-berlaku-semua-menu.sql`, lalu `supabase/19-harga-per-platform.sql`, lalu `supabase/20-produksi-tanpa-resep.sql`, lalu `supabase/21-pesanan-khusus.sql`, lalu `supabase/22-nama-pelanggan.sql`, lalu `supabase/23-urutan-menu-jual.sql`, lalu `supabase/24-pengeluaran-promosi.sql`, lalu `supabase/25-aturan-komisi-platform.sql`, lalu `supabase/26-kemasan-per-transaksi.sql`, lalu `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`, lalu `supabase/29-hitung-ulang-komisi.sql`, lalu `supabase/30-menu-paket.sql`.
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
3. Lainnya > Menu (bisa satu-satu, atau impor massal lewat tombol di halaman ini), lalu Lainnya > Resep untuk mengisi bahan tiap menu
4. Buka tiap menu untuk menambah resep dan foto produk
5. Mulai mencatat penjualan

## Halaman penjualan

- **Rekap** (navigasi bawah, `/sales/online-recap`): satu-satunya halaman untuk mencatat
  penjualan, baik Offline, GoFood, GrabFood, maupun ShopeeFood, termasuk untuk tanggal yang
  sudah lewat. Platform awalnya Offline. Kolom komisi platform otomatis disembunyikan saat
  memilih Offline. Halaman "Jual" yang lama sudah dihapus. Di bawah form pencatatan ada
  daftar penjualan untuk platform dan tanggal yang dipilih, dengan tombol Ubah dan Hapus
  untuk mengoreksi kesalahan input (butuh `supabase/8-koreksi-penjualan.sql`).

## Produk dasar dan varian

Untuk menu yang beda varian (isi/topping) dari produk yang sama, misalnya "Keju Aroma" dengan
varian Original dan Cokelat. Di Menu dan resep, isi kolom "Produk dasar" dan "Nama varian"
saat menambah atau mengubah menu. Varian dari produk dasar yang sama dikelompokkan berdekatan
di Menu, Resep, Rekap penjualan (satu kartu per produk dasar, tiap varian satu baris), dan
Produksi (dengan total stok gabungan semua varian). Di Laporan > Terlaris ada pilihan "Per
varian" dan "Per produk dasar" (jumlah terjual, omzet, dan laba semua varian dijumlahkan).

Tiap varian tetap menu penuh sendiri: resep, stok produksi, dan HPP-nya terpisah. Ini disengaja,
supaya mengubah resep satu varian tidak diam-diam mengubah HPP varian lain. Untuk menambah
varian baru dengan cepat, buka varian baru itu di Resep (selama resepnya masih kosong)
dan pakai "Salin resep dari varian lain", lalu ganti bahan yang beda (isi/toppingnya).
Menu yang berdiri sendiri cukup dikosongkan kolom produk dasarnya. Impor massal (CSV) belum
mendukung kolom produk dasar/varian; atur lewat Menu dan Resep setelah impor.
Butuh `supabase/13-varian-produk.sql`.

## Atur list produksi (urutan dan satukan varian)
Di Produksi ada tab "Atur list" (khusus pemilik). Butuh `supabase/14-urutan-produksi.sql`.
- **Urutan**: tombol panah naik/turun. Urutan ini dipakai di tab Stok produk dan pilihan menu
  di tab Produksi, supaya sesuai urutan kerja produksi.
- **Tampil**: hilangkan centang untuk menyembunyikan menu atau produk dasar yang tidak diproduksi
  dalam batch (data tidak dihapus).
- **Satukan varian**: untuk produk dasar yang bahannya sama dan hanya beda varian/topping. Pilih
  satu varian yang resepnya dipakai untuk produksi, lalu tekan "Satukan varian jadi satu stok".
  Setelah itu di Produksi hanya muncul satu baris untuk produk dasar itu (satu stok, satu catatan
  produksi), dan penjualan varian apa pun di Rekap penjualan mengurangi stok yang sama. Stok varian
  lain yang sudah ada dipindahkan ke stok gabungan. Resep tiap varian tetap ada untuk HPP penjualan
  yang dihitung dari resep. "Pisahkan varian lagi" mengembalikan seperti semula; stok tetap di varian
  pemegang stok, varian lain mulai dari nol.
- Catatan: HPP penjualan varian dari stok gabungan memakai HPP stok gabungan (resep varian pemegang stok).

## Isi per penjualan (isi 5, isi 15, hampers)
Untuk menu yang bahan dasar dan stoknya sama tetapi beda isi, misalnya "Keju Aroma Original isi 5"
dan "Hampers Keju Aroma Original isi 15". Butuh `supabase/15-isi-per-penjualan.sql`.
- Di Menu ada kolom **Isi per penjualan (pcs stok)**: isi 5 untuk menu isi 5, 15 untuk hampers isi 15.
  Bawaannya 1.
- Satu penjualan mengurangi stok sebanyak jumlah terjual x isi. Contoh: 2 kotak isi 5 + 1 hampers isi
  15 = 25 pcs keluar dari stok gabungan. Harga jual tetap harga per kotak/hampers.
- HPP penjualan = HPP per pcs stok x isi. Peringatan "Melebihi stok" di Rekap penjualan juga memakai
  total pcs yang dibutuhkan semua varian yang berbagi stok.
- Pakai bersama "Satukan varian" (Produksi > Atur list): produksi dicatat dalam pcs sekali, semua isi
  mengurangi stok yang sama. Menu isi 15 tidak perlu resep sendiri.
- Penjualan lama tidak berubah (isi dihitung 1).
- Resep selalu dihitung **per 1 pcs**. Isi berlaku untuk semua menu, termasuk yang belum pernah
  diproduksi (dibuat saat dipesan): bahan terpotong sebanyak resep x isi. Bahan yang dicentang
  "Dipakai sekali per penjualan" (box, kantong) tidak dikali isi. Butuh `supabase/18-isi-berlaku-semua-menu.sql`, lalu `supabase/19-harga-per-platform.sql`, lalu `supabase/20-produksi-tanpa-resep.sql`, lalu `supabase/21-pesanan-khusus.sql`, lalu `supabase/22-nama-pelanggan.sql`, lalu `supabase/23-urutan-menu-jual.sql`, lalu `supabase/24-pengeluaran-promosi.sql`, lalu `supabase/25-aturan-komisi-platform.sql`, lalu `supabase/26-kemasan-per-transaksi.sql`, lalu `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`.
- Varian yang stoknya disatukan (di Atur list produksi): di Resep, stok & HPP-nya mengikuti menu pemegang stok ("ikut <nama>"). Resep utama dikelola di menu pemegang stok; di varian hanya bisa menambah bahan "sekali per penjualan". HPP yang tampil tanpa resep berasal dari HPP stok pemegang stok.
  Di daftar Resep, keterangan "dari produksi" berarti HPP dari stok produksi, "dari resep" berarti
  dihitung dari resep (menu belum diproduksi atau belum disatukan stoknya), dan "isi N" muncul bila isi bukan 1.

## Diskon bernama di Rekap penjualan
Satu penjualan bisa punya beberapa diskon, misalnya di GoFood: "Diskon total belanja" dan "Diskon
ongkir". Butuh `supabase/16-rincian-diskon.sql`.
- Di form Rekap penjualan, ketuk tombol nama diskon (+ Diskon total belanja, + Diskon ongkir, dst)
  untuk menambah baris, isi nominalnya. Tombol ✕ di tiap baris menghapus diskon itu. "+ Diskon lain"
  untuk nama bebas.
- "Atur jenis diskon" menambah atau menghapus nama diskon yang sering dipakai (tombol-tombol itu).
- Total semua diskon tetap disimpan sebagai diskon penjualan, jadi laporan laba rugi dan kas tidak
  berubah. Rincian muncul di riwayat penjualan, saat Ubah, dan di struk.
- Penjualan lama yang hanya punya satu angka diskon tampil sebagai satu baris "Diskon".

## Kemasan dan perlengkapan (plastik, box, handgloves, label, kabel ties)
- **Stok belanja**: di menu utama "Stok" ada pilihan **Stok produksi** dan **Stok belanja** (tombol
  di atas halaman). Pemilik memakai empat tab; staf hanya melihat daftar stok belanja (tanpa nilai rupiah, harga, dan tombol ubah). Isinya barang dengan kategori selain Bahan baku
  (mis. Bahan kemasan, Bahan habis pakai), dengan empat tab:
  - **Stok**: sisa tiap barang, minimum, nilai, filter kategori, pencarian, "menipis atau habis saja",
    dan penanda barang yang belum masuk resep manapun (belum ikut HPP).
  - **Belanja**: catat pembelian plastik, box, dll (jumlah, total harga dari nota, tanggal), lengkap dengan
    riwayat per hari/bulan/tahun yang bisa diubah/dihapus, hanya untuk barang kemasan.
  - **Pakai**: catat pemakaian banyak barang sekaligus (mis. handgloves, kabel ties) dengan satu kali simpan.
  - **Opname**: hitung fisik, selisih otomatis menyesuaikan stok.
  Barang baru ditambah di Lainnya > Bahan baku dengan kategori yang sesuai.
- **Masuk HPP**: masukkan ke Resep seperti bahan lain. Kolom "Untuk berapa" membantu barang yang
  dipakai sedikit-sedikit: 1 pasang handgloves untuk 50 pcs = 0,02 per pcs. Resep menampilkan
  perkiraan HPP per penjualan beserta rincian per kategori (bahan baku, kemasan, habis pakai).
- **Dipakai saat dijual**: untuk menu yang diproduksi dalam batch, centang ini pada box/kantong yang
  dipasang per kotak yang terjual (mis. box hampers isi 15). Stoknya dipotong tiap penjualan dan
  masuk HPP penjualan itu. Tanpa centang, bahan dipotong saat produksi dan ikut HPP per pcs
  (cocok untuk plastik/label per pcs). Butuh `supabase/17-kemasan-per-penjualan.sql`.
- Penjualan lama tidak berubah. Resep yang sudah ada tetap dianggap dipakai saat produksi.
- **Dua angka HPP di Resep** (untuk menu yang diproduksi): "HPP tercatat" (angka di daftar dan yang
  dipakai di penjualan) dihitung saat produksi dari harga bahan waktu itu, dirata-rata dengan stok yang
  masih ada (bahan yang belum pernah dibeli dihitung Rp0). "Perkiraan dari resep sekarang" memakai resep dan
  harga bahan hari ini. Kalau selisihnya lebih dari 2%, muncul tombol "Samakan HPP stok dengan resep
  sekarang" untuk menyetel HPP stok sesuai resep sekarang (berlaku untuk penjualan berikutnya; penjualan
  yang sudah tercatat tidak berubah).

## Stok di Beranda
Bagian "Stok" di bawah Beranda menampilkan **Stok produksi** dan satu blok per kategori barang (mis. Bahan Jadi, Bahan kemasan, Bahan Pelengkap, Bahan Baku Utama). Lewat "Atur tampilan" Anda mencentang blok mana yang tampil.
Ketuk "Atur tampilan" (pemilik) untuk memilih blok mana yang tampil dan apakah isinya semua stok atau
hanya yang menipis. Pilihan tersimpan di perangkat itu saja. Bawaan: produksi dan kemasan tampil, semua
stok. Daftar produksi mengikuti urutan dan penyatuan varian dari Stok > Atur list. Staf melihat stok
produksi dan stok belanja (tanpa bahan baku dan tanpa rupiah). Tidak ada SQL baru.

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
Keluar/Opname) dan saat menyusun resep di Resep. Bahan tanpa kategori masuk
kelompok "Tanpa kategori" di urutan paling akhir. Butuh `supabase/11-kategori-bahan.sql`.

## Pembagian akses pemilik vs staf

- **Pemilik**: akses penuh ke semua halaman.
- **Staf**: hanya bisa memakai Rekap penjualan dan Produksi (termasuk tab Sesuaikan).
  Halaman Menu, Resep, Bahan baku, Stok bahan, Biaya operasional, Laporan, Karyawan, dan
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
- **Impor produk massal**: Menu > Impor massal. Unduh format CSV, isi nama,
  kategori, dan harga, lalu unggah. Produk dengan nama yang sama akan diperbarui harganya.
  Resep dan foto tetap ditambahkan satu per satu setelah impor.
- **Foto produk**: dibuka dari halaman Menu, di dalam tiap menu. Foto otomatis
  dikecilkan di perangkat sebelum diunggah agar hemat data dan ruang penyimpanan.
- **Karyawan** (menu di Lainnya, selalu tampil): tambah akun staf baru, ubah nama, email
  (dipakai sebagai username saat masuk), kata sandi, dan peran, atau hapus akun. Hanya akun
  pemilik yang berwenang melakukan ini; akun staf yang membuka menu ini hanya melihat pesan
  penjelasan. Akun yang menjalankan `supabase/4-karyawan.sql` otomatis dijadikan pemilik.
  Jika halaman ini menampilkan pesan bahwa fitur belum diaktifkan, jalankan
  `supabase/4-karyawan.sql` lalu muat ulang. Semua pengguna, staf maupun pemilik, juga bisa
  mengganti kata sandi akun mereka sendiri lewat Lainnya > Ubah kata sandi saya.
- **Tombol kembali**: muncul di semua halaman kecuali Beranda, di pojok kiri atas judul.
- **Menu dan Resep (dipisah)**: Menu berisi nama, harga, kategori, varian, foto, stok produk, sembunyikan/hapus. Resep (Lainnya > Resep) berisi bahan per menu, salin resep antar varian, HPP dan margin. Tombol "Atur resep menu ini" di Menu langsung membuka resepnya. Selain itu: tiap menu bisa diubah namanya, dan bisa dihapus jika memang salah
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
  Stok > Belanja (pembelian lama sebelum ada kolom tanggal memakai tanggal saat dicatat). Reset stok menghapus riwayat pembelian bahan yang direset dari laporan ini.
- **Riwayat belanja** (Stok bahan > Belanja): di bawah form pembelian ada pilihan Harian,
  Bulanan, dan Tahunan dengan tombol panah untuk pindah periode. Harian: daftar belanja satu
  hari beserta total. Bulanan: total per hari, ketuk satu hari untuk melihat rinciannya. Tahunan:
  total per bulan, ketuk satu bulan untuk membukanya di tampilan Bulanan. Setiap catatan bisa
  Diubah (jumlah, total harga, tanggal, catatan) atau Dihapus (ada konfirmasi). Perubahan ini
  langsung menyesuaikan jumlah stok bahan dan Laporan > Belanja, tetapi TIDAK menghitung ulang
  harga rata-rata bahan, dan HPP penjualan yang sudah lewat tidak berubah. Tab "Sisa" sudah
  dihapus dari Stok bahan; sisa stok per bahan tetap terlihat di Lainnya > Bahan baku.
  Tidak perlu SQL baru.
- **Koreksi harga bahan**: buka bahan apa pun (lewat Lainnya > Bahan baku), isi
  "Total harga beli" dan "Jumlah barang", lalu aplikasi menghitung harga rata-rata per satuan
  otomatis. Kosongkan keduanya jika harga tidak diubah. Ini hanya mengoreksi harga, tidak
  menambah stok dan tidak tercatat sebagai pembelian (pakai Stok > Belanja untuk itu). Laporan
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
  dipesan, tanpa perlu diaktifkan manual. Muncul juga di halaman Menu (stok) dan Resep (HPP)
  dan Rekap penjualan (stok saat memilih menu, dengan peringatan kalau jumlah pesanan melebihi
  stok — tetap bisa disimpan). Ubah/hapus penjualan yang memakai stok produk ikut mengembalikan
  stoknya dengan benar. Butuh `supabase/9-stok-produk.sql` dan `supabase/10-satuan-produk-dan-akses.sql`.
  Catatan: tab navigasi bawah "Stok" sekarang menuju stok produk ini; stok bahan baku pindah
  ke Lainnya > Stok bahan.
- **Kontras warna otomatis**: warna teks tombol (putih atau gelap) dipilih otomatis mengikuti
  keterbacaan di atas warna tema yang dipilih di Pengaturan, supaya warna terang seperti
  kuning tetap enak dibaca.
## Harga per platform dan salin menu

- Di **Lainnya › Menu**, buka sebuah menu: bagian **Harga per platform** menyimpan harga GoFood, GrabFood, dan
  ShopeeFood sendiri-sendiri (kosong = pakai harga dasar/Offline). Di bawah tiap harga tampil laba dan margin
  terhadap HPP, dihitung setelah komisi platform. Komisi (%) dan target margin bisa diubah (tersimpan di perangkat
  ini), dan tombol "Saran" mengisi harga yang mencapai target margin, dibulatkan ke atas kelipatan Rp500.
- Di **Rekap penjualan**, memilih platform otomatis memakai harga platform itu (masih bisa diubah per baris).
  Penjualan lama tidak berubah. Butuh `supabase/19-harga-per-platform.sql`.
- Tombol **Salin menu ini** membuat menu baru dari menu yang dibuka (opsional beserta resep dan harga platform).
  Stok produksi menu salinan mulai dari nol.

## Impor / ekspor menu (Excel)

Di **Lainnya › Menu › Impor / ekspor**: unduh seluruh menu sebagai CSV (nama, kategori, produk dasar, varian,
isi per penjualan, harga Offline/GoFood/GrabFood/ShopeeFood, tampil di jual, dan HPP sebagai patokan saja),
ubah di Excel, lalu unggah kembali. Pratinjau menunjukkan tiap baris sebagai baru/ubah/sama beserta perubahannya
sebelum diterapkan. Menu dicocokkan lewat nama; kolom kosong atau dihapus tidak mengubah apa pun; isi 0 di kolom
harga platform untuk menghapus harga khusus platform itu. Resep, foto, dan stok tidak ikut. Harga platform butuh SQL 19.

## Produksi tanpa resep

Untuk produk yang dibeli jadi atau belum punya resep produksi (mis. dimsum), tab Produksi menampilkan kolom
**HPP per pcs** untuk diisi manual, jadi stok tetap bisa ditambah tanpa resep (tidak ada bahan terpotong).
Butuh `supabase/20-produksi-tanpa-resep.sql`. Menu yang punya resep produksi tidak berubah.

## Pesanan khusus (di luar menu)

Di **Rekap penjualan** ada tombol **+ Pesanan khusus (di luar menu)**: isi nama pesanan, platform, tanggal,
produk jadi yang keluar (pcs), kemasan/bahan yang keluar (jumlah bebas tiap pesanan), lalu **harga per pcs × jumlah
terjual**. HPP, laba, dan margin tampil langsung sebelum disimpan. Stok produk dan kemasan berkurang, dan pesanan
tercatat sebagai penjualan biasa (ikut Laporan, bisa diubah dan dihapus dari riwayat). Butuh
`supabase/21-pesanan-khusus.sql`. Produk yang dipilih harus sudah punya stok produksi.

## Nama pelanggan dan repeat order

Di Rekap penjualan (semua platform) dan Pesanan khusus ada isian **Nama pelanggan (opsional)** dengan saran nama
lama. Begitu nama diketik, aplikasi menunjukkan apakah ia pelanggan baru atau sudah pernah memesan (berapa kali,
kapan terakhir). Nama tercetak di struk ("Pelanggan: ...") dan tampil di riwayat. **Laporan › Pelanggan** menampilkan
jumlah pelanggan, repeat, dan baru per periode beserta total belanja tiap pelanggan. Butuh
`supabase/22-nama-pelanggan.sql`. Penjualan lama tetap tanpa nama (bisa diisi lewat Ubah).

## Cek pesanan sebelum simpan, dan urutan menu di halaman Jual

- Di Rekap penjualan, memilih menu lalu **Lanjut ›** membuka layar **Cek pesanan**: rincian pesanan, nama pelanggan,
  diskon, dan komisi/promo platform. Untuk GoFood/GrabFood/ShopeeFood tombol Simpan baru aktif kalau diskon dan komisi
  sudah diisi **atau** dicentang "Tidak ada diskon" / "Tidak ada komisi", supaya tidak terlewat. Offline tidak
  diwajibkan.
- **Menu › Atur urutan** mengatur urutan kategori, produk, dan varian yang tampil di Rekap penjualan (tombol ▲▼, lalu
  Simpan urutan). Menu baru tampil paling akhir di kategorinya. Butuh `supabase/23-urutan-menu-jual.sql`, lalu `supabase/24-pengeluaran-promosi.sql`, lalu `supabase/25-aturan-komisi-platform.sql`, lalu `supabase/26-kemasan-per-transaksi.sql`, lalu `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`.

## Pengeluaran promosi (voucher hadiah, sampel, konsumsi sendiri, donasi)

- Menu **Stok → tab Promosi**. Untuk barang yang keluar tanpa penjualan. Pilih jenis, isi keterangan/penerima,
  pilih produk jadi (pcs) dan kemasan/bahan yang ikut keluar (jumlah bebas).
- Stok berkurang, tetapi tidak masuk omzet, penjualan, maupun Terlaris.
- Nilainya (HPP stok) tampil sebagai **Biaya promosi** di Laporan → Laba rugi, beserta rincian per jenis di tab Biaya.
- Riwayat bisa diubah atau dihapus (stok dikembalikan). Staf boleh mencatat; nilai rupiah hanya terlihat pemilik.
- Butuh `supabase/24-pengeluaran-promosi.sql`, lalu `supabase/25-aturan-komisi-platform.sql`, lalu `supabase/26-kemasan-per-transaksi.sql`, lalu `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`.

## Opname oleh karyawan (Stok belanja)

- Akun staf melihat dua tab di Stok belanja: **Stok** dan **Opname**. Belanja dan Pakai tetap hanya untuk pemilik.
- Staf menghitung stok fisik, selisih tampil dalam satuan (tanpa nilai rupiah), lalu ada konfirmasi sebelum disimpan.
- Tidak perlu SQL baru.

## Komisi platform otomatis

- Di Rekap penjualan (GoFood, GrabFood, ShopeeFood) komisi tidak diisi manual lagi. Dihitung dari pendapatan bersih
  (subtotal − diskon): GrabFood 20%, GoFood 20% + Rp1.000 per transaksi, ShopeeFood 25%.
- Angka bisa diubah di **Lainnya › Komisi platform** (pemilik). Dipakai juga untuk saran harga di Menu.
- Saat mengubah penjualan lama, komisi tersimpan dipertahankan; ada tombol "Hitung ulang komisi".
- Pesanan Khusus tetap mengisi komisi manual. SQL `supabase/25-aturan-komisi-platform.sql` hanya untuk menyimpan perubahan angka;
  tanpa SQL itu aplikasi memakai angka bawaan di atas.

## Riwayat produksi (harian, bulanan, tahunan)

- Di **Stok → Produksi**, di bawah form ada **Riwayat produksi** dengan pilihan Harian / Bulanan / Tahunan dan tombol ‹ › untuk pindah periode.
- Isinya: total pcs diproduksi, total per produk, serta rincian tiap catatan produksi beserta Ket (catatan). Tampilan tahunan meringkas per bulan.
- Tidak perlu SQL baru.

## Riwayat penjualan bersih (Laporan › Riwayat)

- Total penjualan bersih (subtotal − diskon − komisi platform) **per hari** (satu bulan), **per bulan** (satu tahun), dan **per tahun** (semua tahun).
- Tiap baris memuat jumlah transaksi, penjualan kotor, diskon, dan komisi. Pesanan Khusus ikut dihitung. Tidak perlu SQL baru.
- Ada juga peringkat **Platform terlaris** (Offline, GoFood, GrabFood, ShopeeFood) untuk periode yang tampil, bisa diurutkan menurut penjualan atau jumlah transaksi.

## Kemasan per transaksi (plastik)

- **Lainnya › Kemasan per transaksi** (pemilik): aturan bahan + jumlah per transaksi + platform yang berlaku (mis. Plastik × 1, semua platform).
- Di layar **Cek pesanan** kartu "Kemasan transaksi ini" terisi otomatis dari aturan. Karyawan bisa mengubah jumlah, menghapus, atau menambah kemasan lain.
- Saat penjualan disimpan, stok kemasan berkurang dan biayanya ditambahkan ke HPP penjualan itu. Mengubah/menghapus penjualan ikut mengembalikan atau menghitung ulang.
- Beda dengan "Dipakai sekali per penjualan" di resep (itu per porsi menu). Jangan pakai keduanya untuk bahan yang sama.
- Pesanan Khusus tetap memakai pilihan kemasan manualnya. Butuh `supabase/26-kemasan-per-transaksi.sql`, lalu `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`.

## Ukuran box otomatis

- **Lainnya › Kemasan per transaksi › Ukuran box otomatis**: daftarkan Box S (maks 10 pcs), Box M (maks 20 pcs), dan kata kunci kategori menu tanpa box (bawaan: frozen).
- Di Cek pesanan, total pcs = porsi × isi (menu dikecualikan tidak dihitung). Aplikasi memilih ukuran terkecil yang muat: 8 pcs → 1 Box S, 15 pcs → 1 Box M, 45 pcs → 3 Box M.
- **Isi per box**: Otomatis, 5, 10, 20, atau angka sendiri (permintaan pelanggan). 40 pcs isi 5 → 8 Box S.
- Stok Box S habis → otomatis Box M dengan catatan. Hasil bisa diubah kasir.
- Jangan masukkan box ke resep (jumlah pecahan membuat stok 49,8). Stok bahan bersatuan pcs/lembar ditampilkan dibulatkan ke bawah (lihat di bawah), jadi pemakaian pecahan tidak membuat angka 49,8.
- Butuh `supabase/27-ukuran-box.sql`, lalu `supabase/28-kemasan-ikutan.sql`.

## Stok bahan per biji dibulatkan

- Bahan bersatuan pcs, lembar, buah, biji, pack, roll, bungkus, pasang, set: stok yang tampil dibulatkan **ke bawah**.
  Contoh: 1 stiker untuk 15 penjualan (resep 0,07 per penjualan). HPP tetap 0,07, tetapi stok 50 lembar menjadi 49 sejak penjualan pertama,
  lalu turun 1 lagi setiap 15 penjualan berikutnya.
- Opname membandingkan dengan angka bulat yang tampil, jadi hitungan fisik 49 sama dengan stok sistem 49 (tanpa selisih).
- Tidak perlu SQL baru.

## Kemasan ikutan (kabel ties ikut plastik)

- Di **Lainnya › Kemasan per transaksi**, saat menambah/mengubah aturan pilih **Kapan muncul: Ikut kemasan lain**, lalu pilih kemasan pemicu
  (mis. Plastik PE UK 24, UK 35). Kabel Ties × 1 otomatis muncul di Cek pesanan bila salah satu plastik itu ada, dan hilang bila plastiknya dihapus.
- Centang "jumlah mengikuti jumlah kemasan pemicu" bila 1 per plastik; tanpa centang = sekali per transaksi.
- Jumlah yang diubah kasir tidak ditimpa. Butuh `supabase/28-kemasan-ikutan.sql`.

## Urutan komisi setelah pendapatan bersih

- **Pendapatan bersih** = penjualan kotor − diskon. Komisi platform dihitung dari angka ini dan ditampilkan **sesudahnya**,
  lalu **Diterima setelah komisi**. Berlaku di Cek pesanan, Pesanan Khusus, Laporan › Laba rugi, dan Laporan › Riwayat.
- Hanya tampilan; data penjualan dan laba tidak berubah. Beranda memakai label "Diterima hari ini".

## Hitung ulang komisi penjualan lama
- Di Lainnya › Komisi platform ada kartu "Terapkan ke penjualan lama": pilih tanggal dari/sampai (atau Hari ini, 7 hari, Bulan ini), klik "Lihat pratinjau perubahan" untuk melihat komisi lama dan baru per platform, lalu "Terapkan perubahan komisi".
- Simpan aturan komisi dulu; yang dipakai adalah aturan yang tersimpan.
- Hanya GoFood, GrabFood, ShopeeFood. Penjualan offline dan Pesanan Khusus tidak diubah. Laporan laba periode itu ikut berubah.
- Butuh `supabase/25-aturan-komisi-platform.sql` dan `supabase/29-hitung-ulang-komisi.sql`.

## Menu paket (bundling)
- Contoh: "Hampers Original isi 18 Gratis Pisang Cokelat isi 15". Buat sebagai menu biasa dengan harga paket (mis. Rp68.000), lalu di Menu › buka menu itu › "Jadikan menu paket" dan pilih isinya (Hampers isi 18 × 1, Pisang Cokelat isi 15 × 1).
- Saat paket terjual, stok tiap isi berkurang (jumlah × isi per penjualan masing-masing). HPP paket = jumlah HPP isinya, jadi barang gratis tetap tercatat sebagai biaya.
- Di halaman Jual, paket menampilkan isinya dan "stok cukup untuk N paket"; peringatan stok memeriksa semua isi.
- Paket tidak dihitung ke aturan box otomatis (pakai kemasan per transaksi/manual seperti hampers).
- Laporan mencatat satu baris "paket" dengan omzet harga paket. Isi paket tidak bertingkat (paket di dalam paket).
- Butuh `supabase/30-menu-paket.sql`.
