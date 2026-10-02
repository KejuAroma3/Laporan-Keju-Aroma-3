-- ============================================================
-- 10) SATUAN PRODUK. Jalankan setelah 1-9. Aman dijalankan berulang.
--     Menambah satuan per menu (pcs/lembar/porsi/dst), dipakai di
--     halaman Produksi dan Rekap penjualan. Bawaannya "pcs".
--     Menu yang sudah ada otomatis ikut jadi "pcs".
-- ============================================================

alter table menu_items add column if not exists stock_unit text not null default 'pcs';

create or replace view v_product_stock with (security_invoker = true) as
select mi.id, mi.name, mi.category, mi.track_stock, mi.avg_product_cost, mi.min_product_stock,
       mi.stock_unit,
       coalesce(sum(pm.qty), 0) as stock_on_hand,
       mi.track_stock and coalesce(sum(pm.qty), 0) <= mi.min_product_stock as is_low
from menu_items mi
left join product_movements pm on pm.menu_item_id = mi.id
where mi.is_active = true
group by mi.id;

grant select on v_product_stock to authenticated;
notify pgrst, 'reload schema';

-- ============================================================
-- CATATAN SOAL AKSES STAF: pembagian akses (pemilik vs staf) di aplikasi
-- ini bekerja di tampilan, memakai peran di tabel profiles yang sudah ada
-- sejak supabase/4-karyawan.sql. Tidak ada tabel atau kolom baru untuk itu,
-- jadi tidak ada yang perlu dijalankan di sini untuk bagian akses.
--
-- PENTING: ini pembatasan tampilan, bukan pembatasan database. Kebijakan
-- (RLS) tabel ingredients, menu_items, expenses, dan stock_movements masih
-- mengizinkan SEMUA akun yang login untuk membaca datanya, termasuk angka
-- rupiahnya, lewat API Supabase secara langsung (bukan lewat tampilan
-- aplikasi). Untuk staf yang tidak paham teknis, ini sudah cukup. Kalau
-- Anda butuh jaminan yang benar-benar diberlakukan di database (bukan
-- hanya disembunyikan di layar), itu perlu pekerjaan tambahan yang lebih
-- besar (kebijakan RLS per kolom). Beri tahu saya kalau itu diperlukan.
-- ============================================================
