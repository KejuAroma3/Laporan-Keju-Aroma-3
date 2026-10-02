-- ============================================================
-- 9) STOK PRODUK JADI. Jalankan setelah 1-8. Aman dijalankan berulang,
--    KECUALI baris "alter type ... add value" (lihat catatan di bawah).
--
--    Menambah lapisan stok per PRODUK (pcs/porsi di menu), terpisah dari
--    stok per BAHAN yang sudah ada. Dipakai untuk menu yang diproduksi
--    dalam batch (misalnya digoreng/dikemas duluan), bukan dibuat saat
--    ada pesanan.
--
--    Cara kerja:
--    - Produksi: mengonsumsi bahan sesuai resep x jumlah produksi, lalu
--      menambah stok produk. HPP produk dihitung dari biaya bahan saat
--      produksi (rata-rata tertimbang, sama seperti harga bahan).
--    - Setelah menu pernah diproduksi sekali, penjualan menu itu akan
--      mengurangi STOK PRODUK, bukan menghitung ulang bahan setiap kali
--      laku. Menu yang belum pernah diproduksi tetap seperti sebelumnya:
--      bahan langsung terpotong sesuai resep saat terjual (dibuat saat
--      dipesan). Tidak perlu diaktifkan manual, dan tidak mengubah data
--      penjualan yang sudah ada.
--    - Sama seperti stok bahan (v_stock), jumlah stok produk yang ada
--      TIDAK disimpan sebagai angka terpisah, tapi selalu dihitung ulang
--      dari total riwayat (product_movements) lewat view v_product_stock.
--      Ini supaya tidak mungkin selisih antara riwayat dan angka stok.
-- ============================================================

alter type movement_type add value if not exists 'production_usage';

alter table menu_items add column if not exists avg_product_cost numeric not null default 0;
alter table menu_items add column if not exists min_product_stock numeric not null default 0;
alter table menu_items add column if not exists track_stock boolean not null default false;

create table if not exists product_movements (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items,
  type text not null check (type in ('production','sale','waste','adjustment')),
  qty numeric not null,              -- + produksi/penyesuaian naik, - jual/waste/penyesuaian turun
  unit_cost numeric,
  sale_id uuid references sales,
  note text,
  created_at timestamptz not null default now()
);

alter table product_movements enable row level security;
drop policy if exists "produksi akses login" on product_movements;
create policy "produksi akses login"
on product_movements for all
to authenticated
using (true)
with check (true);

create index if not exists idx_product_movements_menu_item_id on product_movements (menu_item_id);
create index if not exists idx_product_movements_created_at on product_movements (created_at);
create index if not exists idx_product_movements_sale_id on product_movements (sale_id);

-- ---------- Produksi ----------
create or replace function record_production(p_menu uuid, p_qty numeric, p_note text default null)
returns void language plpgsql as $$
declare v_cost_per_unit numeric; v_old_stock numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah produksi harus lebih dari 0';
  end if;
  if not exists (select 1 from recipe_items where menu_item_id = p_menu) then
    raise exception 'Menu ini belum punya resep. Isi resep dulu di Menu dan resep sebelum produksi.';
  end if;

  -- biaya bahan untuk 1 porsi resep, di harga bahan saat ini (bisa Rp0 kalau
  -- bahannya belum pernah dibeli; itu bukan kesalahan, HPP produk sementara
  -- ikut Rp0 sampai bahan dibeli lewat Stok > Masuk)
  select coalesce(sum(r.qty * i.avg_cost), 0) into v_cost_per_unit
    from recipe_items r join ingredients i on i.id = r.ingredient_id
   where r.menu_item_id = p_menu;

  insert into stock_movements(ingredient_id, type, qty, unit_cost, note)
  select r.ingredient_id, 'production_usage', -(r.qty * p_qty), i.avg_cost,
         coalesce(p_note, 'Produksi ' || p_qty || ' porsi')
    from recipe_items r join ingredients i on i.id = r.ingredient_id
   where r.menu_item_id = p_menu;

  select coalesce(sum(qty), 0) into v_old_stock from product_movements where menu_item_id = p_menu;

  update menu_items set
    avg_product_cost = (greatest(v_old_stock, 0) * avg_product_cost + v_cost_per_unit * p_qty)
                        / (greatest(v_old_stock, 0) + p_qty),
    track_stock = true
  where id = p_menu;

  insert into product_movements(menu_item_id, type, qty, unit_cost, note)
  values (p_menu, 'production', p_qty, v_cost_per_unit, p_note);
