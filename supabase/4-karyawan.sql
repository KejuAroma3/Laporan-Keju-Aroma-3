-- ============================================================
-- 4) KARYAWAN. Jalankan setelah 1, 2, dan 3.
--    Menyimpan nama dan peran (pemilik/staf) untuk tiap akun login.
--    Menambah, mengubah, atau menghapus akun tetap lewat aplikasi
--    (menu Karyawan), bukan lewat tabel ini secara langsung, karena
--    akun login sesungguhnya disimpan oleh Supabase Auth, bukan di sini.
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profil terbaca oleh yang login" on profiles;
create policy "profil terbaca oleh yang login"
on profiles for select
to authenticated
using (true);

-- Tidak ada policy insert/update/delete untuk role authenticated:
-- perubahan hanya boleh lewat rute /api/staff (server), yang memakai
-- service role dan memverifikasi bahwa pemanggilnya adalah pemilik.

-- Jadikan akun yang sudah ada sebagai pemilik (owner), supaya Anda
-- yang membuat aplikasi ini punya akses membuat akun karyawan lain.
-- Aman dijalankan berulang: akun yang sudah punya profil dilewati.
insert into profiles (id, role, full_name)
select u.id, 'owner', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

grant select on profiles to authenticated;
