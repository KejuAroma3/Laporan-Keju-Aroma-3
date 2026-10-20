"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CHANNEL_LABEL, addMonthsIso, addYearsIso, dayJkt, fmt, labelDayShort, labelMonth, labelMonthShort, labelYear,
  monthEndIso, monthStartIso, rangeIso, rupiah, todayJkt, yearEndIso, yearStartIso,
} from "@/lib/format";
import { Bar, Card, Empty } from "@/components/ui";

type Mode = "hari" | "bulan" | "tahun";
type Sale = { channel: keyof typeof CHANNEL_LABEL; sold_at: string; discount: number; platform_fee: number; sale_items: { qty: number; unit_price: number }[] };
type Bucket = { key: string; trx: number; gross: number; discount: number; fee: number; net: number };

function bounds(mode: Mode, anchor: string) {
  if (mode === "hari") return { from: monthStartIso(anchor), to: monthEndIso(anchor) }; // harian: semua hari dalam satu bulan
  if (mode === "bulan") return { from: yearStartIso(anchor), to: yearEndIso(anchor) }; // bulanan: semua bulan dalam satu tahun
  return { from: "2020-01-01", to: todayJkt() }; // tahunan: semua tahun
}

// Riwayat total penjualan bersih (subtotal - diskon - komisi platform) per hari, per bulan, dan per tahun.
export default function SalesHistory() {
  const [mode, setMode] = useState<Mode>("hari");
  const [anchor, setAnchor] = useState(todayJkt());
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { from, to } = bounds(mode, anchor);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const { start, end } = rangeIso(from, to);
      const all: Sale[] = [];
      for (let off = 0; off < 100000; off += 1000) {
        const { data, error } = await supabase
          .from("sales")
          .select("channel, sold_at, discount, platform_fee, sale_items(qty, unit_price)")
          .gte("sold_at", start)
          .lte("sold_at", end)
          .order("sold_at", { ascending: false })
          .range(off, off + 999);
        if (error) {
          if (live) { setErr(error.message); setLoading(false); }
          return;
        }
        all.push(...((data ?? []) as unknown as Sale[]));
        if ((data ?? []).length < 1000) break;
      }
      if (live) { setErr(null); setSales(all); setLoading(false); }
    })();
    return () => { live = false; };
  }, [from, to]);

  const buckets = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const s of sales) {
      const d = dayJkt(s.sold_at);
      const key = mode === "hari" ? d : mode === "bulan" ? `${d.slice(0, 7)}-01` : `${d.slice(0, 4)}-01-01`;
      const b = m.get(key) ?? { key, trx: 0, gross: 0, discount: 0, fee: 0, net: 0 };
      const gross = s.sale_items.reduce((t, i) => t + i.qty * i.unit_price, 0);
      b.trx += 1;
      b.gross += gross;
      b.discount += Number(s.discount);
      b.fee += Number(s.platform_fee);
      b.net += gross - Number(s.discount); // pendapatan bersih: setelah diskon, sebelum komisi
      m.set(key, b);
    }
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [sales, mode]);

  const [chanSort, setChanSort] = useState<"net" | "trx">("net");
  const channels = useMemo(() => {
    const m = new Map<string, { channel: string; trx: number; net: number }>();
    for (const s of sales) {
      const gross = s.sale_items.reduce((t, i) => t + i.qty * i.unit_price, 0);
      const c = m.get(s.channel) ?? { channel: s.channel, trx: 0, net: 0 };
      c.trx += 1;
      c.net += gross - Number(s.discount);
      m.set(s.channel, c);
    }
    return [...m.values()].sort((a, b) => b[chanSort] - a[chanSort]);
  }, [sales, chanSort]);

  const totalNet = buckets.reduce((s, b) => s + b.net, 0);
  const totalFee = buckets.reduce((s, b) => s + b.fee, 0);
  const totalTrx = buckets.reduce((s, b) => s + b.trx, 0);
  const maxNet = Math.max(1, ...buckets.map((b) => b.net));

  const step = (d: -1 | 1) => setAnchor(mode === "hari" ? addMonthsIso(anchor, d) : addYearsIso(anchor, d));
  const title = mode === "hari" ? labelMonth(anchor) : mode === "bulan" ? labelYear(anchor) : "Semua tahun";
  const atEnd = mode === "tahun" || to >= todayJkt();
  const rowLabel = (key: string) =>
    mode === "hari" ? `${labelDayShort(key)} ${labelMonthShort(key)}` : mode === "bulan" ? `${labelMonth(key)}` : labelYear(key);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1">
        {(["hari", "bulan", "tahun"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? "bg-white text-brand-800 shadow-sm" : "text-stone-600"}`}
          >
            {m === "hari" ? "Per hari" : m === "bulan" ? "Per bulan" : "Per tahun"}
          </button>
        ))}
      </div>
      {mode !== "tahun" && (
        <div className="flex items-center gap-2">
          <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white" onClick={() => step(-1)} aria-label="Sebelumnya">‹</button>
          <div className="min-w-0 flex-1 text-center text-sm font-semibold">{title}</div>
          <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white disabled:opacity-30" onClick={() => step(1)} disabled={atEnd} aria-label="Berikutnya">›</button>
        </div>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <Card className="bg-stone-50">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-stone-600">Total penjualan bersih · {title}</span>
          <span className="text-xl font-bold tabular-nums">{rupiah(totalNet)}</span>
        </div>
        <div className="mt-0.5 text-xs text-stone-500">{fmt(totalTrx)} transaksi · setelah diskon (komisi platform {rupiah(totalFee)} dipisah)</div>
      </Card>

      {!loading && channels.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Platform terlaris · {title}</h3>
            <div className="flex gap-1 rounded-lg bg-stone-200/70 p-0.5 text-xs">
              {([["net", "Penjualan"], ["trx", "Transaksi"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setChanSort(k)} className={`rounded-md px-2.5 py-1 font-medium ${chanSort === k ? "bg-white text-brand-800 shadow-sm" : "text-stone-600"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ol className="space-y-3">
            {channels.map((c, i) => (
              <li key={c.channel}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold">
                    <span className="mr-2 text-stone-400">{i + 1}</span>
                    {CHANNEL_LABEL[c.channel as keyof typeof CHANNEL_LABEL] ?? c.channel}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{chanSort === "net" ? rupiah(c.net) : `${fmt(c.trx)} transaksi`}</span>
                </div>
                <Bar value={c[chanSort]} max={Math.max(1, channels[0][chanSort])} />
                <div className="mt-1 flex justify-between text-xs text-stone-500">
                  <span>{chanSort === "net" ? `${fmt(c.trx)} transaksi` : rupiah(c.net)}</span>
                  <span>{totalNet > 0 ? `${((c.net / totalNet) * 100).toFixed(1)}% dari penjualan bersih` : ""}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-stone-500">Memuat…</p>
      ) : buckets.length === 0 ? (
        <Empty>Belum ada penjualan di periode ini.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {buckets.map((b) => (
              <li key={b.key} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold">{rowLabel(b.key)}</span>
                  <span className="shrink-0 font-bold tabular-nums">{rupiah(b.net)}</span>
                </div>
                <Bar value={b.net} max={maxNet} />
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-stone-500">
                  <span>{fmt(b.trx)} transaksi</span>
                  <span>
                    Kotor {rupiah(b.gross)}
                    {b.discount > 0 ? ` · diskon −${rupiah(b.discount)}` : ""}
                    {b.fee > 0 ? ` · komisi −${rupiah(b.fee)} · diterima ${rupiah(b.net - b.fee)}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
