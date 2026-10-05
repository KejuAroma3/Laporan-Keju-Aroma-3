-- ============================================================
-- 12) PENGATURAN STRUK. Jalankan setelah 1-11. Aman dijalankan berulang.
--     Menambah pengaturan ukuran kertas dan teks footer untuk cetak struk.
-- ============================================================

alter table app_settings add column if not exists receipt_width_mm integer not null default 58;
alter table app_settings add column if not exists receipt_footer text not null default 'Terima kasih!';

notify pgrst, 'reload schema';
