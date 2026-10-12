-- ============================================================
-- 18) ISI PER PENJUALAN BERLAKU UNTUK SEMUA MENU. Jalankan setelah 1-17.
--     Aman diulang.
--
--     Sebelumnya "isi" (pack_qty) hanya dipakai menu yang diproduksi dalam
--     batch (punya stok produk). Menu yang dibuat saat dipesan memotong
--     bahan sesuai resep untuk SATU penjualan, tanpa dikali isi.
--
--     Sekarang resep SELALU dihitung per 1 pcs, dan satu penjualan memakai
--     (resep x isi). Bahan yang ditandai "dipakai saat dijual" (per_sale)
--     tidak dikali isi: dihitung sekali per penjualan.
--     Untuk menu dengan isi 1 (bawaan) hasilnya sama persis seperti
--     sebelumnya. Penjualan yang sudah tercatat tidak berubah.
--
--     Jangan jalankan ulang 9, 14, 15, atau 17 setelah ini, karena akan
--     mengembalikan record_sale versi lama.
-- ============================================================

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
      -- punya stok produk: bahan produksi sudah terpotong saat produksi
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
      -- dibuat saat dipesan: semua bahan dipotong saat terjual.
      -- Bahan biasa = resep per pcs x isi; bahan per_sale = sekali per penjualan.
      select coalesce(sum(r.qty * i.avg_cost * case when r.per_sale then 1 else v_pack end), 0) into v_cogs
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu;

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
      select r.ingredient_id,'sale_usage',
             -(r.qty * v_qty * case when r.per_sale then 1 else v_pack end), i.avg_cost, v_sale
        from recipe_items r join ingredients i on i.id = r.ingredient_id
       where r.menu_item_id = v_menu;
    end if;
  end loop;
  return v_sale;
end $$;

grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
notify pgrst, 'reload schema';
