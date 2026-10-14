-- ============================================================
-- 21) PESANAN KHUSUS. Jalankan setelah 1-20. Aman diulang.
--
--     Pesanan yang tidak ada di daftar menu (mis. 228 pcs Keju Aroma
--     Original dengan kemasan yang berbeda-beda tiap pesanan).
--       - Pendapatan = harga per pcs x jumlah pcs terjual.
--       - Stok produk jadi (pcs) dan kemasan/bahan yang keluar diisi bebas
--         per pesanan; HPP dihitung dari HPP stok produk dan harga rata-rata
--         bahan saat pesanan dicatat.
--       - Tercatat sebagai penjualan biasa (ikut laporan, bisa diubah dan
--         dihapus lewat delete_sale yang sudah ada). Memakai satu menu
--         tersembunyi bernama "Pesanan Khusus".
--     Rincian pesanan disimpan di custom_orders dan custom_order_lines
--     (ikut terhapus bersama penjualannya).
--
--     Jangan jalankan ulang 9, 14, 15, atau 17 setelah ini.
-- ============================================================

create table if not exists custom_orders (
  sale_id uuid primary key references sales on delete cascade,
  name text not null,
  unit_price numeric not null,
  qty numeric not null
);

create table if not exists custom_order_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales on delete cascade,
  kind text not null check (kind in ('produk', 'bahan')),
  ref_id uuid not null,       -- menu_items.id (produk) atau ingredients.id (bahan)
  qty numeric not null check (qty > 0)
);
create index if not exists idx_custom_order_lines_sale_id on custom_order_lines (sale_id);

alter table custom_orders enable row level security;
alter table custom_order_lines enable row level security;
drop policy if exists "pesanan khusus akses login" on custom_orders;
create policy "pesanan khusus akses login" on custom_orders for all to authenticated using (true) with check (true);
drop policy if exists "baris pesanan khusus akses login" on custom_order_lines;
create policy "baris pesanan khusus akses login" on custom_order_lines for all to authenticated using (true) with check (true);
grant select, insert, update, delete on custom_orders to authenticated;
grant select, insert, update, delete on custom_order_lines to authenticated;

-- p_products: [{"menu_item_id": uuid, "qty": number}]  (qty dalam pcs stok produk)
-- p_supplies: [{"ingredient_id": uuid, "qty": number}]  (qty dalam satuan bahan)
create or replace function record_custom_order(
  p_name text, p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_unit_price numeric, p_qty numeric,
  p_products jsonb, p_supplies jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; v_shadow uuid; it jsonb; v_menu uuid; v_holder uuid; v_q numeric;
        v_tracked boolean; v_cost numeric; v_total_cost numeric := 0; v_ing uuid; v_avg numeric;
begin
  if p_name is null or btrim(p_name) = '' then raise exception 'Nama pesanan wajib diisi'; end if;
  if p_qty is null or p_qty <= 0 or p_qty <> trunc(p_qty) then raise exception 'Jumlah terjual harus bilangan bulat lebih dari 0'; end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'Harga per pcs tidak valid'; end if;

  insert into menu_items(name, category, price, is_active)
  values ('Pesanan Khusus', 'Pesanan Khusus', 0, false)
  on conflict (name) do nothing;
  select id into v_shadow from menu_items where name = 'Pesanan Khusus';

  insert into sales(channel, discount, platform_fee, sold_at, note)
  values (p_channel, coalesce(p_discount, 0), coalesce(p_fee, 0), p_sold_at, 'Pesanan khusus: ' || btrim(p_name))
  returning id into v_sale;

  -- produk jadi: stok dikurangi di menu pemegang stok, HPP = HPP stok
  for it in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_q := (it->>'qty')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    v_holder := stock_holder(v_menu);
    select track_stock, avg_product_cost into v_tracked, v_cost from menu_items where id = v_holder;
    if not coalesce(v_tracked, false) then
      raise exception 'Produk "%" belum punya stok produksi. Catat produksinya dulu.', (select name from menu_items where id = v_menu);
    end if;
    insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id, note)
    values (v_holder, 'sale', -v_q, coalesce(v_cost, 0), v_sale, 'Pesanan khusus: ' || btrim(p_name));
    v_total_cost := v_total_cost + v_q * coalesce(v_cost, 0);
    insert into custom_order_lines(sale_id, kind, ref_id, qty) values (v_sale, 'produk', v_menu, v_q);
  end loop;

  -- kemasan / bahan: stok bahan dikurangi, HPP = harga rata-rata
  for it in select * from jsonb_array_elements(coalesce(p_supplies, '[]'::jsonb)) loop
    v_ing := (it->>'ingredient_id')::uuid;
    v_q := (it->>'qty')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    select avg_cost into v_avg from ingredients where id = v_ing;
    insert into stock_movements(ingredient_id, type, qty, unit_cost, sale_id, note)
    values (v_ing, 'sale_usage', -v_q, coalesce(v_avg, 0), v_sale, 'Pesanan khusus: ' || btrim(p_name));
    v_total_cost := v_total_cost + v_q * coalesce(v_avg, 0);
    insert into custom_order_lines(sale_id, kind, ref_id, qty) values (v_sale, 'bahan', v_ing, v_q);
  end loop;

  insert into sale_items(sale_id, menu_item_id, qty, unit_price, unit_cogs)
  values (v_sale, v_shadow, p_qty::int, p_unit_price, v_total_cost / p_qty);

  insert into custom_orders(sale_id, name, unit_price, qty) values (v_sale, btrim(p_name), p_unit_price, p_qty);
  return v_sale;
end $$;

-- Ubah pesanan khusus: stok lama dikembalikan, lalu dicatat ulang (HPP dihitung ulang dari harga sekarang).
create or replace function update_custom_order(
  p_sale uuid, p_name text, p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_unit_price numeric, p_qty numeric,
  p_products jsonb, p_supplies jsonb)
returns uuid language plpgsql as $$
begin
  if not exists (select 1 from custom_orders where sale_id = p_sale) then
    raise exception 'Pesanan khusus tidak ditemukan (mungkin sudah dihapus)';
  end if;
  delete from product_movements where sale_id = p_sale;
  delete from stock_movements where sale_id = p_sale;
  delete from sales where id = p_sale;
  return record_custom_order(p_name, p_channel, p_discount, p_fee, p_sold_at, p_unit_price, p_qty, p_products, p_supplies);
end $$;

grant execute on function record_custom_order(text, sales_channel, numeric, numeric, timestamptz, numeric, numeric, jsonb, jsonb) to authenticated;
grant execute on function update_custom_order(uuid, text, sales_channel, numeric, numeric, timestamptz, numeric, numeric, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
