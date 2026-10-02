-- ============================================================
-- 11) KATEGORI BAHAN. Jalankan setelah 1-10. Aman dijalankan berulang.
--     Menambah kategori per bahan baku (misalnya "Bahan baku",
--     "Bahan kemasan", "Bahan habis pakai"), supaya daftar bahan dan
--     pemilihan bahan saat menyusun resep bisa dikelompokkan, tidak
--     tercampur jadi satu daftar panjang.
-- ============================================================

alter table ingredients add column if not exists category text;

-- Hapus dulu view lama agar tidak error saat mengubah struktur kolom
drop view if exists v_stock;

create view v_stock with (security_invoker = true) as
select i.id, i.name, i.unit, i.category, i.min_stock, i.avg_cost,
       coalesce(sum(m.qty),0) as on_hand,
       coalesce(sum(m.qty),0) <= i.min_stock as is_low
from ingredients i 
left join stock_movements m on m.ingredient_id = i.id
group by i.id, i.name, i.unit, i.category, i.min_stock, i.avg_cost;

grant select on v_stock to authenticated;
notify pgrst, 'reload schema';