-- ============================================================
-- 15) ISI PER PENJUALAN (pack_qty). Jalankan setelah 1-14. Aman diulang.
--
--     Untuk menu yang berbagi bahan dasar dan stok yang sama tetapi beda
--     isi, misalnya "Keju Aroma Original isi 5" dan "Hampers Keju Aroma
--     Original isi 15": isi 5 -> pack_qty 5, isi 15 -> pack_qty 15.
--     Satu penjualan mengurangi stok produk sebanyak (jumlah terjual x isi),
--     dan HPP penjualan = HPP per pcs stok x isi. Harga jual tetap harga
--     per penjualan (per kotak/hampers), bukan per pcs.
--     Bawaannya 1, jadi menu yang sudah ada tidak berubah.
--
--     Jangan jalankan ulang 9 atau 14 setelah ini, karena akan
--     mengembalikan record_sale versi lama.
-- ============================================================

alter table menu_items add column if not exists pack_qty numeric not null default 1
  check (pack_qty > 0);

create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric; v_menu uuid; v_holder uuid; v_qty int;
        v_tracked boolean; v_prodcost numeric; v_pack numeric;
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
      -- HPP per penjualan = HPP per pcs stok x isi
      v_cogs := coalesce(v_prodcost, 0) * v_pack;

      insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
      values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);

      insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id)
      values (v_holder, 'sale', -(v_qty * v_pack), coalesce(v_prodcost, 0), v_sale);
    else
      -- dibuat saat dipesan: resep menu ini sudah per satu penjualan
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

grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
notify pgrst, 'reload schema';
