-- ============================================================
-- 20) PRODUKSI TANPA RESEP. Jalankan setelah 1-19. Aman diulang.
--
--     Untuk produk yang dibeli jadi atau belum punya resep produksi
--     (mis. dimsum): produksi/penambahan stok sekarang boleh dicatat
--     dengan mengisi HPP per pcs secara manual. Tidak ada bahan yang
--     terpotong (tidak ada resep). Kalau menu punya resep produksi,
--     perilakunya sama seperti sebelumnya dan HPP manual diabaikan.
--
--     Jangan jalankan ulang 9, 14, 15, atau 17 setelah ini.
-- ============================================================

drop function if exists record_production(uuid, numeric, text);

create or replace function record_production(
  p_menu uuid, p_qty numeric, p_note text default null, p_unit_cost numeric default null)
returns void language plpgsql as $$
declare v_cost_per_unit numeric; v_old_stock numeric; v_has_recipe boolean;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah produksi harus lebih dari 0';
  end if;
  select exists (select 1 from recipe_items where menu_item_id = p_menu and not per_sale) into v_has_recipe;

  if v_has_recipe then
    select coalesce(sum(r.qty * i.avg_cost), 0) into v_cost_per_unit
      from recipe_items r join ingredients i on i.id = r.ingredient_id
     where r.menu_item_id = p_menu and not r.per_sale;

    insert into stock_movements(ingredient_id, type, qty, unit_cost, note)
    select r.ingredient_id, 'production_usage', -(r.qty * p_qty), i.avg_cost,
           coalesce(p_note, 'Produksi ' || p_qty || ' porsi')
      from recipe_items r join ingredients i on i.id = r.ingredient_id
     where r.menu_item_id = p_menu and not r.per_sale;
  else
    if p_unit_cost is null or p_unit_cost < 0 then
      raise exception 'Menu ini belum punya resep produksi. Isi resep di Resep, atau isi HPP per pcs secara manual.';
    end if;
    v_cost_per_unit := p_unit_cost;
  end if;

  select coalesce(sum(qty), 0) into v_old_stock from product_movements where menu_item_id = p_menu;

  update menu_items set
    avg_product_cost = (greatest(v_old_stock, 0) * avg_product_cost + v_cost_per_unit * p_qty)
                        / (greatest(v_old_stock, 0) + p_qty),
    track_stock = true
  where id = p_menu;

  insert into product_movements(menu_item_id, type, qty, unit_cost, note)
  values (p_menu, 'production', p_qty, v_cost_per_unit,
          case when v_has_recipe then p_note else coalesce(p_note || ' (tanpa resep)', 'Tanpa resep') end);
end $$;

notify pgrst, 'reload schema';
