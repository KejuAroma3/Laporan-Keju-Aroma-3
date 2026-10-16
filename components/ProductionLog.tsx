"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDaysIso, addMonthsIso, addYearsIso, dayJkt, fmt, labelDay, labelDayShort, labelMonth, labelMonthShort,
  labelYear, monthEndIso, monthStartIso, rangeIso, todayJkt, yearEndIso, yearStartIso,
} from "@/lib/format";
import { Card, Empty, ScrollList } from "@/components/ui";

type Mode = "hari" | "bulan" | "tahun";
type Row = { id: string; created_at: string; qty: number; note: string | null; menu_item_id: string; menu_items: { name: string } | null };

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":");

function bounds(mode: Mode, anchor: string) {
  if (mode === "hari") return { from: anchor, to: anchor };
  if (mode === "bulan") return { from: monthStartIso(anchor), to: monthEndIso(anchor) };
  return { from: yearStartIso(anchor), to: yearEndIso(anchor) };
}

// Riwayat produksi per hari / bulan / tahun: jumlah produksi, per produk, dan catatan tiap produksi.
export default function ProductionLog({ refreshKey = 0 }: { refreshKey?: number }) {
  const [mode, setMode] = useState<Mode>("hari");
  const [anchor, setAnchor] = useState(todayJkt());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { from, to } = bounds(mode, anchor);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const { start, end } = rangeIso(from, to);
      const all: Row[] = [];
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase
          .from("product_movements")
          .select("id, created_at, qty, note, menu_item_id, menu_items(name)")
          .eq("type", "production")
          .gt("qty", 0)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false })
          .range(off, off + 999);
        if (error) {
          if (live) { setErr(error.message); setLoading(false); }
          return;
        }
        all.push(...((data ?? []) as unknown as Row[]));
        if ((data ?? []).length < 1000) break;
      }
      if (live) { setErr(null); setRows(all); setLoading(false); }
    })();
    return () => { live = false; };
  }, [from, to, refreshKey]);

  const total = rows.reduce((s, r) => s + Number(r.qty), 0);
  const perProduct = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; times: number }>();
    for (const r of rows) {
      const cur = m.get(r.menu_item_id) ?? { name: r.menu_items?.name ?? "Menu", qty: 0, times: 0 };
      cur.qty += Number(r.qty);
      cur.times += 1;
      m.set(r.menu_item_id, cur);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [rows]);

  // kelompok: per hari (tampilan hari/bulan, lengkap dengan catatan) atau per bulan (tampilan tahun)
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const d = dayJkt(r.created_at);
      const key = mode === "tahun" ? `${d.slice(0, 7)}-01` : d;
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, mode]);

  const step = (d: -1 | 1) =>
    setAnchor(mode === "hari" ? addDaysIso(anchor, d) : mode === "bulan" ? addMonthsIso(anchor, d) : addYearsIso(anchor, d));
  const title = mode === "hari" ? labelDay(anchor) : mode === "bulan" ? labelMonth(anchor) : labelYear(anchor);
  const atEnd = to >= todayJkt();

  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-lg font-bold">Riwayat produksi</h2>
      <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1">
        {(["hari", "bulan", "tahun"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? "bg-white text-brand-800 shadow-sm" : "text-stone-600"}`}
          >
            {m === "hari" ? "Harian" : m === "bulan" ? "Bulanan" : "Tahunan"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white" onClick={() => step(-1)} aria-label="Sebelumnya">‹</button>
        <div className="min-w-0 flex-1 text-center text-sm font-semibold">{title}</div>
        <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white disabled:opacity-30" onClick={() => step(1)} disabled={atEnd} aria-label="Berikutnya">›</button>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <Card className="flex items-baseline justify-between gap-3 bg-stone-50">
        <span className="text-sm text-stone-600">Total produksi ({rows.length}x catat)</span>
        <span className="text-xl font-bold tabular-nums">{fmt(total)} pcs</span>
      </Card>

      {loading ? (
        <p className="py-4 text-center text-sm text-stone-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <Empty>Belum ada produksi di periode ini.</Empty>
      ) : (
        <>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-stone-500">Per produk</h3>
            <ul className="divide-y divide-stone-100">
              {perProduct.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm">{p.name}{mode !== "hari" && <span className="text-xs text-stone-400"> · {p.times}x</span>}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmt(p.qty)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-semibold text-stone-500">{mode === "tahun" ? "Per bulan" : "Rincian dan catatan"}</h3>
            <ScrollList className="divide-y divide-stone-100">
              {groups.map(([key, list]) => {
                const sum = list.reduce((s, r) => s + Number(r.qty), 0);
                return (
                  <div key={key} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold">
                        {mode === "tahun" ? `${labelMonthShort(key)} ${key.slice(0, 4)}` : mode === "bulan" ? `${labelDayShort(key)} ${labelMonthShort(key)}` : timeHeader(list)}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{fmt(sum)} pcs</span>
                    </div>
                    {mode !== "tahun" && (
                      <ul className="mt-1 space-y-1">
                        {list.map((r) => (
                          <li key={r.id} className="text-sm text-stone-600">
                            <div className="flex justify-between gap-3">
                              <span className="min-w-0">{mode === "bulan" && <span className="text-xs text-stone-400">{timeFmt(r.created_at)} · </span>}{r.menu_items?.name ?? "Menu"}</span>
                              <span className="shrink-0 tabular-nums">{fmt(Number(r.qty))}</span>
                            </div>
                            {r.note && <div className="text-xs text-stone-500">Ket: {r.note}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </ScrollList>
          </Card>
        </>
      )}
    </div>
  );
}

// Tampilan harian: satu kelompok per hari, jadi judulnya cukup "Dicatat pukul …".
function timeHeader(list: Row[]) {
  const times = list.map((r) => timeFmt(r.created_at)).sort();
  return times.length === 1 ? `Pukul ${times[0]}` : `Pukul ${times[0]} – ${times[times.length - 1]}`;
}
