-- ============================================================
-- 26) KEMASAN PER TRANSAKSI (plastik, dll). Jalankan setelah 1-25. Aman diulang.
--
--     Kemasan yang dipakai SEKALI per transaksi (bukan per porsi), misalnya
--     satu plastik untuk semua porsi dalam satu pesanan.
--       * transaction_packaging_rules : aturan otomatis (bahan, jumlah, platform).
--       * apply_sale_packaging(p_sale, p_items) : dipanggil aplikasi sesudah
--         penjualan tersimpan. Mengurangi stok kemasan (ditandai sale_id, jadi
--         ikut kembali bila penjualan dihapus/diubah) dan menambahkan biayanya
--         ke HPP penjualan itu (dibagi rata per porsi).
--     Pesanan Khusus tidak memakai aturan ini.
-- ============================================================

create table if not exists transaction_packaging_rules (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients on delete cascade,
  qty numeric not null default 1 check (qty > 0),
  channels text[] not null default array['offline','gofood','grabfood','shopeefood'],
  created_at timestamptz not null default now()
);

alter table transaction_packaging_rules enable row level security;
drop policy if exists "akses login" on transaction_packaging_rules;
create policy "akses login" on transaction_packaging_rules for all to authenticated using (true) with check (true);
grant select, insert, update, delete on transaction_packaging_rules to authenticated;

-- p_items: [{"ingredient_id": "...", "qty": 1}, ...]. Boleh dipanggil ulang untuk penjualan yang sama
-- (kemasan lama dibatalkan dulu, HPP dikoreksi, lalu diterapkan ulang).
create or replace function apply_sale_packaging(p_sale uuid, p_items jsonb)
returns numeric language plpgsql as $$
declare
  v_total_qty numeric;
  v_prev numeric;
  v_new numeric := 0;
  it jsonb;
  v_ing uuid;
  v_qty numeric;
  v_cost numeric;
begin
  if not exists (select 1 from sales where id = p_sale) then
    raise exception 'Penjualan tidak ditemukan';
  end if;
  select coalesce(sum(qty), 0) into v_total_qty from sale_items where sale_id = p_sale;

  -- batalkan kemasan transaksi sebelumnya (jika ada)
  select coalesce(sum(-qty * coalesce(unit_cost, 0)), 0) into v_prev
    from stock_movements where sale_id = p_sale and note = 'Kemasan transaksi';
  if v_prev <> 0 and v_total_qty > 0 then
    update sale_items set unit_cogs = greatest(0, unit_cogs - v_prev / v_total_qty) where sale_id = p_sale;
  end if;
  delete from stock_movements where sale_id = p_sale and note = 'Kemasan transaksi';

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_ing := (it->>'ingredient_id')::uuid;
    v_qty := (it->>'qty')::numeric;
    if v_ing is null or v_qty is null or v_qty <= 0 then continue; end if;
    select avg_cost into v_cost from ingredients where id = v_ing;
    if not found then raise exception 'Bahan kemasan tidak ditemukan'; end if;
    insert into stock_movements(ingredient_id, type, qty, unit_cost, sale_id, note)
    values (v_ing, 'sale_usage', -v_qty, v_cost, p_sale, 'Kemasan transaksi');
    v_new := v_new + v_qty * coalesce(v_cost, 0);
  end loop;

  if v_new <> 0 and v_total_qty > 0 then
    update sale_items set unit_cogs = unit_cogs + v_new / v_total_qty where sale_id = p_sale;
  end if;
  return v_new;
end $$;

grant execute on function apply_sale_packaging(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
