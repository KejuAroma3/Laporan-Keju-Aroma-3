"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, monthStartJkt, rangeIso, rupiah, todayJkt } from "@/lib/format";
import type { BestSeller, Pnl, SaleRow, StockRow } from "@/lib/types";
import { Bar, Card, Empty, Notice, PageTitle, Stat, type Msg } from "@/components/ui";

export default function Dashboard() {
  const [today, setToday] = useState({ revenue: 0, profit: 0, portions: 0 });
  const [month, setMonth] = useState<Pnl | null>(null);
  const [top, setTop] = useState<BestSeller[]>([]);
  const [low, setLow] = useState<StockRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const t = todayJkt();
    const { start, end } = rangeIso(t, t);
    const [s, p, b, l] = await Promise.all([
      supabase
        .from("sales")
        .select("discount, platform_fee, sale_items(qty, unit_price, unit_cogs)")
        .gte("sold_at", start)
        .lte("sold_at", end),
      supabase.rpc("report_pnl", { p_from: monthStartJkt(), p_to: t }),
      supabase.rpc("report_best_sellers", { p_from: monthStartJkt(), p_to: t }),
      supabase.from("v_stock").select("*").eq("is_low", true).order("name"),
    ]);
    const err = [s, p, b, l].find((x) => x.error)?.error;
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
    setMonth(((p.data ?? []) as Pnl[])[0] ?? null);
    setTop(((b.data ?? []) as BestSeller[]).slice(0, 5));
    setLow((l.data ?? []) as StockRow[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const maxQty = Math.max(0, ...top.map((t) => t.qty_sold));

  return (
    <div>
      <PageTitle sub="Ringkasan hari ini dan bulan berjalan.">Beranda</PageTitle>
      <Notice msg={msg} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Pendapatan bersih hari ini" value={rupiah(today.revenue)} />
        <Stat label="Laba kotor hari ini" value={rupiah(today.profit)} hint={`${fmt(today.portions)} porsi terjual`} />
        <Stat label="Laba bersih bulan ini" value={rupiah(month?.net_profit ?? 0)} hint="Sudah dikurangi biaya operasional" />
        <Stat label="Biaya operasional bulan ini" value={rupiah(month?.opex ?? 0)} />
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
        <h2 className="mb-3 font-semibold">Menu terlaris bulan ini</h2>
        {top.length === 0 ? (
          <Empty>Belum ada penjualan bulan ini.</Empty>
        ) : (
          <ol className="space-y-3">
            {top.map((t) => (
              <li key={t.menu}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{t.menu}</span>
                  <span className="tabular-nums text-stone-500">{fmt(t.qty_sold)} porsi</span>
                </div>
                <Bar value={t.qty_sold} max={maxQty} />
              </li>
            ))}
          </ol>
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
                  sisa {fmt(r.on_hand)} {r.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
