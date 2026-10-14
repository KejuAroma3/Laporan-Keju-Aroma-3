-- ============================================================
-- 22) NAMA PELANGGAN DI PENJUALAN. Jalankan setelah 1-21. Aman diulang.
--
--     Tiap penjualan (semua platform, termasuk pesanan khusus) boleh
--     diberi nama pelanggan. Dipakai untuk mengenali pelanggan yang
--     repeat order, dicetak di struk, dan ditampilkan di Laporan >
--     Pelanggan. Kolom ini opsional; penjualan lama tetap tanpa nama.
-- ============================================================

alter table sales add column if not exists customer_name text;
create index if not exists idx_sales_customer_name on sales (lower(customer_name)) where customer_name is not null;

notify pgrst, 'reload schema';
