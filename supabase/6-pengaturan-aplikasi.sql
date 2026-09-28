-- ============================================================
-- 6) PENGATURAN APLIKASI. Jalankan setelah 1-5 (butuh tabel
--    profiles dari 4-karyawan.sql). Aman dijalankan berulang.
--    Menyimpan nama usaha, logo, dan warna tema, dan membuatnya
--    bisa diubah lewat menu Pengaturan di aplikasi.
-- ============================================================

create table if not exists app_settings (
  id boolean primary key default true,
  business_name text not null default 'Keju Aroma Tiga',
  tagline text not null default 'Aplikasi Stok dan Penjualan',
  logo_url text,
  theme_color text not null default '#0f766e',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Semua orang boleh membaca, TERMASUK yang belum login, supaya halaman
-- login bisa menampilkan logo dan nama usaha sebelum masuk.
drop policy if exists "pengaturan baca publik" on app_settings;
create policy "pengaturan baca publik"
on app_settings for select
using (true);

-- Hanya pemilik yang boleh mengubah.
drop policy if exists "pengaturan ubah oleh pemilik" on app_settings;
create policy "pengaturan ubah oleh pemilik"
on app_settings for update
to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'));

grant select on app_settings to anon, authenticated;
grant update on app_settings to authenticated;
