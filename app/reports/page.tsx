"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, daysAgoJkt, fmt, monthStartJkt, pct, rangeIso, rupiah, todayJkt } from "@/lib/format";
import type { BestSeller, Channel, Pnl } from "@/lib/types";
import { Bar, Card, Empty, Notice, PageTitle, Tabs, btnGhostCls, inputCls, type Msg } from "@/components/ui";

type Tab = "terlaris" | "labarugi" | "biaya" | "channel";
type SortKey = "qty_sold" | "revenue" | "gross_profit";
type ChannelRow = { channel: Channel; qty: number; gross: number; discounts: number; fees: number; cogs: number };
type Move = { type: string; qty: number; unit_cost: number | null };
type Expense = { category: string; amount: number };

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStartJkt());
  const [to, setTo] = useState(todayJkt());
  const [tab, setTab] = useState<Tab>("terlaris");
  const [sort, setSort] = useState<SortKey>("qty_sold");
  const [best, setBest] = useState<BestSeller[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [chan, setChan] = useState<ChannelRow[]>([]);
  const [exp, setExp] = useState<Expense[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const { start, end } = rangeIso(from, to);
    const [b, p, c, e, m] = await Promise.all([
      supabase.rpc("report_best_sellers", { p_from: from, p_to: to }),
      supabase.rpc("report_pnl", { p_from: from, p_to: to }),
      supabase.rpc("report_channels", { p_from: from, p_to: to }),
      supabase.from("expenses").select("category, amount").gte("spent_on", from).lte("spent_on", to),
      supabase
        .from("stock_movements")
        .select("type, qty, unit_cost")
        .in("type", ["purchase", "waste", "adjustment"])
        .gte("created_at", start)
        .lte("created_at", end),
    ]);
    const err = [b, p, c, e, m].find((x) => x.error)?.error;
    setMsg(err ? { type: "err", text: err.message } : null);
    setBest((b.data ?? []) as BestSeller[]);
    setPnl(((p.data ?? []) as Pnl[])[0] ?? null);
    setChan((c.data ?? []) as ChannelRow[]);
    setExp((e.data ?? []) as Expense[]);
    setMoves((m.data ?? []) as Move[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [from, to]);

  const setRange = (f: string, t: string) => { setFrom(f); setTo(t); };

  // Turunan dari data stok
  const purchases = moves
    .filter((x) => x.type === "purchase")
    .reduce((s, x) => s + x.qty * (x.unit_cost ?? 0), 0);
  const wasteLoss = -moves
    .filter((x) => x.type !== "purchase")
    .reduce((s, x) => s + x.qty * (x.unit_cost ?? 0), 0);
  const expByCat = Object.entries(
    exp.reduce<Record<string, number>>((mp, r) => ({ ...mp, [r.category]: (mp[r.category] ?? 0) + r.amount }), {})
  ).sort((a, b) => b[1] - a[1]);
  const opex = exp.reduce((s, r) => s + r.amount, 0);

  const sortedBest = [...best].sort((a, b) => b[sort] - a[sort]);
  const maxSort = Math.max(0, ...sortedBest.map((x) => x[sort]));
  const chanSorted = [...chan].sort(
    (a, b) => b.gross - b.discounts - b.fees - b.cogs - (a.gross - a.discounts - a.fees - a.cogs)
  );

  return (
    <div>
      <PageTitle>Laporan</PageTitle>

      <Card className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className={inputCls} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Dari tanggal" />
          <input type="date" className={inputCls} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Sampai tanggal" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => setRange(todayJkt(), todayJkt())}>Hari ini</button>
          <button className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => setRange(daysAgoJkt(6), todayJkt())}>7 hari</button>
          <button className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => setRange(monthStartJkt(), todayJkt())}>Bulan ini</button>
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "terlaris", label: "Terlaris" },
          { id: "labarugi", label: "Laba rugi" },
          { id: "biaya", label: "Biaya" },
          { id: "channel", label: "Channel" },
        ]}
      />
      <Notice msg={msg} />

      {tab === "terlaris" && (
        <div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {([["qty_sold", "Terjual"], ["revenue", "Omzet"], ["gross_profit", "Laba"]] as [SortKey, string][]).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`h-10 rounded-lg border text-sm font-semibold ${sort === k ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {sortedBest.length === 0 ? (
            <Empty>Belum ada penjualan pada periode ini.</Empty>
          ) : (
            <div className="space-y-2">
              {sortedBest.map((b, i) => (
                <Card key={b.menu}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{i + 1}. {b.menu}</div>
                      <div className="text-sm text-stone-500">{b.category || "Tanpa kategori"}</div>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <div className="font-bold">{fmt(b.qty_sold)} porsi</div>
                    </div>
                  </div>
                  <Bar value={b[sort]} max={maxSort} />
                  <div className="mt-2 flex justify-between text-sm text-stone-600">
                    <span>Omzet {rupiah(b.revenue)}</span>
                    <span>Laba {rupiah(b.gross_profit)} ({pct(b.gross_profit, b.revenue)})</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "labarugi" && (
        <div className="space-y-4">
          {!pnl ? (
            <Empty>Belum ada data pada periode ini.</Empty>
          ) : (
            <>
              <Card>
                <h2 className="mb-2 font-semibold">Laporan laba rugi</h2>
                <Line label="Penjualan kotor" value={pnl.gross_sales} />
                <Line label="Diskon" value={-pnl.discounts} minus />
                <Line label="Komisi dan promo platform" value={-pnl.platform_fees} minus />
                <Line label="Pendapatan bersih" value={pnl.net_revenue} strong />
                <Line label="HPP (bahan terpakai)" value={-pnl.cogs} minus />
                <Line label="Laba kotor" value={pnl.gross_profit} strong note={`margin ${pct(pnl.gross_profit, pnl.net_revenue)}`} />
                <Line label="Biaya operasional" value={-pnl.opex} minus />
                <Line label="Laba bersih" value={pnl.net_profit} strong note={`margin ${pct(pnl.net_profit, pnl.net_revenue)}`} />
                <Line label="Waste dan selisih opname" value={-wasteLoss} minus />
                <Line label="Laba bersih setelah waste" value={pnl.net_profit - wasteLoss} strong />
              </Card>
              <Card>
                <h2 className="mb-2 font-semibold">Arus kas sederhana</h2>
                <Line label="Uang masuk (pendapatan bersih)" value={pnl.net_revenue} />
                <Line label="Belanja bahan baku" value={-purchases} minus />
                <Line label="Biaya operasional" value={-opex} minus />
                <Line label="Kas bersih periode ini" value={pnl.net_revenue - purchases - opex} strong />
                <p className="mt-2 text-xs text-stone-500">
                  Dihitung dari pendapatan yang dicatat, bukan saldo rekening. HPP memakai bahan yang terpakai, sedangkan arus kas memakai bahan yang dibeli.
                </p>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "biaya" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <div className="text-sm text-stone-500">Biaya operasional</div>
              <div className="text-lg font-bold tabular-nums">{rupiah(opex)}</div>
            </Card>
            <Card>
              <div className="text-sm text-stone-500">Belanja bahan baku</div>
              <div className="text-lg font-bold tabular-nums">{rupiah(purchases)}</div>
            </Card>
          </div>
          <Card>
            <h2 className="mb-3 font-semibold">Biaya operasional per kategori</h2>
            {expByCat.length === 0 ? (
              <Empty>Belum ada biaya pada periode ini.</Empty>
            ) : (
              <div className="space-y-3">
                {expByCat.map(([c, v]) => (
                  <div key={c}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{c}</span>
                      <span className="tabular-nums text-stone-500">{rupiah(v)} ({pct(v, opex)})</span>
                    </div>
                    <Bar value={v} max={expByCat[0][1]} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Kerugian stok</h2>
            <Line label="Waste dan selisih opname" value={-wasteLoss} minus />
            <p className="mt-2 text-xs text-stone-500">Bahan yang hilang, rusak, atau tumpah, dinilai dengan harga rata-rata bahan saat itu.</p>
          </Card>
        </div>
      )}

      {tab === "channel" && (
        <div className="space-y-3">
          {chanSorted.length === 0 ? (
            <Empty>Belum ada penjualan pada periode ini.</Empty>
          ) : (
            chanSorted.map((c) => {
              const net = c.gross - c.discounts - c.fees;
              const profit = net - c.cogs;
              return (
                <Card key={c.channel}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">{CHANNEL_LABEL[c.channel]}</h2>
                    <span className="text-sm text-stone-500">{fmt(c.qty)} porsi</span>
                  </div>
                  <Line label="Penjualan kotor" value={c.gross} />
                  <Line label="Diskon" value={-c.discounts} minus />
                  <Line label="Komisi dan promo" value={-c.fees} minus note={pct(c.fees, c.gross)} />
                  <Line label="HPP" value={-c.cogs} minus />
                  <Line label="Laba kotor" value={profit} strong note={`margin ${pct(profit, c.gross)}`} />
                </Card>
              );
            })
          )}
          <p className="text-xs text-stone-500">Margin dihitung dari penjualan kotor. Bandingkan margin Offline dengan platform online untuk melihat channel yang paling menguntungkan.</p>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, strong, minus, note }: { label: string; value: number; strong?: boolean; minus?: boolean; note?: ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${strong ? "border-t border-stone-200 font-bold" : ""}`}>
      <span className={strong ? "" : "text-stone-600"}>
        {label}
        {note && <span className="ml-2 text-xs font-normal text-stone-500">{note}</span>}
      </span>
      <span className={`tabular-nums ${minus ? "text-stone-500" : ""} ${strong && value < 0 ? "text-red-700" : ""}`}>{rupiah(value)}</span>
    </div>
  );
}
