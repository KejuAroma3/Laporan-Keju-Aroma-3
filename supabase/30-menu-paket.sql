-- ============================================================
-- 30) MENU PAKET (BUNDLING). Jalankan setelah 1-29. Aman diulang.
--
--     Satu menu paket (mis. "Hampers Original isi 18 Gratis Pisang
--     Cokelat isi 15") berisi beberapa menu lain sebagai komponen.
--       * menu_bundle_items : daftar komponen tiap menu paket.
--       * record_sale       : bila menu yang dijual punya komponen, stok
--         tiap komponen dipotong (jumlah paket x qty komponen x isi
--         komponen), dan HPP paket = jumlah HPP semua komponen.
--         Menu tanpa komponen dihitung persis seperti sebelumnya.
--     Harga jual paket tetap satu angka (harga menu paket itu sendiri).
--
--     Jangan jalankan ulang 9, 14, 15, 17, atau 18 setelah ini, karena
--     akan mengembalikan record_sale versi lama.
-- ============================================================

create table if not exists menu_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references menu_items on delete cascade,
  component_id uuid not null references menu_items on delete cascade,
  qty numeric not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  unique (bundle_id, component_id),
  check (bundle_id <> component_id)
);

alter table menu_bundle_items enable row level security;
drop policy if exists "akses login" on menu_bundle_items;
create policy "akses login" on menu_bundle_items for all to authenticated using (true) with check (true);
grant select, insert, update, delete on menu_bundle_items to authenticated;

create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric; v_menu uuid; v_part uuid; v_holder uuid; v_qty int;
        v_tracked boolean; v_prodcost numeric; v_pack numeric; v_salecost numeric; v_pq numeric;
        v_partcost numeric; r record;
begin
  insert into sales(channel,discount,platform_fee,sold_at)
  values (p_channel,p_discount,p_fee,p_sold_at) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_qty := (it->>'qty')::int;
    v_cogs := 0;

    -- bagian yang dipotong stoknya: komponen paket, atau menu itu sendiri bila bukan paket
    for r in
      select coalesce(b.component_id, v_menu) as part_id, coalesce(b.qty, 1) as part_qty
        from (select 1) x
        left join menu_bundle_items b on b.bundle_id = v_menu
    loop
      v_part := r.part_id;
      v_pq := r.part_qty;
      v_holder := stock_holder(v_part);

      select coalesce(pack_qty, 1) into v_pack from menu_items where id = v_part;
      select track_stock, avg_product_cost into v_tracked, v_prodcost
        from menu_items where id = v_holder;

      if coalesce(v_tracked, false) then
        -- punya stok produk: bahan produksi sudah terpotong saat produksi
        select coalesce(sum(rc.qty * i.avg_cost), 0) into v_salecost
          from recipe_items rc join ingredients i on i.id = rc.ingredient_id
         where rc.menu_item_id = v_part and rc.per_sale;

        v_partcost := coalesce(v_prodcost, 0) * v_pack + v_salecost;

        insert into product_movements(menu_item_id, type, qty, unit_cost, sale_id)
        values (v_holder, 'sale', -(v_qty * v_pq * v_pack), coalesce(v_prodcost, 0), v_sale);

        insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
        select rc.ingredient_id,'sale_usage',-(rc.qty * v_qty * v_pq), i.avg_cost, v_sale
          from recipe_items rc join ingredients i on i.id = rc.ingredient_id
         where rc.menu_item_id = v_part and rc.per_sale;
      else
        -- dibuat saat dipesan: semua bahan dipotong saat terjual.
        select coalesce(sum(rc.qty * i.avg_cost * case when rc.per_sale then 1 else v_pack end), 0) into v_partcost
          from recipe_items rc join ingredients i on i.id = rc.ingredient_id
         where rc.menu_item_id = v_part;

        insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
        select rc.ingredient_id,'sale_usage',
               -(rc.qty * v_qty * v_pq * case when rc.per_sale then 1 else v_pack end), i.avg_cost, v_sale
          from recipe_items rc join ingredients i on i.id = rc.ingredient_id
         where rc.menu_item_id = v_part;
      end if;

      v_cogs := v_cogs + v_partcost * v_pq;
    end loop;

    insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
    values (v_sale, v_menu, v_qty, (it->>'unit_price')::numeric, v_cogs);
  end loop;
  return v_sale;
end $$;

grant execute on function record_sale(sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;
notify pgrst, 'reload schema';
