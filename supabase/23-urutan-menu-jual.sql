-- ============================================================
-- 23) URUTAN MENU DI HALAMAN JUAL. Jalankan setelah 1-22. Aman diulang.
--
--     Urutan tampil menu (dan kategori) di Rekap penjualan bisa diatur
--     lewat Menu > Atur urutan. 0 = belum diatur (menu baru tampil
--     paling akhir di kategorinya, urut abjad).
-- ============================================================

alter table menu_items add column if not exists sell_order int not null default 0;

notify pgrst, 'reload schema';
