"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  addDaysIso,
  addMonthsIso,
  endOfWeekIso,
  labelDay,
  labelMonth,
  labelWeek,
  monthEndIso,
  monthStartIso,
  monthStartJkt,
  rangeIso,
  rupiah,
  startOfWeekIso,
  todayJkt,
} from "@/lib/format";
import type { BestSeller, Period, SaleRow, StockRow } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, Stat, Tabs, type Msg } from "@/components/ui";
import BestSellerList from "@/components/BestSellerList";

const PERIOD_TABS: { id: Period; label: string }[] = [
  { id: "harian", label: "Harian" },
  { id: "mingguan", label: "Mingguan" },
  { id: "bulanan", label: "Bulanan" },
];

function rangeFor(period: Period, anchor: string) {
  if (period === "harian") return { from: anchor, to: anchor };
  if (period === "mingguan") return { from: startOfWeekIso(anchor), to: endOfWeekIso(anchor) };
  return { from: monthStartIso(anchor), to: monthEndIso(anchor) };
}

function isCurrentOrLater(period: Period, anchor: string) {
  const today = todayJkt();
  if (period === "harian") return anchor >= today;
  if (period === "mingguan") return startOfWeekIso(anchor) >= startOfWeekIso(today);
  return monthStartIso(anchor) >= monthStartIso(today);
}

export default function Dashboard() {
  const [today, setToday] = useState({ revenue: 0, profit: 0, portions: 0 });
  const [monthNet, setMonthNet] = useState(0);
  const [monthOpex, setMonthOpex] = useState(0);
  const [low, setLow] = useState<StockRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  const [period, setPeriod] = useState<Period>("harian");
  const [anchor, setAnchor] = useState(todayJkt());
  const [best, setBest] = useState<BestSeller[]>([]);
  const [bestLoading, setBestLoading] = useState(true);

  const range = useMemo(() => rangeFor(period, anchor), [period, anchor]);
  const periodLabel =
    period === "harian" ? labelDay(anchor) : period === "mingguan" ? labelWeek(range.from, range.to) : labelMonth(anchor);
  const nextDisabled = isCurrentOrLater(period, anchor);

  function nav(dir: 1 | -1) {
    setAnchor((a) => {
      if (period === "harian") return addDaysIso(a, dir);
      if (period === "mingguan") return addDaysIso(a, dir * 7);
      return addMonthsIso(a, dir);
    });
  }

  async function loadSummary() {
    const t = todayJkt();
    const { start, end } = rangeIso(t, t);
    const [s, p, l] = await Promise.all([
      supabase
        .from("sales")
        .select("discount, platform_fee, sale_items(qty, unit_price, unit_cogs)")
        .gte("sold_at", start)
        .lte("sold_at", end),
      supabase.rpc("report_pnl", { p_from: monthStartJkt(), p_to: t }),
      supabase.from("v_stock").select("*").eq("is_low", true).order("name"),
    ]);
    const err = [s, p, l].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });

    const rows = (s.data ?? []) as SaleRow[];
    let gross = 0, cogs = 0, disc = 0, fees = 0, portions = 0;
    for (const r of rows) {
      disc += r.discount;
      fees += r.platform_fee;
      for (const i of r.sale_items) {
        gross += i.qty * i.unit_price;
        cogs += i.qty * i.unit_cogs;
        portions += i.qty;
      }
    }
    const revenue = gross - disc - fees;
    setToday({ revenue, profit: revenue - cogs, portions });
    const pnl = (p.data ?? [])[0];
    setMonthNet(pnl?.net_profit ?? 0);
    setMonthOpex(pnl?.opex ?? 0);
    setLow((l.data ?? []) as StockRow[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary(); }, []);

  async function loadBest() {
    setBestLoading(true);
    const { data, error } = await supabase.rpc("report_best_sellers", { p_from: range.from, p_to: range.to });
    if (error) setMsg({ type: "err", text: error.message });
    else setBest((data ?? []) as BestSeller[]);
    setBestLoading(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBest(); }, [range.from, range.to]);

  return (
    <div>
      <PageTitle sub="Ringkasan hari ini dan produk paling banyak terjual.">Beranda</PageTitle>
      <Notice msg={msg} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Pendapatan bersih hari ini" value={rupiah(today.revenue)} />
        <Stat label="Laba kotor hari ini" value={rupiah(today.profit)} hint={`${today.portions} porsi terjual`} />
        <Stat label="Laba bersih bulan ini" value={rupiah(monthNet)} hint="Sudah dikurangi biaya operasional" />
        <Stat label="Biaya operasional bulan ini" value={rupiah(monthOpex)} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Link href="/sales/new" className="flex h-14 items-center justify-center rounded-xl bg-teal-700 font-semibold text-white active:bg-teal-800">
          Catat penjualan
        </Link>
        <Link href="/stock" className="flex h-14 items-center justify-center rounded-xl border border-stone-300 bg-white font-semibold active:bg-stone-100">
          Catat belanja bahan
        </Link>
      </div>

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Produk paling banyak terjual</h2>
        <Tabs
          value={period}
          onChange={(p) => { setPeriod(p); setAnchor(todayJkt()); }}
          tabs={PERIOD_TABS}
        />

        <div className="mb-3 flex items-center gap-2">
          <button
            aria-label="Periode sebelumnya"
            onClick={() => nav(-1)}
            className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white text-lg font-semibold text-stone-600 active:bg-stone-100"
          >
            ‹
          </button>
          {period === "bulanan" ? (
            <input
              type="month"
              className="h-10 flex-1 rounded-lg border border-stone-300 bg-white px-2 text-center text-sm"
              value={anchor.slice(0, 7)}
              max={todayJkt().slice(0, 7)}
              onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)}
            />
          ) : (
            <input
              type="date"
              className="h-10 flex-1 rounded-lg border border-stone-300 bg-white px-2 text-center text-sm"
              value={anchor}
              max={todayJkt()}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
            />
          )}
          <button
            aria-label="Periode berikutnya"
            onClick={() => nav(1)}
            disabled={nextDisabled}
            className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white text-lg font-semibold text-stone-600 disabled:opacity-30 active:bg-stone-100"
          >
            ›
          </button>
        </div>
        <p className="mb-3 text-center text-sm font-medium text-stone-600">{periodLabel}</p>

        {bestLoading ? (
          <p className="py-8 text-center text-sm text-stone-500">Memuat…</p>
        ) : (
          <BestSellerList items={best} limit={10} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Stok menipis</h2>
        {low.length === 0 ? (
          <Empty>Semua bahan masih di atas batas minimum.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {low.map((r) => (
              <li key={r.id} className="flex justify-between py-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tabular-nums text-red-700">
                  sisa {r.on_hand} {r.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
