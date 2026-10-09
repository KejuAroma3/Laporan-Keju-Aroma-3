-- ============================================================
-- 13) PRODUK DASAR & VARIAN. Jalankan setelah 1-12. Aman diulang.
--
--     Mengelompokkan menu yang beda varian (isi/topping) dari produk
--     dasar yang sama, misalnya "Keju Aroma" dengan varian Original,
--     Cokelat, Stroberi. Tiap varian TETAP jadi menu penuh sendiri-
--     sendiri (resep, stok produksi, dan HPP masing-masing terpisah),
--     supaya mengubah resep satu varian tidak diam-diam mengubah HPP
--     varian lain. product_group hanya untuk PENGELOMPOKAN tampilan:
--     di Menu dan resep, Rekap penjualan, Produksi, dan Laporan.
-- ============================================================

create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text
);

alter table menu_items add column if not exists product_group_id uuid references product_groups;
alter table menu_items add column if not exists variant_name text;

alter table product_groups enable row level security;
drop policy if exists "produk dasar akses login" on product_groups;
create policy "produk dasar akses login"
on product_groups for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on product_groups to authenticated;

-- Perluas v_product_stock supaya halaman Produksi bisa mengelompokkan
-- varian di bawah nama produk dasarnya tanpa kueri tambahan.
create or replace view v_product_stock with (security_invoker = true) as
select mi.id, mi.name, mi.category, mi.track_stock, mi.avg_product_cost, mi.min_product_stock,
       mi.stock_unit, mi.product_group_id, mi.variant_name,
       coalesce(sum(pm.qty), 0) as stock_on_hand,
       mi.track_stock and coalesce(sum(pm.qty), 0) <= mi.min_product_stock as is_low
from menu_items mi
left join product_movements pm on pm.menu_item_id = mi.id
where mi.is_active = true
group by mi.id;

grant select on v_product_stock to authenticated;

-- Perluas report_best_sellers supaya Laporan bisa menampilkan total per
-- produk dasar (jumlah semua variannya digabung), bukan cuma per varian.
drop function if exists report_best_sellers(date, date);
create function report_best_sellers(p_from date, p_to date)
returns table(menu_item_id uuid, menu text, category text, photo_url text,
              product_group_id uuid, variant_name text,
              qty_sold bigint, revenue numeric, gross_profit numeric)
language sql as $$
  select mi.id, mi.name, mi.category, mi.photo_url, mi.product_group_id, mi.variant_name,
         sum(si.qty), sum(si.qty*si.unit_price), sum(si.qty*(si.unit_price-si.unit_cogs))
  from sale_items si
  join sales sa on sa.id = si.sale_id
  join menu_items mi on mi.id = si.menu_item_id
  where (sa.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by mi.id order by 7 desc;
$$;

grant execute on function report_best_sellers(date, date) to authenticated;
notify pgrst, 'reload schema';
