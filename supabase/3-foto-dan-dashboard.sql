-- ============================================================
-- 3) FOTO PRODUK + DASHBOARD. Jalankan setelah 1 dan 2.
--    Aman dijalankan berulang kali.
-- ============================================================

-- Kolom foto di tabel menu
alter table menu_items add column if not exists photo_url text;

-- Bucket penyimpanan foto produk (publik agar foto tampil di aplikasi)
insert into storage.buckets (id, name, public)
values ('produk', 'produk', true)
on conflict (id) do nothing;

drop policy if exists "produk read publik" on storage.objects;
create policy "produk read publik"
on storage.objects for select
using (bucket_id = 'produk');

drop policy if exists "produk tulis login" on storage.objects;
create policy "produk tulis login"
on storage.objects for insert
to authenticated
with check (bucket_id = 'produk');

drop policy if exists "produk ubah login" on storage.objects;
create policy "produk ubah login"
on storage.objects for update
to authenticated
using (bucket_id = 'produk');

drop policy if exists "produk hapus login" on storage.objects;
create policy "produk hapus login"
on storage.objects for delete
to authenticated
using (bucket_id = 'produk');

-- report_best_sellers diperluas: sertakan id produk dan foto,
-- supaya dashboard bisa menampilkan thumbnail dan tautan yang stabil.
drop function if exists report_best_sellers(date, date);
create function report_best_sellers(p_from date, p_to date)
returns table(menu_item_id uuid, menu text, category text, photo_url text,
              qty_sold bigint, revenue numeric, gross_profit numeric)
language sql as $$
  select mi.id, mi.name, mi.category, mi.photo_url, sum(si.qty),
         sum(si.qty*si.unit_price), sum(si.qty*(si.unit_price-si.unit_cogs))
  from sale_items si
  join sales sa on sa.id = si.sale_id
  join menu_items mi on mi.id = si.menu_item_id
  where (sa.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by mi.id order by 5 desc;
$$;

-- Indeks agar dashboard (dipanggil tiap ganti tanggal/periode) tetap cepat
create index if not exists idx_sales_sold_at on sales (sold_at);
create index if not exists idx_sale_items_sale_id on sale_items (sale_id);
create index if not exists idx_sale_items_menu_item_id on sale_items (menu_item_id);
create index if not exists idx_stock_movements_ingredient_id on stock_movements (ingredient_id);
create index if not exists idx_stock_movements_created_at on stock_movements (created_at);
create index if not exists idx_expenses_spent_on on expenses (spent_on);

grant execute on function report_best_sellers(date, date) to authenticated;
