"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rangeIso, rupiah } from "@/lib/format";
import { custKey, lastOrderLabel } from "@/lib/customers";
import { Card, Empty, Stat } from "@/components/ui";

type SaleRow = {
  customer_name: string;
  sold_at: string;
  discount: number;
  platform_fee: number;
  sale_items: { qty: number; unit_price: number }[];
};

// Laporan pelanggan: siapa yang sudah repeat order. "Repeat" = pelanggan yang di periode ini
// sudah punya pesanan sebelumnya atau memesan lebih dari sekali.
export default function CustomerReport({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [unnamed, setUnnamed] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const all: SaleRow[] = [];
      for (let f = 0; f < 20000; f += 1000) {
        const { data, error } = await supabase
          .from("sales")
          .select("customer_name, sold_at, discount, platform_fee, sale_items(qty, unit_price)")
          .not("customer_name", "is", null)
          .order("sold_at", { ascending: true })
          .range(f, f + 999);
        if (error) {
          setErr(/customer_name|schema cache/i.test(error.message) ? "Nama pelanggan belum aktif. Jalankan supabase/22-nama-pelanggan.sql di Supabase (SQL Editor)." : error.message);
          setRows([]);
          return;
        }
        all.push(...((data ?? []) as unknown as SaleRow[]));
        if ((data ?? []).length < 1000) break;
      }
      setRows(all);
      const { start, end } = rangeIso(from, to);
      const c = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .is("customer_name", null)
        .gte("sold_at", start)
        .lte("sold_at", end);
      setUnnamed(c.count ?? 0);
    })();
  }, [from, to]);

  const data = useMemo(() => {
    const { start, end } = rangeIso(from, to);
    const byCust = new Map<string, { name: string; total: number; before: number; inPeriod: number; spend: number; last: string }>();
    for (const r of rows) {
      const k = custKey(r.customer_name);
      if (!k) continue;
      const c = byCust.get(k) ?? { name: r.customer_name.trim(), total: 0, before: 0, inPeriod: 0, spend: 0, last: r.sold_at };
      c.total += 1;
      if (r.sold_at < start) c.before += 1;
      else if (r.sold_at <= end) {
        c.inPeriod += 1;
        c.spend += r.sale_items.reduce((s, i) => s + i.qty * i.unit_price, 0) - r.discount - r.platform_fee;
      }
      if (r.sold_at > c.last) c.last = r.sold_at;
      byCust.set(k, c);
    }
    const list = [...byCust.values()].filter((c) => c.inPeriod > 0);
    const repeat = (c: { before: number; inPeriod: number }) => c.before > 0 || c.inPeriod > 1;
    return {
      list: list.sort((a, b) => b.spend - a.spend),
      repeatCount: list.filter(repeat).length,
      newCount: list.filter((c) => !repeat(c)).length,
      repeat,
    };
  }, [rows, from, to]);

  if (err) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>;

  const pctRepeat = data.list.length > 0 ? Math.round((data.repeatCount / data.list.length) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pelanggan" value={String(data.list.length)} />
        <Stat label="Repeat" value={String(data.repeatCount)} hint={`${pctRepeat}%`} />
        <Stat label="Baru" value={String(data.newCount)} />
      </div>
      {unnamed > 0 && (
        <p className="text-xs text-stone-500">{unnamed} penjualan di periode ini belum diisi nama pelanggannya.</p>
      )}
      <Card>
        <h2 className="mb-2 font-semibold">Pelanggan di periode ini</h2>
        {data.list.length === 0 ? (
          <Empty>Belum ada penjualan bernama pelanggan di periode ini.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.list.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {c.name}{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        data.repeat(c) ? "bg-brand-100 text-brand-900" : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {data.repeat(c) ? "repeat" : "baru"}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {c.inPeriod}× di periode ini · {c.total}× total · terakhir {lastOrderLabel(c.last)}
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{rupiah(c.spend)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
