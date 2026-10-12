-- ============================================================
-- 16) RINCIAN DISKON PENJUALAN. Jalankan setelah 1-15. Aman diulang.
--
--     Satu penjualan bisa punya beberapa diskon bernama (mis. "Diskon total
--     belanja", "Diskon ongkir" di GoFood). sales.discount tetap berisi TOTAL
--     semua diskon, jadi laporan laba rugi, kas, dan lainnya tidak berubah.
--     Tabel sale_discounts hanya menyimpan rinciannya.
--     discount_types = daftar nama diskon yang bisa ditambah/dihapus di
--     form Rekap penjualan.
-- ============================================================

create table if not exists sale_discounts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales on delete cascade,
  label text not null,
  amount numeric not null check (amount > 0)
);
create index if not exists idx_sale_discounts_sale_id on sale_discounts (sale_id);

create table if not exists discount_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into discount_types (name) values
  ('Diskon total belanja'), ('Diskon ongkir'), ('Voucher merchant')
on conflict (name) do nothing;

alter table sale_discounts enable row level security;
alter table discount_types enable row level security;
drop policy if exists "rincian diskon akses login" on sale_discounts;
create policy "rincian diskon akses login" on sale_discounts for all to authenticated using (true) with check (true);
drop policy if exists "jenis diskon akses login" on discount_types;
create policy "jenis diskon akses login" on discount_types for all to authenticated using (true) with check (true);

grant select, insert, update, delete on sale_discounts to authenticated;
grant select, insert, update, delete on discount_types to authenticated;

notify pgrst, 'reload schema';
