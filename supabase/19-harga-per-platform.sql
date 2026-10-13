-- ============================================================
-- 19) HARGA MENU PER PLATFORM. Jalankan setelah 1-18. Aman diulang.
--
--     Harga di menu_items.price tetap menjadi harga Offline (dan harga
--     bawaan). Tabel ini menyimpan harga khusus untuk GoFood, GrabFood,
--     ShopeeFood. Kalau tidak ada barisnya, platform itu memakai harga
--     dasar. Penjualan lama tidak berubah (harga tersimpan di sale_items).
-- ============================================================

create table if not exists menu_prices (
  menu_item_id uuid not null references menu_items on delete cascade,
  channel sales_channel not null,
  price numeric not null check (price >= 0),
  primary key (menu_item_id, channel)
);

alter table menu_prices enable row level security;
drop policy if exists "harga platform akses login" on menu_prices;
create policy "harga platform akses login" on menu_prices for all to authenticated using (true) with check (true);
grant select, insert, update, delete on menu_prices to authenticated;

notify pgrst, 'reload schema';
