-- ============================================================
-- 27) UKURAN BOX OTOMATIS. Jalankan setelah 1-26. Aman diulang.
--
--     Box dipilih otomatis dari jumlah pcs satu transaksi (mis. Box S maks 10 pcs,
--     Box M maks 20 pcs). Hasilnya tampil di kartu "Kemasan transaksi ini" saat
--     Cek pesanan dan dicatat lewat apply_sale_packaging (SQL 26).
--       * box_sizes    : bahan box + kapasitas pcs.
--       * box_settings : kata kunci kategori menu yang TIDAK memakai box (mis. frozen).
-- ============================================================

create table if not exists box_sizes (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients on delete cascade,
  capacity numeric not null check (capacity > 0),   -- maksimal pcs per box
  created_at timestamptz not null default now(),
  unique (ingredient_id)
);

create table if not exists box_settings (
  id boolean primary key default true check (id),
  exclude_keywords text not null default 'frozen',  -- dipisah koma; cocok dengan nama kategori menu
  updated_at timestamptz not null default now()
);
insert into box_settings (id) values (true) on conflict (id) do nothing;

alter table box_sizes enable row level security;
alter table box_settings enable row level security;
drop policy if exists "akses login" on box_sizes;
create policy "akses login" on box_sizes for all to authenticated using (true) with check (true);
drop policy if exists "akses login" on box_settings;
create policy "akses login" on box_settings for all to authenticated using (true) with check (true);
grant select, insert, update, delete on box_sizes, box_settings to authenticated;
notify pgrst, 'reload schema';
