-- ============================================================
-- 7) TANGGAL BELANJA. Jalankan setelah 1-6. Aman dijalankan berulang.
--    Membuat form Stok > Masuk bisa mencatat pembelian dengan tanggal
--    yang sudah lewat (mis. nota kemarin yang baru diinput hari ini),
--    supaya Laporan > Belanja menampilkan tanggal yang benar.
--
--    Fungsi lama record_purchase (4 parameter) diganti, bukan ditambah:
--    dua versi dengan nama sama membuat database tidak bisa memilih
--    mana yang dipanggil. Jangan jalankan ulang 1-skema.sql setelah ini,
--    karena akan mengembalikan versi lama.
-- ============================================================

drop function if exists record_purchase(uuid, numeric, numeric, text);

create or replace function record_purchase(
  p_ingredient uuid,
  p_qty numeric,
  p_total numeric,
  p_note text default null,
  p_date timestamptz default now())
returns void language plpgsql as $$
declare v_stock numeric;
begin
  if p_qty is null or p_qty <= 0 or p_total is null or p_total <= 0 then
    raise exception 'Jumlah dan total harga harus lebih dari 0';
  end if;
  if p_date > now() + interval '1 day' then
    raise exception 'Tanggal belanja tidak boleh di masa depan';
  end if;

  select coalesce(sum(qty),0) into v_stock
    from stock_movements where ingredient_id = p_ingredient;

  update ingredients set avg_cost =
    (greatest(v_stock,0) * avg_cost + p_total) / (greatest(v_stock,0) + p_qty)
  where id = p_ingredient;

  insert into stock_movements(ingredient_id, type, qty, unit_cost, note, created_at)
  values (p_ingredient, 'purchase', p_qty, p_total / p_qty, p_note, coalesce(p_date, now()));
end $$;

grant execute on function record_purchase(uuid, numeric, numeric, text, timestamptz) to authenticated;

-- Muat ulang daftar fungsi di API agar versi baru langsung dikenali.
notify pgrst, 'reload schema';
