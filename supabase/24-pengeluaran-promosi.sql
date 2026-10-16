-- ============================================================
-- 24) PENGELUARAN PROMOSI (voucher hadiah, sampel, dll). Jalankan setelah 1-23.
--     Aman diulang.
--
--     Stok produk jadi dan kemasan yang keluar TANPA penjualan (voucher
--     hadiah, sampel, konsumsi sendiri, donasi). Tidak masuk omzet,
--     penjualan, maupun Terlaris. Nilainya (HPP stok saat keluar) disimpan
--     di promo_outs.total_cost dan ditampilkan di Laporan sebagai
--     "Biaya promosi". Pergerakan stoknya ditandai promo_id, jadi
--     menghapus catatan promosi otomatis mengembalikan stoknya.
-- ============================================================

create table if not exists promo_outs (
  id uuid primary key default gen_random_uuid(),
  out_at timestamptz not null default now(),
  kind text not null,                 -- Voucher hadiah, Sampel, Konsumsi sendiri, Donasi, ...
  note text,                          -- keterangan / nama penerima
  total_cost numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_promo_outs_out_at on promo_outs (out_at);

create table if not exists promo_out_lines (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references promo_outs on delete cascade,
  kind text not null check (kind in ('produk', 'bahan')),
  ref_id uuid not null,               -- menu_items.id (produk) atau ingredients.id (bahan)
  qty numeric not null check (qty > 0)
);
create index if not exists idx_promo_out_lines_promo_id on promo_out_lines (promo_id);

alter type movement_type add value if not exists 'promo_usage';
alter table stock_movements add column if not exists promo_id uuid references promo_outs on delete cascade;
alter table product_movements add column if not exists promo_id uuid references promo_outs on delete cascade;
create index if not exists idx_stock_movements_promo_id on stock_movements (promo_id) where promo_id is not null;
create index if not exists idx_product_movements_promo_id on product_movements (promo_id) where promo_id is not null;

alter table product_movements drop constraint if exists product_movements_type_check;
alter table product_movements add constraint product_movements_type_check
  check (type in ('production', 'sale', 'waste', 'adjustment', 'promo'));

alter table promo_outs enable row level security;
alter table promo_out_lines enable row level security;
drop policy if exists "promosi akses login" on promo_outs;
create policy "promosi akses login" on promo_outs for all to authenticated using (true) with check (true);
drop policy if exists "baris promosi akses login" on promo_out_lines;
create policy "baris promosi akses login" on promo_out_lines for all to authenticated using (true) with check (true);
grant select, insert, update, delete on promo_outs to authenticated;
grant select, insert, update, delete on promo_out_lines to authenticated;

-- p_products: [{"menu_item_id": uuid, "qty": number}] (pcs stok produk)
-- p_supplies: [{"ingredient_id": uuid, "qty": number}] (satuan bahan)
create or replace function record_promo_out(
  p_kind text, p_note text, p_out_at timestamptz, p_products jsonb, p_supplies jsonb)
returns uuid language plpgsql as $$
declare v_id uuid; it jsonb; v_menu uuid; v_holder uuid; v_q numeric; v_tracked boolean;
        v_cost numeric; v_total numeric := 0; v_ing uuid; v_avg numeric; v_label text;
begin
  if p_kind is null or btrim(p_kind) = '' then raise exception 'Jenis pengeluaran wajib diisi'; end if;
  v_label := btrim(p_kind) || coalesce(': ' || nullif(btrim(p_note), ''), '');

  insert into promo_outs(out_at, kind, note) values (coalesce(p_out_at, now()), btrim(p_kind), nullif(btrim(p_note), ''))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    v_menu := (it->>'menu_item_id')::uuid;
    v_q := (it->>'qty')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    v_holder := stock_holder(v_menu);
    select track_stock, avg_product_cost into v_tracked, v_cost from menu_items where id = v_holder;
    if not coalesce(v_tracked, false) then
      raise exception 'Produk "%" belum punya stok produksi. Catat produksinya dulu.', (select name from menu_items where id = v_menu);
    end if;
    insert into product_movements(menu_item_id, type, qty, unit_cost, promo_id, note)
    values (v_holder, 'promo', -v_q, coalesce(v_cost, 0), v_id, v_label);
    v_total := v_total + v_q * coalesce(v_cost, 0);
    insert into promo_out_lines(promo_id, kind, ref_id, qty) values (v_id, 'produk', v_menu, v_q);
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p_supplies, '[]'::jsonb)) loop
    v_ing := (it->>'ingredient_id')::uuid;
    v_q := (it->>'qty')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    select avg_cost into v_avg from ingredients where id = v_ing;
    insert into stock_movements(ingredient_id, type, qty, unit_cost, promo_id, note)
    values (v_ing, 'promo_usage', -v_q, coalesce(v_avg, 0), v_id, v_label);
    v_total := v_total + v_q * coalesce(v_avg, 0);
    insert into promo_out_lines(promo_id, kind, ref_id, qty) values (v_id, 'bahan', v_ing, v_q);
  end loop;

  if not exists (select 1 from promo_out_lines where promo_id = v_id) then
    raise exception 'Isi minimal satu produk atau kemasan yang keluar';
  end if;
  update promo_outs set total_cost = v_total where id = v_id;
  return v_id;
end $$;

-- Ubah: stok lama dikembalikan (baris lama dihapus), lalu dicatat ulang dengan HPP sekarang.
create or replace function update_promo_out(
  p_id uuid, p_kind text, p_note text, p_out_at timestamptz, p_products jsonb, p_supplies jsonb)
returns uuid language plpgsql as $$
begin
  if not exists (select 1 from promo_outs where id = p_id) then
    raise exception 'Catatan tidak ditemukan (mungkin sudah dihapus)';
  end if;
  delete from promo_outs where id = p_id;  -- pergerakan stok dan baris ikut terhapus (cascade)
  return record_promo_out(p_kind, p_note, p_out_at, p_products, p_supplies);
end $$;

grant execute on function record_promo_out(text, text, timestamptz, jsonb, jsonb) to authenticated;
grant execute on function update_promo_out(uuid, text, text, timestamptz, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
