"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah, todayJkt } from "@/lib/format";
import { isSupplyCategory } from "@/lib/group";
import { buildProductionEntries } from "@/lib/production";
import type { CustomLine } from "@/lib/customorder";
import type { ProductGroup, ProductStockRow, StockRow } from "@/lib/types";
import { Card, Empty, Label, ScrollList, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

const KINDS = ["Voucher hadiah", "Sampel", "Konsumsi sendiri", "Donasi"];
const NEED_SQL = "Pengeluaran promosi belum aktif. Jalankan supabase/24-pengeluaran-promosi.sql di Supabase (SQL Editor), lalu coba lagi.";

type Promo = { id: string; out_at: string; kind: string; note: string | null; total_cost: number };
type PromoLine = { promo_id: string; kind: "produk" | "bahan"; ref_id: string; qty: number };

const dateJkt = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

// Stok keluar tanpa penjualan: voucher hadiah, sampel, konsumsi sendiri, donasi. Tidak masuk omzet; nilainya
// (HPP stok) jadi "Biaya promosi" di Laporan. Staf boleh mencatat, nilai rupiah hanya terlihat oleh pemilik.
export default function PromoOut({ isOwner, onDone }: { isOwner: boolean; onDone: (m: Msg) => void }) {
  const [prod, setProd] = useState<ProductStockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [ings, setIngs] = useState<StockRow[]>([]);
  const [history, setHistory] = useState<Promo[]>([]);
  const [lines, setLines] = useState<PromoLine[]>([]);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [kind, setKind] = useState(KINDS[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayJkt());
  const [products, setProducts] = useState<CustomLine[]>([{ key: 1, id: "", qty: "" }]);
  const [supplies, setSupplies] = useState<CustomLine[]>([]);
  const [orig, setOrig] = useState<Record<string, number>>({});
  const [nextKey, setNextKey] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, g, i, h] = await Promise.all([
      supabase.from("v_product_stock").select("*"),
      supabase.from("product_groups").select("*"),
      supabase.from("v_stock").select("*").order("name"),
      supabase.from("promo_outs").select("id, out_at, kind, note, total_cost").order("out_at", { ascending: false }).limit(50),
    ]);
    setProd((p.data ?? []) as ProductStockRow[]);
    setGroups((g.data ?? []) as ProductGroup[]);
    setIngs((i.data ?? []) as StockRow[]);
    if (h.error) {
      setHistoryErr(/promo_outs|schema cache/i.test(h.error.message) ? NEED_SQL : h.error.message);
      setHistory([]);
      setLines([]);
      return;
    }
    setHistoryErr(null);
    const list = (h.data ?? []) as Promo[];
    setHistory(list);
    if (list.length > 0) {
      const l = await supabase.from("promo_out_lines").select("promo_id, kind, ref_id, qty").in("promo_id", list.map((x) => x.id));
      setLines((l.data ?? []) as PromoLine[]);
    } else setLines([]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const productOptions = useMemo(() => {
    const out: { id: string; label: string; row: ProductStockRow }[] = [];
    for (const e of buildProductionEntries(prod, groups)) {
      for (const r of e.rows) {
        if (!r.track_stock) continue;
        out.push({ id: r.id, label: e.kind === "group" ? r.variant_name || r.name : e.label, row: r });
      }
    }
    return out;
  }, [prod, groups]);
  const supplyOptions = useMemo(
    () =>
      [...ings].sort(
        (a, b) => Number(isSupplyCategory(b.category)) - Number(isSupplyCategory(a.category)) || a.name.localeCompare(b.name, "id")
      ),
    [ings]
  );

  const costOfProd = (l: CustomLine) => (productOptions.find((o) => o.id === l.id)?.row.avg_product_cost ?? 0) * (Number(l.qty) || 0);
  const costOfSupply = (l: CustomLine) => (ings.find((i) => i.id === l.id)?.avg_cost ?? 0) * (Number(l.qty) || 0);
  const totalCost = products.reduce((s, l) => s + costOfProd(l), 0) + supplies.reduce((s, l) => s + costOfSupply(l), 0);

  const over: string[] = [];
  for (const l of products) {
    const o = productOptions.find((x) => x.id === l.id);
    if (o && (Number(l.qty) || 0) > o.row.stock_on_hand + (orig[`produk:${l.id}`] ?? 0)) over.push(o.label);
  }
  for (const l of supplies) {
    const i = ings.find((x) => x.id === l.id);
    if (i && (Number(l.qty) || 0) > i.on_hand + (orig[`bahan:${l.id}`] ?? 0)) over.push(i.name);
  }

  const setLine = (list: CustomLine[], set: (v: CustomLine[]) => void, key: number, patch: Partial<CustomLine>) =>
    set(list.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function resetForm() {
    setEditId(null);
    setKind(KINDS[0]);
    setNote("");
    setDate(todayJkt());
    setProducts([{ key: 1, id: "", qty: "" }]);
    setSupplies([]);
    setOrig({});
    setErr(null);
  }

  function startEdit(p: Promo) {
    const mine = lines.filter((l) => l.promo_id === p.id);
    let k = 100;
    const used: Record<string, number> = {};
    for (const l of mine) used[`${l.kind}:${l.ref_id}`] = (used[`${l.kind}:${l.ref_id}`] ?? 0) + Number(l.qty);
    setEditId(p.id);
    setKind(p.kind);
    setNote(p.note ?? "");
    setDate(dateJkt(p.out_at));
    setOrig(used);
    const pl = mine.filter((l) => l.kind === "produk").map((l) => ({ key: k++, id: l.ref_id, qty: String(l.qty) }));
    setProducts(pl.length > 0 ? pl : [{ key: k++, id: "", qty: "" }]);
    setSupplies(mine.filter((l) => l.kind === "bahan").map((l) => ({ key: k++, id: l.ref_id, qty: String(l.qty) })));
    setNextKey(k + 1);
    setErr(null);
    try { window.scrollTo({ top: 0 }); } catch { /* abaikan */ }
  }

  async function save() {
    setErr(null);
    if (!kind.trim()) return setErr("Pilih atau isi jenis pengeluaran.");
    const pl = products.filter((l) => l.id && Number(l.qty) > 0);
    const sl = supplies.filter((l) => l.id && Number(l.qty) > 0);
    if (pl.length === 0 && sl.length === 0) return setErr("Isi minimal satu produk atau kemasan yang keluar.");
    const merge = <T extends { qty: number }>(rows: T[], idOf: (r: T) => string) => {
      const m = new Map<string, T>();
      for (const r of rows) {
        const cur = m.get(idOf(r));
        m.set(idOf(r), cur ? { ...cur, qty: cur.qty + r.qty } : r);
      }
      return [...m.values()];
    };
    const args = {
      p_kind: kind.trim(),
      p_note: note.trim() || null,
      p_out_at: new Date(`${date}T12:00:00+07:00`).toISOString(),
      p_products: merge(pl.map((l) => ({ menu_item_id: l.id, qty: Number(l.qty) })), (r) => r.menu_item_id),
      p_supplies: merge(sl.map((l) => ({ ingredient_id: l.id, qty: Number(l.qty) })), (r) => r.ingredient_id),
    };
    setBusy(true);
    const { error } = editId
      ? await supabase.rpc("update_promo_out", { p_id: editId, ...args })
      : await supabase.rpc("record_promo_out", args);
    setBusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function|promo_out/i.test(error.message);
      return setErr(missing ? NEED_SQL : error.message);
    }
    const wasEdit = Boolean(editId);
    resetForm();
    await load();
    onDone({
      type: "ok",
      text: wasEdit
        ? "Perubahan disimpan. Stok sudah disesuaikan."
        : `Pengeluaran ${args.p_kind.toLowerCase()} tercatat, stok berkurang${isOwner ? `, nilai ${rupiah(totalCost)} masuk Biaya promosi` : ""}.`,
    });
  }

  async function remove(p: Promo) {
    if (!confirm(`Hapus catatan "${p.kind}${p.note ? `: ${p.note}` : ""}"?\n\nStok produk dan kemasan yang keluar akan dikembalikan.`)) return;
    const { error } = await supabase.from("promo_outs").delete().eq("id", p.id);
    if (error) return onDone({ type: "err", text: error.message });
    if (editId === p.id) resetForm();
    await load();
    onDone({ type: "ok", text: "Catatan dihapus, stok dikembalikan." });
  }

  const nameOf = (l: PromoLine) =>
    l.kind === "produk"
      ? productOptions.find((o) => o.id === l.ref_id)?.label ?? prod.find((r) => r.id === l.ref_id)?.name ?? "Menu"
      : ings.find((i) => i.id === l.ref_id)?.name ?? "Barang";
  const unitOf = (l: PromoLine) =>
    l.kind === "produk" ? prod.find((r) => r.id === l.ref_id)?.stock_unit ?? "pcs" : ings.find((i) => i.id === l.ref_id)?.unit ?? "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Untuk barang yang keluar tanpa penjualan: voucher hadiah, sampel, konsumsi sendiri, atau donasi. Stok berkurang,
        tetapi tidak masuk penjualan. Nilainya dihitung sebagai Biaya promosi di Laporan.
      </p>
      {historyErr && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{historyErr}</p>}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}

      {editId && (
        <Card className="border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-900">Sedang mengubah catatan yang sudah tersimpan.</p>
            <button className="shrink-0 text-sm font-medium text-amber-900 underline" onClick={resetForm}>Batal ubah</button>
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <Label>Jenis</Label>
          <input className={inputCls} value={kind} list="daftar-jenis-promo" onChange={(e) => setKind(e.target.value)} />
          <datalist id="daftar-jenis-promo">
            {KINDS.map((k) => <option key={k} value={k} />)}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1.5 text-sm ${kind === k ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Keterangan / nama penerima (opsional)</Label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: Giveaway IG Oktober, Bu Rina" />
        </div>
        <div>
          <Label>Tanggal</Label>
          <input type="date" className={inputCls} value={date} max={todayJkt()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Produk jadi yang keluar</h2>
        {productOptions.length === 0 && (
          <p className="text-xs text-amber-700">Belum ada produk dengan stok produksi. Catat produksi dulu di tab Produksi.</p>
        )}
        {products.map((l) => (
          <div key={l.key} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <select className={inputCls} value={l.id} onChange={(e) => setLine(products, setProducts, l.key, { id: e.target.value })}>
                  <option value="">Pilih produk…</option>
                  {productOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label} (stok {fmt(o.row.stock_on_hand)} {o.row.stock_unit})</option>
                  ))}
                </select>
              </div>
              <button type="button" className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700" onClick={() => setProducts(products.filter((x) => x.key !== l.key))} aria-label="Hapus baris">✕</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-stone-600">Jumlah keluar</span>
              <div className="min-w-0 flex-1">
                <input type="number" inputMode="decimal" className={`${inputCls} text-right font-semibold`} value={l.qty} onChange={(e) => setLine(products, setProducts, l.key, { qty: e.target.value })} placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className={`${btnGhostCls} w-full`} onClick={() => { setProducts([...products, { key: nextKey, id: "", qty: "" }]); setNextKey(nextKey + 1); }}>
          + Tambah produk
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Kemasan / bahan yang ikut keluar</h2>
        {supplies.map((l) => {
          const ing = ings.find((x) => x.id === l.id);
          return (
            <div key={l.key} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <select className={inputCls} value={l.id} onChange={(e) => setLine(supplies, setSupplies, l.key, { id: e.target.value })}>
                    <option value="">Pilih barang…</option>
                    {supplyOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} (stok {fmt(o.on_hand)} {o.unit})</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700" onClick={() => setSupplies(supplies.filter((x) => x.key !== l.key))} aria-label="Hapus baris">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-stone-600">Jumlah keluar{ing ? ` (${ing.unit})` : ""}</span>
                <div className="min-w-0 flex-1">
                  <input type="number" inputMode="decimal" className={`${inputCls} text-right font-semibold`} value={l.qty} onChange={(e) => setLine(supplies, setSupplies, l.key, { qty: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" className={`${btnGhostCls} w-full`} onClick={() => { setSupplies([...supplies, { key: nextKey, id: "", qty: "" }]); setNextKey(nextKey + 1); }}>
          + Tambah kemasan / bahan
        </button>
      </Card>

      {isOwner && (
        <Card className="flex items-baseline justify-between gap-3 bg-stone-50">
          <span className="text-sm text-stone-600">Nilai (HPP) yang masuk Biaya promosi</span>
          <span className="text-lg font-bold tabular-nums">{rupiah(totalCost)}</span>
        </Card>
      )}
      {over.length > 0 && (
        <p className="text-xs font-medium text-red-700">Melebihi stok: {[...new Set(over)].join(", ")}. Tetap bisa disimpan, tapi cek stoknya.</p>
      )}
      <button type="button" className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : editId ? "Simpan perubahan" : "Simpan pengeluaran"}
      </button>

      <Card>
        <h2 className="mb-2 font-semibold">Riwayat pengeluaran promosi</h2>
        {history.length === 0 ? (
          <Empty>Belum ada catatan.</Empty>
        ) : (
          <ScrollList className="divide-y divide-stone-100">
            {history.map((p) => (
              <div key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.kind}{p.note ? `: ${p.note}` : ""}</div>
                    <div className="text-xs text-stone-500">
                      {dateLabel(p.out_at)} ·{" "}
                      {lines.filter((l) => l.promo_id === p.id).map((l) => `${nameOf(l)} ${fmt(Number(l.qty))} ${unitOf(l)}`).join(", ")}
                    </div>
                  </div>
                  {isOwner && <div className="shrink-0 font-semibold tabular-nums">{rupiah(Number(p.total_cost))}</div>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className={`${btnGhostCls} h-9 px-2 text-sm`} onClick={() => startEdit(p)}>Ubah</button>
                  <button className={`${btnGhostCls} h-9 px-2 text-sm text-red-700`} onClick={() => remove(p)}>Hapus</button>
                </div>
              </div>
            ))}
          </ScrollList>
        )}
      </Card>
    </div>
  );
}
