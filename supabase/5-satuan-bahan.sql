-- ============================================================
-- 5) SATUAN BAHAN BAKU. Jalankan setelah 1-4. Aman dijalankan berulang.
--    Membuat daftar satuan (gram, ml, pcs, dst) yang bisa ditambah,
--    diganti nama, atau dihapus lewat halaman Bahan baku.
-- ============================================================

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into units (name) values
  ('gram'), ('ml'), ('pcs'), ('lembar'), ('sachet'), ('botol'), ('porsi')
on conflict (name) do nothing;

alter table units enable row level security;

drop policy if exists "satuan akses login" on units;
create policy "satuan akses login"
on units for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on units to authenticated;
