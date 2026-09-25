-- ============================================================
-- 2) TAMBAHAN. Jalankan setelah skema. Aman dijalankan berulang kali.
--    Berisi: fungsi laporan per channel + izin akses untuk user login.
-- ============================================================

create or replace function report_channels(p_from date, p_to date)
returns table(channel sales_channel, qty bigint, gross numeric,
              discounts numeric, fees numeric, cogs numeric)
language sql as $$
  select sa.channel,
         coalesce(sum(x.qty),0)::bigint,
         coalesce(sum(x.gross),0),
         coalesce(sum(sa.discount),0),
         coalesce(sum(sa.platform_fee),0),
         coalesce(sum(x.cogs),0)
  from sales sa
  left join lateral (
    select sum(si.qty) as qty,
           sum(si.qty*si.unit_price) as gross,
           sum(si.qty*si.unit_cogs) as cogs
    from sale_items si where si.sale_id = sa.id) x on true
  where (sa.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by sa.channel;
$$;

-- Izin akses (dibutuhkan agar aplikasi bisa membaca tabel, view, dan fungsi)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
