-- ============================================================
-- 29) HITUNG ULANG KOMISI PENJUALAN LAMA. Jalankan setelah 1-28 (butuh 25). Aman diulang.
--     recalc_platform_fees(dari, sampai, terapkan):
--       terapkan = false -> hanya pratinjau (tidak mengubah data)
--       terapkan = true  -> memperbarui komisi penjualan GoFood/GrabFood/ShopeeFood
--                           pada rentang tanggal (WIB) dengan aturan di platform_fee_rules.
--     Komisi = (penjualan kotor - diskon) x persen + biaya tetap per transaksi.
--     Penjualan offline dan Pesanan Khusus (komisi manual) tidak diubah.
-- ============================================================

create or replace function recalc_platform_fees(p_from date, p_to date, p_apply boolean default false)
returns table(channel text, trx bigint, changed bigint, old_fee numeric, new_fee numeric)
language plpgsql as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Rentang tanggal tidak valid';
  end if;
  if p_apply then
    return query
    with calc as (
      select s.id, s.channel::text as ch, s.platform_fee as old_fee,
             case when (g.gross - s.discount) <= 0 then 0
                  else round((g.gross - s.discount) * r.percent / 100 + r.flat) end as new_fee
        from sales s
        join platform_fee_rules r on r.channel = s.channel::text
        join lateral (select coalesce(sum(i.qty * i.unit_price), 0) as gross from sale_items i where i.sale_id = s.id) g on true
       where s.channel::text <> 'offline'
         and (s.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
         and not exists (select 1 from custom_orders c where c.sale_id = s.id)
    ), upd as (
      update sales set platform_fee = calc.new_fee
        from calc where sales.id = calc.id and sales.platform_fee <> calc.new_fee
      returning sales.id
    )
    select calc.ch, count(*)::bigint, (count(*) filter (where calc.old_fee <> calc.new_fee))::bigint,
           coalesce(sum(calc.old_fee), 0), coalesce(sum(calc.new_fee), 0)
      from calc group by calc.ch order by calc.ch;
  else
    return query
    with calc as (
      select s.id, s.channel::text as ch, s.platform_fee as old_fee,
             case when (g.gross - s.discount) <= 0 then 0
                  else round((g.gross - s.discount) * r.percent / 100 + r.flat) end as new_fee
        from sales s
        join platform_fee_rules r on r.channel = s.channel::text
        join lateral (select coalesce(sum(i.qty * i.unit_price), 0) as gross from sale_items i where i.sale_id = s.id) g on true
       where s.channel::text <> 'offline'
         and (s.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
         and not exists (select 1 from custom_orders c where c.sale_id = s.id)
    )
    select calc.ch, count(*)::bigint, (count(*) filter (where calc.old_fee <> calc.new_fee))::bigint,
           coalesce(sum(calc.old_fee), 0), coalesce(sum(calc.new_fee), 0)
      from calc group by calc.ch order by calc.ch;
  end if;
end $$;

grant execute on function recalc_platform_fees(date, date, boolean) to authenticated;
notify pgrst, 'reload schema';
