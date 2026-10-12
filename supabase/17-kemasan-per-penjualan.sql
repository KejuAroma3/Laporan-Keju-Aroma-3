-- ============================================================
-- 17) KEMASAN & PERLENGKAPAN DI RESEP. Jalankan setelah 1-16. Aman diulang.
--
--     Bahan kemasan (plastik, box, label) dan habis pakai (handgloves,
--     kabel ties) sudah bisa dimasukkan ke resep dan stoknya dikontrol
--     lewat Stok bahan. Yang ditambah di sini: tiap baris resep bisa
--     ditandai "dipakai saat dijual" (per_sale).
--       - Tidak ditandai (bawaan): dipakai saat PRODUKSI, ikut dihitung di
--         HPP per pcs produk jadi (cocok untuk plastik/label per pcs).
--       - Ditandai: dipakai tiap PENJUALAN, dipotong dari stok saat terjual
--         dan ditambahkan ke HPP penjualan itu (cocok untuk box hampers,
--         kantong belanja, yang dipakai per kotak yang dijual).
--     Menu yang dibuat saat dipesan (belum pernah diproduksi) tetap
--     memotong semua bahan saat terjual, tanda ini tidak berpengaruh.
--
--     Jangan jalankan ulang 9, 14, atau 15 setelah ini, karena akan
--     mengembalikan fungsi lama.
-- ============================================================

alter table recipe_items add column if not exists per_sale boolean not null default false;

-- Produksi: hanya bahan yang tidak ditandai per_sale.
create or replace function record_production(p_menu uuid, p_qty numeric, p_note text default null)
returns void language plpgsql as $$
declare v_cost_per_unit numeric; v_old_stock numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah produksi harus lebih dari 0';
  end if;
  if not exists (select 1 from recipe_items where menu_item_id = p_menu and not per_sale) then
    raise exception 'Menu ini belum punya resep produksi. Isi resep dulu di Resep sebelum produksi.';
  end if;

  select coalesce(sum(r.qty * i.avg_cost), 0) into v_cost_per_unit
    from recipe_items r join ingredients i on i.id = r.ingredient_id
   where r.menu_item_id = p_menu and not r.per_sale;

  insert into stock_movements(ingredient_id, type, qty, unit_cost, note)
  select r.ingredient_id, 'production_usage', -(r.qty * p_qty), i.avg_cost,
         coalesce(p_note, 'Produksi ' || p_qty || ' porsi')
    from recipe_items r join ingredients i on i.id = r.ingredient_id
   where r.menu_item_id = p_menu and not r.per_sale;

  select coalesce(sum(qty), 0) into v_old_stock from product_movements where menu_item_id = p_menu;

  update menu_items set
    avg_product_cost = (greatest(v_old_stock, 0) * avg_product_cost + v_cost_per_unit * p_qty)
                        / (greatest(v_old_stock, 0) + p_qty),
    track_stock = true
  where id = p_menu;

  insert into product_movements(menu_item_id, type, qty, unit_cost, note)
  values (p_menu, 'production', p_qty, v_cost_per_unit, p_note);
end $$;

-- Penjualan: versi 15 + bahan per_sale dipotong dan masuk HPP saat terjual.
create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric; v_menu uuid; v_holder uuid; v_qty int;
        v_tracked boolean; v_prodcost numeric; v_pack numeric; v_salecost numeric;
begin
  insert into sales(channel,discount,platform_fee,sold_at)
  values (p_channel,p_discount,p_fee,p_sold_at) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_qty := (it->>'qty')::int;
    v_holder := stock_holder(v_menu);

    select coalesce(pack_qty, 1) into v_pack from menu_items where id = v_menu;
    select track_stock, avg_product_cost into v_tracked, v_prodcost
      from menu_items where id = v_holder;

    if coalesce(v_tracked, false) then
      select coalesce(sum(r.qty * i.avg_cost), 0) into v_salecost
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu and r.per_sale;

      v_cogs := coalesce(v_prodcost, 0) * v_pack + v_salecost;

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id)
      values (v_holder, 'sale', -(v_qty * v_pack), coalesce(v_prodcost, 0), v_sale);

      insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
      select r.ingredient_id,'sale_usage',-(r.qty * v_qty), i.avg_cost, v_sale
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu and r.per_sale;
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

grant execute on function record_production(uuid, numeric, text) to authenticated;
grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
notify pgrst, 'reload schema';
