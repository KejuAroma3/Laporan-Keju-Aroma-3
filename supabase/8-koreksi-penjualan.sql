-- ============================================================
-- 8) KOREKSI PENJUALAN. Jalankan setelah 1-7. Aman dijalankan berulang.
--    Menambah dua fungsi untuk memperbaiki penjualan yang salah input:
--      delete_sale : hapus satu penjualan, stok bahan yang terpotong
--                    dikembalikan.
--      update_sale : ubah satu penjualan (menu, jumlah, harga, diskon,
--                    komisi, platform, tanggal). Stok lama dikembalikan
--                    dan stok baru dipotong sesuai data yang benar.
--    Keduanya berjalan sebagai satu transaksi: kalau ada yang gagal,
--    tidak ada perubahan setengah jalan.
-- ============================================================

create or replace function delete_sale(p_sale uuid)
returns void language plpgsql as $$
begin
  if not exists (select 1 from sales where id = p_sale) then
    raise exception 'Penjualan tidak ditemukan (mungkin sudah dihapus)';
  end if;
  -- pemakaian bahan dihapus dulu (mengembalikan stok), lalu penjualannya
  -- (sale_items ikut terhapus otomatis)
  delete from stock_movements where sale_id = p_sale;
  delete from sales where id = p_sale;
end $$;

create or replace function update_sale(
  p_sale uuid,
  p_channel sales_channel,
  p_discount numeric,
  p_fee numeric,
  p_sold_at timestamptz,
  p_items jsonb)
returns uuid language plpgsql as $$
declare
  v_old jsonb;
  v_new uuid;
begin
  if not exists (select 1 from sales where id = p_sale) then
    raise exception 'Penjualan tidak ditemukan (mungkin sudah dihapus)';
  end if;

  -- simpan HPP per porsi yang tercatat saat penjualan asli, supaya menu yang
  -- tidak berubah tetap memakai HPP lama (laporan lama tidak bergeser)
  select jsonb_object_agg(menu_item_id::text, unit_cogs) into v_old
    from sale_items where sale_id = p_sale;

  delete from stock_movements where sale_id = p_sale;
  delete from sales where id = p_sale;

  v_new := record_sale(p_channel, p_discount, p_fee, p_sold_at, p_items);

  update sale_items si
     set unit_cogs = coalesce((v_old ->> si.menu_item_id::text)::numeric, si.unit_cogs)
   where si.sale_id = v_new;

  return v_new;
end $$;

grant execute on function delete_sale(uuid) to authenticated;
grant execute on function update_sale(uuid, sales_channel, numeric, numeric, timestamptz, jsonb) to authenticated;

-- Muat ulang daftar fungsi di API agar langsung dikenali.
notify pgrst, 'reload schema';
