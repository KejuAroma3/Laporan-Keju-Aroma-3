"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { fmt, pct, rupiah } from "@/lib/format";
import { Bar, Card, Empty, ScrollList, SearchInput, btnGhostCls } from "@/components/ui";

export type Purchase = {
  id: string;
  qty: number;
  unit_cost: number | null;
  note: string | null;
  created_at: string;
  ingredient_id: string;
  ingredients: { name: string; unit: string } | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const csvDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const totalOf = (p: Purchase) => p.qty * (p.unit_cost ?? 0);
const nameOf = (p: Purchase) => p.ingredients?.name ?? "Bahan dihapus";
const unitOf = (p: Purchase) => p.ingredients?.unit ?? "";

type Group = { id: string; name: string; unit: string; qty: number; spent: number; items: Purchase[] };

export default function PurchaseReport({ items, from, to }: { items: Purchase[]; from: string; to: string }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"bahan" | "semua">("bahan");
  const [open, setOpen] = useState<string | null>(null);

  const totalAll = items.reduce((s, p) => s + totalOf(p), 0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((p) => nameOf(p).toLowerCase().includes(term) || (p.note ?? "").toLowerCase().includes(term));
  }, [items, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const p of filtered) {
      const g = map.get(p.ingredient_id) ?? { id: p.ingredient_id, name: nameOf(p), unit: unitOf(p), qty: 0, spent: 0, items: [] };
      g.qty += p.qty;
      g.spent += totalOf(p);
      g.items.push(p);
      map.set(p.ingredient_id, g);
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [filtered]);

  const kinds = new Set(items.map((p) => p.ingredient_id)).size;
  const maxSpent = Math.max(0, ...groups.map((g) => g.spent));

  function exportCsv() {
    downloadCsv(`belanja-${from}-sd-${to}.csv`, [
      ["Tanggal", "Bahan", "Jumlah", "Satuan", "Harga per satuan", "Total", "Catatan"],
      ...items.map((p) => [
        csvDate(p.created_at),
        nameOf(p),
        p.qty,
        unitOf(p),
        Math.round((p.unit_cost ?? 0) * 100) / 100,
        Math.round(totalOf(p)),
        p.note ?? "",
      ]),
    ]);
  }

  if (items.length === 0) {
    return <Empty>Belum ada pembelian bahan pada periode ini. Catat lewat Stok › Masuk.</Empty>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-stone-500">Total belanja</div>
          <div className="text-base font-bold tabular-nums">{rupiah(totalAll)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-stone-500">Transaksi</div>
          <div className="text-base font-bold tabular-nums">{items.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-stone-500">Jenis bahan</div>
          <div className="text-base font-bold tabular-nums">{kinds}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([["bahan", "Per bahan"], ["semua", "Semua transaksi"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`h-10 rounded-lg border text-sm font-semibold ${
              view === id ? "border-brand-700 bg-brand-700 text-white" : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <SearchInput value={q} onChange={setQ} placeholder="Cari bahan atau catatan nota…" />
        {filtered.length === 0 ? (
          <Empty>Tidak ada pembelian yang cocok dengan pencarian.</Empty>
        ) : view === "bahan" ? (
          <ScrollList className="space-y-2">
            {groups.map((g) => (
              <Card key={g.id}>
                <button className="w-full text-left" onClick={() => setOpen(open === g.id ? null : g.id)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{g.name}</span>
                    <span className="shrink-0 font-bold tabular-nums">{rupiah(g.spent)}</span>
                  </div>
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-stone-500">
                    <span>
                      {g.items.length}x beli, total {fmt(g.qty)} {g.unit}
                      {g.qty > 0 ? `, rata-rata ${rupiah(g.spent / g.qty)} per ${g.unit}` : ""}
                    </span>
                    <span className="shrink-0">{pct(g.spent, totalAll)}</span>
                  </div>
                  <Bar value={g.spent} max={maxSpent} />
                  <div className="mt-2 text-xs font-medium text-brand-800">{open === g.id ? "Tutup rincian" : "Lihat rincian"}</div>
                </button>
                {open === g.id && (
                  <div className="mt-2 divide-y divide-stone-100 border-t border-stone-100">
                    {g.items.map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {fmt(p.qty)} {g.unit} <span className="font-normal text-stone-500">@ {rupiah(p.unit_cost ?? 0)}</span>
                          </div>
                          <div className="text-xs text-stone-500">
                            {fmtDate(p.created_at)}
                            {p.note ? `, ${p.note}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 font-semibold tabular-nums">{rupiah(totalOf(p))}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </ScrollList>
        ) : (
          <ScrollList className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-4">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{nameOf(p)}</div>
                  <div className="text-stone-600">
                    {fmt(p.qty)} {unitOf(p)} <span className="text-stone-500">@ {rupiah(p.unit_cost ?? 0)}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {fmtDate(p.created_at)}
                    {p.note ? `, ${p.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{rupiah(totalOf(p))}</div>
              </div>
            ))}
          </ScrollList>
        )}
      </div>

      <button className={`${btnGhostCls} w-full`} onClick={exportCsv}>
        Unduh laporan belanja (CSV)
      </button>
      <p className="text-xs text-stone-500">
        Tanggal belanja adalah tanggal yang dipilih saat mencatat di Stok › Masuk (pembelian yang dicatat
        sebelum ada kolom tanggal memakai tanggal saat dicatat). Reset stok menghapus riwayat pembelian bahan
        yang direset, sehingga ikut hilang dari laporan ini.
      </p>
    </div>
  );
}