end $$;

-- ---------- Penjualan (diganti agar bercabang: pakai stok produk kalau
-- menu itu track_stock, kalau tidak berperilaku persis seperti sebelumnya) ----------
create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric; v_menu uuid; v_qty int; v_tracked boolean; v_prodcost numeric;
begin
  insert into sales(channel,discount,platform_fee,sold_at)
  values (p_channel,p_discount,p_fee,p_sold_at) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_qty := (it->>'qty')::int;

    select track_stock, avg_product_cost into v_tracked, v_prodcost
      from menu_items where id = v_menu;

    if coalesce(v_tracked, false) then
      v_cogs := coalesce(v_prodcost, 0);

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id)
      values (v_menu, 'sale', -v_qty, v_cogs, v_sale);
    else
      select coalesce(sum(r.qty * i.avg_cost),0) into v_cogs
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu;

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
      select r.ingredient_id,'sale_usage',-(r.qty * v_qty), i.avg_cost, v_sale
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu;
    end if;
  end loop;
  return v_sale;
end $$;

-- ---------- Hapus/ubah penjualan (dari 8-koreksi-penjualan.sql), diganti
-- agar ikut membalikkan pemakaian stok produk lewat riwayatnya ----------
create or replace function delete_sale(p_sale uuid)
returns void language plpgsql as $$
begin
  if not exists (select 1 from sales where id = p_sale) then
    raise exception 'Penjualan tidak ditemukan (mungkin sudah dihapus)';
  end if;
  delete from product_movements where sale_id = p_sale;
  delete from stock_movements where sale_id = p_sale;
  delete from sales where id = p_sale;
end $$;

create or replace function update_sale(
  p_sale uuid,
  p_channel sales_channel,
  p_discount numeric,
  p_fee numeric,
  p_sold_at timestamptz,
  p_items jsonb)
returns uuid language plpgsql as $$
declare v_old jsonb; v_new uuid;
begin
  if not exists (select 1 from sales where id = p_sale) then
    raise exception 'Penjualan tidak ditemukan (mungkin sudah dihapus)';
  end if;

  select jsonb_object_agg(menu_item_id::text, unit_cogs) into v_old
    from sale_items where sale_id = p_sale;

  delete from product_movements where sale_id = p_sale;
  delete from stock_movements where sale_id = p_sale;
  delete from sales where id = p_sale;

  v_new := record_sale(p_channel, p_discount, p_fee, p_sold_at, p_items);

  update sale_items si
     set unit_cogs = coalesce((v_old ->> si.menu_item_id::text)::numeric, si.unit_cogs)
   where si.sale_id = v_new;

  return v_new;
end $$;

-- ---------- Stok produk (dihitung dari riwayat, sama pola dengan v_stock) ----------
create view v_product_stock with (security_invoker = true) as
select mi.id, mi.name, mi.category, mi.track_stock, mi.avg_product_cost, mi.min_product_stock,
       coalesce(sum(pm.qty), 0) as stock_on_hand,
       mi.track_stock and coalesce(sum(pm.qty), 0) <= mi.min_product_stock as is_low
from menu_items mi
left join product_movements pm on pm.menu_item_id = mi.id
where mi.is_active = true
group by mi.id;

grant execute on function record_production(uuid, numeric, text) to authenticated;
grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
grant execute on function delete_sale(uuid) to authenticated;
grant execute on function update_sale(uuid, sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
grant select on v_product_stock to authenticated;

notify pgrst, 'reload schema';
