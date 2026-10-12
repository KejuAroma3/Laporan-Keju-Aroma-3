-- ============================================================
-- 14) URUTAN LIST PRODUKSI & STOK GABUNGAN VARIAN.
--     Jalankan setelah 1-13. Aman dijalankan berulang.
--
--     1. Urutan dan tampil/sembunyi di halaman Produksi, diatur dari
--        Produksi > Atur (kolom production_order dan hide_in_production).
--     2. "Satukan varian": untuk produk dasar yang bahan dasarnya sama
--        dan hanya beda varian/topping. Semua varian memakai SATU stok
--        produk (disimpan di satu menu "pemegang stok"). Penjualan varian
--        apa pun mengurangi stok itu, dan produksi dicatat sekali untuk
--        produk dasarnya. Resep yang dipakai untuk produksi = resep menu
--        pemegang stok.
--
--     Jangan jalankan ulang 9-stok-produk.sql setelah ini, karena akan
--     mengembalikan record_sale versi lama.
-- ============================================================

alter table menu_items    add column if not exists production_order integer not null default 0;
alter table menu_items    add column if not exists hide_in_production boolean not null default false;
alter table product_groups add column if not exists production_order integer not null default 0;
alter table product_groups add column if not exists hide_in_production boolean not null default false;
alter table product_groups add column if not exists shared_stock boolean not null default false;
alter table product_groups add column if not exists stock_menu_id uuid references menu_items on delete set null;

-- Menu yang menyimpan stok untuk menu ini: pemegang stok grupnya kalau
-- grup memakai stok gabungan, kalau tidak menu itu sendiri.
create or replace function stock_holder(p_menu uuid)
returns uuid language sql stable as $$
  select coalesce(
    (select g.stock_menu_id
       from menu_items mi join product_groups g on g.id = mi.product_group_id
      where mi.id = p_menu and g.shared_stock and g.stock_menu_id is not null),
    p_menu);
$$;

-- Penjualan: sama seperti versi 9, tetapi stok produk dibaca/dikurangi di
-- menu pemegang stok (untuk varian dari grup stok gabungan).
create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric; v_menu uuid; v_holder uuid; v_qty int; v_tracked boolean; v_prodcost numeric;
begin
  insert into sales(channel,discount,platform_fee,sold_at)
  values (p_channel,p_discount,p_fee,p_sold_at) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_qty := (it->>'qty')::int;
    v_holder := stock_holder(v_menu);

    select track_stock, avg_product_cost into v_tracked, v_prodcost
      from menu_items where id = v_holder;

    if coalesce(v_tracked, false) then
      v_cogs := coalesce(v_prodcost, 0);

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id)
      values (v_holder, 'sale', -v_qty, v_cogs, v_sale);
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

-- Menyatukan stok varian dalam satu produk dasar. Stok produk jadi yang
-- sudah ada di varian lain dipindahkan ke menu pemegang stok (HPP dihitung
-- rata-rata tertimbang), lalu varian lain tidak lagi memegang stok sendiri.
create or replace function merge_group_stock(p_group uuid, p_holder uuid)
returns void language plpgsql as $$
declare r record; v_hold numeric;
begin
  if not exists (select 1 from menu_items where id = p_holder and product_group_id = p_group) then
    raise exception 'Menu pemegang stok harus salah satu varian dari produk dasar ini';
  end if;

  for r in
    select mi.id, mi.avg_product_cost as cost, coalesce(sum(pm.qty), 0) as s
      from menu_items mi left join product_movements pm on pm.menu_item_id = mi.id
     where mi.product_group_id = p_group and mi.id <> p_holder and mi.track_stock
     group by mi.id
  loop
    if r.s <> 0 then
      select coalesce(sum(qty), 0) into v_hold from product_movements where menu_item_id = p_holder;
      if r.s > 0 then
        update menu_items set
          avg_product_cost = (greatest(v_hold, 0) * avg_product_cost + r.s * r.cost) / (greatest(v_hold, 0) + r.s),
          track_stock = true
        where id = p_holder;
      else
        update menu_items set track_stock = true where id = p_holder;
      end if;
      insert into product_movements(menu_item_id, type, qty, unit_cost, note) values
        (r.id,     'adjustment', -r.s, r.cost, 'Digabung ke stok produk dasar'),
        (p_holder, 'adjustment',  r.s, r.cost, 'Digabung dari varian lain');
    end if;
    update menu_items set track_stock = false where id = r.id;
  end loop;

  update product_groups set shared_stock = true, stock_menu_id = p_holder where id = p_group;
end $$;

-- Tampilan stok produk: tambah kolom urutan dan sembunyi (kolom baru di akhir).
create or replace view v_product_stock with (security_invoker = true) as
select mi.id, mi.name, mi.category, mi.track_stock, mi.avg_product_cost, mi.min_product_stock,
       mi.stock_unit, mi.product_group_id, mi.variant_name,
       coalesce(sum(pm.qty), 0) as stock_on_hand,
       mi.track_stock and coalesce(sum(pm.qty), 0) <= mi.min_product_stock as is_low,
       mi.production_order, mi.hide_in_production
from menu_items mi
left join product_movements pm on pm.menu_item_id = mi.id
where mi.is_active = true
group by mi.id;

grant select on v_product_stock to authenticated;
grant execute on function stock_holder(uuid) to authenticated;
grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
grant execute on function merge_group_stock(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
