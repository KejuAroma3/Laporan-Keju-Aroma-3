"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import { groupByCategory, INGREDIENT_CATEGORY_SUGGESTIONS } from "@/lib/group";
import type { StockRow } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, ScrollList, SearchInput, btnCls, btnGhostCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

const ALL = "__all__";
const NONE = "Tanpa kategori";

export default function StockCheckPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [usedIn, setUsedIn] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(ALL);
  const [onlyLow, setOnlyLow] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [i, r] = await Promise.all([
        supabase.from("v_stock").select("*").order("name"),
        supabase.from("recipe_items").select("ingredient_id"),
      ]);
      if (i.error) setMsg({ type: "err", text: i.error.message });
      setRows((i.data ?? []) as StockRow[]);
      const counts: Record<string, number> = {};
      for (const x of (r.data ?? []) as { ingredient_id: string }[]) counts[x.ingredient_id] = (counts[x.ingredient_id] ?? 0) + 1;
      setUsedIn(counts);
      setLoading(false);
    })();
  }, []);

  // Kategori yang ada, ditambah dua kategori kemasan/perlengkapan sebagai pilihan tetap.
  const categories = useMemo(() => {
    const set = new Set<string>(INGREDIENT_CATEGORY_SUGGESTIONS);
    for (const r of rows) set.add(r.category?.trim() || NONE);
    return [...set];
  }, [rows]);
  const catOf = (r: StockRow) => r.category?.trim() || NONE;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (cat === ALL || catOf(r) === cat) &&
        (!onlyLow || r.is_low) &&
        (!term || r.name.toLowerCase().includes(term))
    );
  }, [rows, q, cat, onlyLow]);

  const grouped = groupByCategory(filtered, (r) => r.category).map(
    ([c, items]) =>
      [c, [...items].sort((a, b) => Number(b.is_low) - Number(a.is_low) || a.name.localeCompare(b.name, "id"))] as const
  );

  const scope = cat === ALL ? rows : rows.filter((r) => catOf(r) === cat);
  const lowCount = scope.filter((r) => r.is_low).length;
  const emptyCount = scope.filter((r) => r.on_hand <= 0).length;
  const value = scope.reduce((s, r) => s + Math.max(0, r.on_hand) * r.avg_cost, 0);

  return (
    <div>
      <PageTitle sub="Sisa plastik, box, handgloves, label, kabel ties, dan semua bahan lain.">
        Cek stok bahan
      </PageTitle>
      <OwnerOnly feature="cek stok bahan">
        <Notice msg={msg} />

        <div className="mb-3 grid grid-cols-3 gap-2">
          <Card><div className="text-xs text-stone-500">Jumlah item</div><div className="text-lg font-bold tabular-nums">{scope.length}</div></Card>
          <Card><div className="text-xs text-stone-500">Menipis</div><div className={`text-lg font-bold tabular-nums ${lowCount ? "text-red-700" : ""}`}>{lowCount}</div></Card>
          <Card><div className="text-xs text-stone-500">Habis</div><div className={`text-lg font-bold tabular-nums ${emptyCount ? "text-red-700" : ""}`}>{emptyCount}</div></Card>
        </div>
        <Card className="mb-3">
          <div className="text-sm text-stone-500">Nilai stok{cat === ALL ? "" : ` ${cat.toLowerCase()}`}</div>
          <div className="text-xl font-bold tabular-nums">{rupiah(value)}</div>
        </Card>

        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {[ALL, ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold ${
                cat === c ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              {c === ALL ? "Semua" : c}
            </button>
          ))}
        </div>

        <SearchInput value={q} onChange={setQ} placeholder="Cari bahan, mis. plastik, box…" />
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          Tampilkan yang menipis atau habis saja
        </label>

        {loading ? (
          <p className="py-6 text-center text-sm text-stone-500">Memuat…</p>
        ) : rows.length === 0 ? (
          <Empty>
            Belum ada bahan. Tambahkan di <Link href="/ingredients" className="underline">Lainnya › Bahan baku</Link>,
            pilih kategori &quot;Bahan kemasan&quot; atau &quot;Bahan habis pakai&quot; untuk plastik, box, dan sejenisnya.
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>Tidak ada bahan yang cocok.</Empty>
        ) : (
          <ScrollList className="space-y-4">
            {grouped.map(([c, items]) => (
              <section key={c}>
                <h2 className="mb-2 text-sm font-semibold text-stone-500">{c}</h2>
                <div className="space-y-2">
                  {items.map((r) => {
                    const n = usedIn[r.id] ?? 0;
                    const out = r.on_hand <= 0;
                    return (
                      <Card key={r.id} className={r.is_low ? "border-red-300" : ""}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{r.name}</div>
                            <div className="text-sm text-stone-500">
                              Minimum {fmt(r.min_stock)} {r.unit}, {rupiah(r.avg_cost)} per {r.unit}
                            </div>
                            <div className={`text-xs ${n === 0 ? "font-medium text-amber-700" : "text-stone-400"}`}>
                              {n === 0 ? "Belum masuk resep manapun, belum ikut HPP" : `Dipakai di ${n} resep`}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`text-lg font-bold tabular-nums ${r.is_low ? "text-red-700" : ""}`}>{fmt(r.on_hand)}</div>
                            <div className="text-xs text-stone-500">{r.unit}</div>
                          </div>
                        </div>
                        {r.is_low && (
                          <div className="mt-2 text-xs font-semibold text-red-700">
                            {out ? "Stok habis, segera belanja." : "Stok menipis, segera belanja."}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </ScrollList>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/stock" className={`${btnCls} text-center`}>Catat belanja</Link>
          <Link href="/ingredients" className={`${btnGhostCls} text-center`}>Tambah bahan baru</Link>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Stok berkurang otomatis dari resep (saat produksi atau saat terjual). Barang yang tidak masuk resep,
          misalnya sarung tangan, dikurangi lewat Stok bahan › Keluar, atau masukkan ke resep dengan jumlah kecil
          (mis. 1 pasang untuk 50 pcs) supaya biayanya ikut HPP.
        </p>
      </OwnerOnly>
    </div>
  );
}
