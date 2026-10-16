-- ============================================================
-- 25) ATURAN KOMISI PLATFORM. Jalankan setelah 1-24. Aman dijalankan berulang.
--     Komisi dihitung otomatis dari pendapatan bersih (subtotal - diskon):
--       komisi = pendapatan bersih x persen + biaya tetap per transaksi.
--     Bawaan: GrabFood 20%, GoFood 20% + Rp1.000, ShopeeFood 25%.
--     Tanpa SQL ini aplikasi tetap memakai angka bawaan yang sama.
-- ============================================================

create table if not exists platform_fee_rules (
  channel text primary key check (channel in ('gofood','grabfood','shopeefood')),
  percent numeric not null default 0 check (percent >= 0 and percent <= 100),
  flat numeric not null default 0 check (flat >= 0),
  updated_at timestamptz not null default now()
);

insert into platform_fee_rules (channel, percent, flat) values
  ('grabfood', 20, 0),
  ('gofood', 20, 1000),
  ('shopeefood', 25, 0)
on conflict (channel) do nothing;

alter table platform_fee_rules enable row level security;
drop policy if exists "akses login" on platform_fee_rules;
create policy "akses login" on platform_fee_rules for all to authenticated using (true) with check (true);
grant select, insert, update, delete on platform_fee_rules to authenticated;
