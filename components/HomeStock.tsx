"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { roundStock } from "@/lib/stockround";
import { fmt } from "@/lib/format";
import { groupByCategory, isSupplyCategory } from "@/lib/group";
import { buildProductionEntries, visibleEntries } from "@/lib/production";
import type { ProductGroup, ProductStockRow, StockRow } from "@/lib/types";
import { Card, Empty, ScrollList } from "@/components/ui";

// Blok stok: "produksi" plus satu blok per kategori barang (mis. Bahan Jadi, Bahan kemasan, Bahan Pelengkap).
// Kunci blok kategori = "kat:<nama>". Bawaan: kategori selain Bahan baku tampil, Bahan baku disembunyikan.
type Prefs = { sections: Record<string, boolean>; onlyLow: boolean };

const DEFAULTS: Prefs = { sections: { produksi: true }, onlyLow: false };
const KEY = "beranda-stok-tampilan-2";
const NO_CAT = "Tanpa kategori";
const catKey = (c: string) => `kat:${c}`;

type Item = { key: string; name: string; value: string; unit: string; low: boolean; none?: boolean };

// Ringkasan stok di Beranda. Blok mana yang tampil dan apakah semua stok atau hanya yang menipis
// bisa dipilih; pilihan disimpan di perangkat ini. Staf melihat stok produksi dan barang non-bahan baku.
export default function HomeStock({ isOwner }: { isOwner: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [ings, setIngs] = useState<StockRow[]>([]);
  const [prod, setProd] = useState<ProductStockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs>;
        setPrefs({
          sections: { ...DEFAULTS.sections, ...(p.sections && typeof p.sections === "object" ? p.sections : {}) },
          onlyLow: typeof p.onlyLow === "boolean" ? p.onlyLow : DEFAULTS.onlyLow,
        });
      }
    } catch { /* tanpa penyimpanan: pakai bawaan */ }
  }, []);

  function update(next: Prefs) {
    setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }

  useEffect(() => {
    (async () => {
      // masing-masing boleh gagal (SQL 9/13 belum dijalankan), blok terkait tampil kosong
      const [i, p, g] = await Promise.all([
        supabase.from("v_stock").select("*").order("name"),
        supabase.from("v_product_stock").select("*").order("name"),
        supabase.from("product_groups").select("*"),
      ]);
      setIngs(roundStock((i.data ?? []) as StockRow[]));
      setProd((p.data ?? []) as ProductStockRow[]);
      setGroups((g.data ?? []) as ProductGroup[]);
      setLoading(false);
    })();
  }, [isOwner]);

  const lists = useMemo(() => {
    const production: Item[] = visibleEntries(buildProductionEntries(prod, groups)).map((e) => {
      const tracked = e.rows.filter((r) => r.track_stock);
      return {
        key: e.key,
        name: e.label,
        value: tracked.length ? fmt(tracked.reduce((s, r) => s + r.stock_on_hand, 0)) : "–",
        unit: tracked[0]?.stock_unit ?? e.rows[0]?.stock_unit ?? "",
        low: e.rows.some((r) => r.is_low),
        none: tracked.length === 0,
      };
    });
    const toItem = (r: StockRow): Item => ({ key: r.id, name: r.name, value: fmt(r.on_hand), unit: r.unit, low: r.is_low });
    const sortLow = (a: Item, b: Item) => Number(b.low) - Number(a.low);
    // staf tidak melihat bahan baku (kategori kosong atau "Bahan baku")
    const visibleIngs = ings.filter((r) => isOwner || isSupplyCategory(r.category));
    const byCat = new Map<string, Item[]>();
    for (const [c, rows] of groupByCategory(visibleIngs, (r) => r.category)) byCat.set(c, rows.map(toItem).sort(sortLow));
    return { production: production.sort(sortLow), byCat };
  }, [prod, groups, ings, isOwner]);

  // semua blok yang bisa dipilih: stok produksi + tiap kategori
  const blocks: { id: string; label: string; items: Item[]; link: string; defaultOn: boolean }[] = [
    { id: "produksi", label: "Stok produksi", items: lists.production, link: "/production", defaultOn: true },
    ...Array.from(lists.byCat.entries()).map(([c, items]) => {
      const supply = isSupplyCategory(c === NO_CAT ? null : c);
      return { id: catKey(c), label: c, items, link: supply ? "/packaging" : "/ingredients", defaultOn: supply };
    }),
  ];
  const isOn = (b: { id: string; defaultOn: boolean }) => prefs.sections[b.id] ?? b.defaultOn;
  const shown = blocks.filter(isOn);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Stok</h2>
        <button type="button" className="text-sm font-medium text-brand-800 underline" onClick={() => setEditing((v) => !v)}>
          {editing ? "Selesai" : "Atur tampilan"}
        </button>
      </div>

      {editing && (
        <Card className="space-y-3">
          <div className="text-sm font-semibold">Stok yang ditampilkan di Beranda</div>
          {blocks.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={isOn(b)}
                onChange={(e) => update({ ...prefs, sections: { ...prefs.sections, [b.id]: e.target.checked } })}
              />
              {b.label}
              <span className="text-xs text-stone-400">({b.items.length})</span>
            </label>
          ))}
          <div className="border-t border-stone-100 pt-3">
            <div className="mb-2 text-sm font-semibold">Isi daftar</div>
            <div className="grid grid-cols-2 gap-2">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => update({ ...prefs, onlyLow: v })}
                  className={`h-10 rounded-xl border text-sm font-semibold ${
                    prefs.onlyLow === v ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {v ? "Menipis saja" : "Semua stok"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-stone-500">Pilihan ini tersimpan di perangkat ini saja.</p>
        </Card>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-stone-500">Memuat…</p>
      ) : shown.length === 0 ? (
        <Card>
          <Empty>Tidak ada blok stok yang dipilih. Ketuk &quot;Atur tampilan&quot; untuk menampilkannya.</Empty>
        </Card>
      ) : (
        shown.map((b) => {
          const all = b.items;
          const lowCount = all.filter((x) => x.low).length;
          const items = prefs.onlyLow ? all.filter((x) => x.low) : all;
          return (
            <Card key={b.id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{b.label}</h3>
                <span className={`shrink-0 text-xs ${lowCount > 0 ? "font-semibold text-red-700" : "text-stone-500"}`}>
                  {lowCount > 0 ? `${lowCount} menipis` : "aman"}
                </span>
              </div>
              {items.length === 0 ? (
                <Empty>
                  {all.length === 0
                    ? b.id === "produksi"
                      ? "Belum ada menu."
                      : "Belum ada barang."
                    : "Semua masih di atas batas minimum."}
                </Empty>
              ) : (
                <ScrollList className="divide-y divide-stone-100" maxHeight="18rem">
                  {items.map((x) => (
                    <div key={x.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{x.name}</span>
                      <span
                        className={`shrink-0 tabular-nums ${x.low ? "font-semibold text-red-700" : x.none ? "text-stone-300" : "text-stone-700"}`}
                      >
                        {x.none ? "belum diproduksi" : `${x.value} ${x.unit}`}
                      </span>
                    </div>
                  ))}
                </ScrollList>
              )}
              <Link href={b.link} className="mt-2 block text-sm font-medium text-brand-800 underline">
                Buka {b.label.toLowerCase()}
              </Link>
            </Card>
          );
        })
      )}
    </div>
  );
}
