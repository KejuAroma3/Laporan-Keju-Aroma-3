-- ============================================================
-- 1) SKEMA LENGKAP. Jalankan SEKALI di database yang masih kosong.
--    Jika Anda sudah pernah menjalankan skema ini, LEWATI file ini
--    dan langsung ke 2-tambahan.sql.
-- ============================================================

create type movement_type as enum ('purchase','sale_usage','waste','adjustment');
create type sales_channel as enum ('offline','gofood','grabfood','shopeefood');

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null,
  min_stock numeric not null default 0,
  avg_cost numeric not null default 0,
  is_active boolean not null default true
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  price numeric not null,
  is_active boolean not null default true
);

create table recipe_items (
  menu_item_id uuid references menu_items on delete cascade,
  ingredient_id uuid references ingredients,
  qty numeric not null check (qty > 0),
  primary key (menu_item_id, ingredient_id)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  channel sales_channel not null default 'offline',
  discount numeric not null default 0,
  platform_fee numeric not null default 0,
  note text
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales on delete cascade,
  menu_item_id uuid not null references menu_items,
  qty int not null check (qty > 0),
  unit_price numeric not null,
  unit_cogs numeric not null default 0
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients,
  type movement_type not null,
  qty numeric not null,
  unit_cost numeric,
  sale_id uuid references sales,
  note text,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null,
  amount numeric not null check (amount > 0),
  note text
);

-- ---------- Fungsi pencatatan ----------
create or replace function record_purchase(
  p_ingredient uuid, p_qty numeric, p_total numeric, p_note text default null)
returns void language plpgsql as $$
declare v_stock numeric;
begin
  select coalesce(sum(qty),0) into v_stock
    from stock_movements where ingredient_id = p_ingredient;

  update ingredients set avg_cost =
    (greatest(v_stock,0) * avg_cost + p_total) / (greatest(v_stock,0) + p_qty)
  where id = p_ingredient;

  insert into stock_movements(ingredient_id,type,qty,unit_cost,note)
  values (p_ingredient,'purchase',p_qty,p_total/p_qty,p_note);
end $$;

create or replace function record_sale(
  p_channel sales_channel, p_discount numeric, p_fee numeric,
  p_sold_at timestamptz, p_items jsonb)
returns uuid language plpgsql as $$
declare v_sale uuid; it jsonb; v_cogs numeric;
begin
  insert into sales(channel,discount,platform_fee,sold_at)
  values (p_channel,p_discount,p_fee,p_sold_at) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    select coalesce(sum(r.qty * i.avg_cost),0) into v_cogs
      from recipe_items r join ingredients i on i.id = r.ingredient_id
     where r.menu_item_id = (it->>'menu_item_id')::uuid;

    insert into sale_items(sale_id,menu_item_id,qty,unit_price,unit_cogs)
    values (v_sale,(it->>'menu_item_id')::uuid,(it->>'qty')::int,
            (it->>'unit_price')::numeric, v_cogs);

    insert into stock_movements(ingredient_id,type,qty,unit_cost,sale_id)
    select r.ingredient_id,'sale_usage',-(r.qty * (it->>'qty')::int), i.avg_cost, v_sale
      from recipe_items r join ingredients i on i.id = r.ingredient_id
     where r.menu_item_id = (it->>'menu_item_id')::uuid;
  end loop;
  return v_sale;
end $$;

-- ---------- Laporan ----------
create view v_stock with (security_invoker = true) as
select i.id, i.name, i.unit, i.min_stock, i.avg_cost,
       coalesce(sum(m.qty),0) as on_hand,
       coalesce(sum(m.qty),0) <= i.min_stock as is_low
from ingredients i left join stock_movements m on m.ingredient_id = i.id
group by i.id;

create or replace function report_best_sellers(p_from date, p_to date)
returns table(menu text, category text, qty_sold bigint, revenue numeric, gross_profit numeric)
language sql as $$
  select mi.name, mi.category, sum(si.qty),
         sum(si.qty*si.unit_price), sum(si.qty*(si.unit_price-si.unit_cogs))
  from sale_items si
  join sales sa on sa.id = si.sale_id
  join menu_items mi on mi.id = si.menu_item_id
  where (sa.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by mi.id order by 3 desc;
$$;

create or replace function report_pnl(p_from date, p_to date)
returns table(gross_sales numeric, discounts numeric, platform_fees numeric,
              net_revenue numeric, cogs numeric, gross_profit numeric,
              opex numeric, net_profit numeric)
language sql as $$
  with s as (
    select coalesce(sum(si.qty*si.unit_price),0) gross,
           coalesce(sum(si.qty*si.unit_cogs),0) cogs
    from sale_items si join sales sa on sa.id = si.sale_id
    where (sa.sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
  d as (
    select coalesce(sum(discount),0) disc, coalesce(sum(platform_fee),0) fee
    from sales
    where (sold_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
  e as (
    select coalesce(sum(amount),0) opex from expenses
    where spent_on between p_from and p_to)
  select s.gross, d.disc, d.fee,
         s.gross - d.disc - d.fee,
         s.cogs,
         s.gross - d.disc - d.fee - s.cogs,
         e.opex,
         s.gross - d.disc - d.fee - s.cogs - e.opex
  from s, d, e;
$$;

-- ---------- Keamanan: hanya user yang sudah login ----------
do $$ declare t text; begin
  foreach t in array array['ingredients','menu_items','recipe_items',
    'sales','sale_items','stock_movements','expenses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
