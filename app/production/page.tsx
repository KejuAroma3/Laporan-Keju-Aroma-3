"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import { loadRole } from "@/lib/authClient";
import { buildProductionEntries, moveKey, visibleEntries, type ProductionEntry } from "@/lib/production";
import type { ProductGroup, ProductStockRow } from "@/lib/types";
import StockSwitch from "@/components/StockSwitch";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, Tabs, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

type Tab = "stok" | "produksi" | "sesuaikan" | "atur";
type Done = (m: Msg) => void;

const NEED_SQL14 =
  "Fitur ini belum aktif. Jalankan supabase/14-urutan-produksi.sql di Supabase (SQL Editor), lalu muat ulang halaman ini.";
const isMissingSql14 = (e: { code?: string; message: string }) =>
  e.code === "42703" || e.code === "PGRST202" || e.code === "PGRST204" ||
  /does not exist|could not find|schema cache/i.test(e.message);

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>("stok");
  const [rows, setRows] = useState<ProductStockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    loadRole().then((r) => setIsOwner(r.status === "ready" && r.role === "owner"));
  }, []);

  async function load() {
    const [res, g] = await Promise.all([
      supabase.from("v_product_stock").select("*").order("name"),
      supabase.from("product_groups").select("*"), // boleh gagal jika supabase/13-varian-produk.sql belum dijalankan
    ]);
    const { data, error } = res;
    setGroups((g.data ?? []) as ProductGroup[]);
    if (error) {
      const missing = error.code === "42P01" || /does not exist/i.test(error.message);
      setMsg({
        type: "err",
        text: missing
          ? "Fitur stok produk belum diaktifkan. Jalankan supabase/9-stok-produk.sql di Supabase (SQL Editor), lalu muat ulang halaman ini."
          : error.message,
      });
      return;
    }
    setRows((data ?? []) as ProductStockRow[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const done: Done = (m) => {
    setMsg(m);
    if (m?.type === "ok") load();
  };

  const entries = useMemo(() => buildProductionEntries(rows, groups), [rows, groups]);
  const shown = useMemo(() => visibleEntries(entries), [entries]);
  const sql14Ready = rows.length === 0 || rows[0].production_order !== undefined;

  return (
    <div>
      <PageTitle sub="Untuk menu yang diproduksi dalam batch (digoreng/dikemas duluan), bukan dibuat saat dipesan.">
        Stok
      </PageTitle>
      <StockSwitch />
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        tabs={[
          { id: "stok", label: "Stok produk" },
          { id: "produksi", label: "Produksi" },
          { id: "sesuaikan", label: "Sesuaikan" },
          ...(isOwner ? [{ id: "atur" as const, label: "Atur list" }] : []),
        ]}
      />
      <Notice msg={msg} />
      {tab === "stok" && <StockList entries={shown} totalMenus={rows.length} hiddenCount={entries.length - shown.length} showValue={isOwner} />}
      {tab === "produksi" && <ProduceForm rows={rows} entries={shown} onDone={done} />}
      {tab === "sesuaikan" && <AdjustForm entries={shown} onDone={done} />}
      {tab === "atur" && isOwner && <ArrangeList entries={entries} ready={sql14Ready} onDone={done} />}
    </div>
  );
}

function StockList({
  entries,
  totalMenus,
  hiddenCount,
  showValue,
}: {
  entries: ProductionEntry[];
  totalMenus: number;
  hiddenCount: number;
  showValue: boolean;
}) {
  const [q, setQ] = useState("");
  if (totalMenus === 0) return <Empty>Belum ada menu. Tambahkan dulu di Lainnya › Menu.</Empty>;

  const term = q.trim().toLowerCase();
  const filtered = term
    ? entries.filter(
        (e) =>
          e.label.toLowerCase().includes(term) ||
          e.variants.some((v) => (v.variant_name ?? "").toLowerCase().includes(term)) ||
          e.rows.some((r) => r.name.toLowerCase().includes(term) || (r.variant_name ?? "").toLowerCase().includes(term))
      )
    : entries;
  // Nilai stok dihitung dari menu yang memegang stok (varian yang disatukan tidak dihitung dobel).
  const value = entries.reduce(
    (s, e) => s + e.rows.reduce((t, r) => t + Math.max(0, r.stock_on_hand) * r.avg_product_cost, 0),
    0
  );

  return (
    <div>
      {showValue && (
        <Card className="mb-3">
          <div className="text-sm text-stone-500">Nilai stok produk jadi saat ini</div>
          <div className="text-xl font-bold tabular-nums">{rupiah(value)}</div>
        </Card>
      )}
      <SearchInput value={q} onChange={setQ} placeholder="Cari menu…" />
      {filtered.length === 0 ? (
        <Empty>{entries.length === 0 ? "Semua menu disembunyikan dari list produksi. Atur di tab Atur list." : "Tidak ada menu yang cocok dengan pencarian."}</Empty>
      ) : (
        <ScrollList className="space-y-2">
          {filtered.map((e) => {
            if (e.kind === "single") {
              const r = e.rows[0];
              return (
                <Card key={e.key} className={r.is_low ? "border-red-300" : ""}>
                  <StockRowContent r={r} label={r.name} showValue={showValue} />
                </Card>
              );
            }
            if (e.kind === "shared") {
              const r = e.rows[0];
              const names = e.variants.map((v) => v.variant_name || v.name).join(", ");
              return (
                <Card key={e.key} className={r.is_low ? "border-red-300" : ""}>
                  <StockRowContent r={r} label={e.label} showValue={showValue} note={`Semua varian: ${names}`} />
                </Card>
              );
            }
            const trackedItems = e.rows.filter((r) => r.track_stock);
            const totalStock = trackedItems.reduce((s, r) => s + r.stock_on_hand, 0);
            const unit = trackedItems[0]?.stock_unit ?? "";
            const anyLow = e.rows.some((r) => r.is_low);
            return (
              <Card key={e.key} className={anyLow ? "border-red-300" : ""}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="truncate font-semibold">{e.label}</h3>
                  {trackedItems.length > 0 && (
                    <span className="shrink-0 text-sm tabular-nums text-stone-500">
                      Total {fmt(totalStock)} {unit}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-stone-100">
                  {e.rows.map((r) => (
                    <div key={r.id} className="py-2 first:pt-0 last:pb-0">
                      <StockRowContent r={r} label={r.variant_name || r.name} showValue={showValue} />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </ScrollList>
      )}
      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-stone-500">{hiddenCount} menu disembunyikan dari list ini (tab Atur list).</p>
      )}
    </div>
  );
}

function StockRowContent({ r, label, showValue, note }: { r: ProductStockRow; label: string; showValue: boolean; note?: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{label}</div>
          {note && <div className="truncate text-xs text-stone-400">{note}</div>}
          {r.track_stock ? (
            <div className="text-sm text-stone-500">
              {showValue && `HPP ${rupiah(r.avg_product_cost)} per ${r.stock_unit}`}
              {showValue && r.min_product_stock > 0 ? `, minimum ${fmt(r.min_product_stock)}` : ""}
              {!showValue && r.min_product_stock > 0 ? `Minimum ${fmt(r.min_product_stock)} ${r.stock_unit}` : ""}
            </div>
          ) : (
            <div className="text-sm text-stone-400">Belum pernah diproduksi</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold tabular-nums ${r.is_low ? "text-red-700" : r.track_stock ? "" : "text-stone-300"}`}>
            {r.track_stock ? fmt(r.stock_on_hand) : "–"}
          </div>
          {r.track_stock && <div className="text-xs text-stone-500">{r.stock_unit}</div>}
        </div>
      </div>
      {r.is_low && <div className="mt-2 text-xs font-semibold text-red-700">Stok menipis, segera produksi lagi.</div>}
    </>
  );
}

// Pilihan menu berdasarkan list produksi: produk dasar yang disatukan hanya muncul sekali.
function MenuSelect({ entries, value, onChange }: { entries: ProductionEntry[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih menu…</option>
      {entries.map((e) =>
        e.kind === "group" ? (
          <optgroup key={e.key} label={e.label}>
            {e.rows.map((r) => (
              <option key={r.id} value={r.id}>{r.variant_name || r.name}</option>
            ))}
          </optgroup>
        ) : (
          <option key={e.key} value={e.rows[0].id}>{e.label}</option>
        )
      )}
    </select>
  );
}

function ProduceForm({ rows, entries, onDone }: { rows: ProductStockRow[]; entries: ProductionEntry[]; onDone: Done }) {
  const [menu, setMenu] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRecipe, setHasRecipe] = useState<boolean | null>(null); // resep produksi (bukan bahan per penjualan) menu terpilih
  const [unitCost, setUnitCost] = useState("");
  const sel = rows.find((r) => r.id === menu);
  const selEntry = entries.find((e) => e.rows.some((r) => r.id === menu));

  useEffect(() => {
    setHasRecipe(null);
    setUnitCost("");
    if (!menu) return;
    let live = true;
    supabase
      .from("recipe_items")
      .select("ingredient_id", { count: "exact", head: true })
      .eq("menu_item_id", menu)
      .eq("per_sale", false)
      .then(({ count, error }) => {
        if (live && !error) setHasRecipe((count ?? 0) > 0);
      });
    return () => { live = false; };
  }, [menu]);
  const selLabel = selEntry && selEntry.kind !== "group" ? selEntry.label : sel?.name ?? "";

  async function save() {
    if (!menu || !(Number(qty) > 0)) {
      onDone({ type: "err", text: "Pilih menu dan isi jumlah yang diproduksi." });
      return;
    }
    if (hasRecipe === false && !(Number(unitCost) >= 0 && unitCost !== "")) {
      onDone({ type: "err", text: "Menu ini belum punya resep produksi. Isi HPP per pcs di bawah, atau isi resepnya di Lainnya › Resep." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("record_production", {
      p_menu: menu,
      p_qty: Number(qty),
      p_note: note || null,
      ...(hasRecipe === false ? { p_unit_cost: Number(unitCost) } : {}),
    });
    setBusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
      onDone({
        type: "err",
        text: missing
          ? "Fitur stok produk belum diaktifkan. Jalankan supabase/9-stok-produk.sql di Supabase (SQL Editor)."
          : /p_unit_cost/.test(error.message)
            ? "Produksi tanpa resep belum aktif. Jalankan supabase/20-produksi-tanpa-resep.sql di Supabase (SQL Editor), lalu coba lagi."
            : error.message,
      });
      return;
    }
    setQty(""); setNote(""); setUnitCost("");
    onDone({
      type: "ok",
      text:
        hasRecipe === false
          ? `Produksi tercatat. Stok "${selLabel}" bertambah dengan HPP ${rupiah(Number(unitCost))} per ${sel?.stock_unit ?? "pcs"} (tanpa resep, tidak ada bahan terpotong).`
          : `Produksi tercatat. Stok "${selLabel}" bertambah, bahan sesuai resep otomatis terpotong.`,
    });
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-stone-500">
        Bahan dipotong otomatis sesuai resep dikali jumlah produksi. Isi resep menu ini dulu di
        Lainnya › Resep kalau belum ada.
      </p>
      <div>
        <Label>Menu</Label>
        <MenuSelect entries={entries} value={menu} onChange={setMenu} />
        {selEntry?.kind === "shared" && (
          <p className="mt-1 text-xs text-stone-500">
            Semua varian memakai satu stok. Bahan dipotong sesuai resep &quot;{sel?.variant_name || sel?.name}&quot;.
          </p>
        )}
      </div>
      {menu && hasRecipe === false && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-900">Menu ini belum punya resep produksi</div>
          <p className="text-xs text-amber-900">
            Tidak ada bahan yang terpotong otomatis. Isi HPP per {sel?.stock_unit ?? "pcs"} secara manual
            (mis. harga beli dimsum jadi), atau isi resepnya dulu di Lainnya › Resep.
          </p>
          <Label>HPP per {sel?.stock_unit ?? "pcs"} (Rp)</Label>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder={sel?.track_stock ? `Sekarang ${Math.round(sel.avg_product_cost)}` : "Contoh: 2100"}
          />
        </div>
      )}
      <div>
        <Label>Jumlah diproduksi ({sel ? sel.stock_unit : "satuan"})</Label>
        <input type="number" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Contoh: 20" />
      </div>
      <div>
        <Label>Catatan (opsional)</Label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: batch pagi" />
      </div>
      <button className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan produksi"}
      </button>
    </Card>
  );
}

const REASONS = ["Rusak atau kedaluwarsa", "Remuk saat kemas/angkut", "Hilang atau tidak diketahui"];

function AdjustForm({ entries: allEntries, onDone }: { entries: ProductionEntry[]; onDone: Done }) {
  const [menu, setMenu] = useState("");
  const [mode, setMode] = useState<"waste" | "opname">("waste");
  const [qty, setQty] = useState("");
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Hanya menu yang pernah diproduksi (atau pemegang stok gabungan yang sudah punya stok)
  const entries = allEntries
    .map((e) => ({ ...e, rows: e.rows.filter((r) => r.track_stock) }))
    .filter((e) => e.rows.length > 0);
  const rows = entries.flatMap((e) => e.rows);
  const sel = rows.find((r) => r.id === menu);
  const diff = sel && physical !== "" ? Number(physical) - sel.stock_on_hand : null;

  async function saveWaste() {
    if (!sel || !(Number(qty) > 0)) {
      onDone({ type: "err", text: "Pilih menu dan isi jumlah yang rusak/hilang." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("product_movements").insert({
      menu_item_id: sel.id,
      type: "waste",
      qty: -Number(qty),
      unit_cost: sel.avg_product_cost,
      note: note ? `${reason}: ${note}` : reason,
    });
    setBusy(false);
    if (error) { onDone({ type: "err", text: error.message }); return; }
    setQty(""); setNote("");
    onDone({ type: "ok", text: "Produk yang rusak/hilang sudah dicatat, stok berkurang." });
  }

  async function saveOpname() {
    if (!sel || physical === "" || diff === null || Math.abs(diff) < 0.0001) {
      onDone({ type: "err", text: "Pilih menu dan isi jumlah stok fisik yang berbeda dari sistem." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("product_movements").insert({
      menu_item_id: sel.id,
      type: "adjustment",
      qty: diff,
      unit_cost: sel.avg_product_cost,
      note: "Opname stok produk",
    });
    setBusy(false);
    if (error) { onDone({ type: "err", text: error.message }); return; }
    setPhysical("");
    onDone({ type: "ok", text: "Stok produk disesuaikan sesuai hasil hitung fisik." });
  }

  if (rows.length === 0) {
    return <Empty>Belum ada menu yang pernah diproduksi. Catat produksi dulu lewat tab Produksi.</Empty>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["waste", "opname"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`h-11 rounded-xl border text-sm font-semibold ${
              mode === m ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            {m === "waste" ? "Rusak / hilang" : "Opname (hitung fisik)"}
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div>
          <Label>Menu</Label>
          <MenuSelect entries={entries} value={menu} onChange={setMenu} />
          {sel && <p className="mt-1 text-sm text-stone-500">Stok sistem sekarang: {fmt(sel.stock_on_hand)} {sel.stock_unit}</p>}
        </div>

        {mode === "waste" ? (
          <>
            <div>
              <Label>Jumlah rusak/hilang ({sel ? sel.stock_unit : "satuan"})</Label>
              <input type="number" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label>Alasan</Label>
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label>Catatan (opsional)</Label>
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className={`${btnCls} w-full`} onClick={saveWaste} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </>
        ) : (
          <>
            <div>
              <Label>Jumlah stok fisik sebenarnya ({sel ? sel.stock_unit : "satuan"})</Label>
              <input type="number" inputMode="decimal" className={inputCls} value={physical} onChange={(e) => setPhysical(e.target.value)} />
              {diff !== null && Math.abs(diff) >= 0.0001 && (
                <p className={`mt-1 text-sm font-medium ${diff < 0 ? "text-red-700" : "text-brand-800"}`}>
                  Selisih {diff > 0 ? "+" : ""}{fmt(diff)} {sel?.stock_unit}
                </p>
              )}
            </div>
            <button className={`${btnCls} w-full`} onClick={saveOpname} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan hasil opname"}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Atur list produksi (khusus pemilik) ----------
function ArrangeList({ entries, ready, onDone }: { entries: ProductionEntry[]; ready: boolean; onDone: Done }) {
  const [busy, setBusy] = useState(false);
  const [holderPick, setHolderPick] = useState<Record<string, string>>({});

  if (entries.length === 0) return <Empty>Belum ada menu. Tambahkan dulu di Lainnya › Menu.</Empty>;

  const fail = (e: { code?: string; message: string }) =>
    onDone({ type: "err", text: isMissingSql14(e) ? NEED_SQL14 : e.message });

  // Menyimpan urutan baru: hanya baris yang nomor urutnya berubah yang ditulis.
  async function saveOrder(keys: string[]) {
    setBusy(true);
    const writes = keys.flatMap((k, i) => {
      const e = entries.find((x) => x.key === k)!;
      if (e.order === i + 1) return [];
      const table = e.groupId ? "product_groups" : "menu_items";
      const id = e.groupId ?? e.rows[0].id;
      return [supabase.from(table).update({ production_order: i + 1 }).eq("id", id)];
    });
    const results = await Promise.all(writes);
    setBusy(false);
    const err = results.find((r) => r.error)?.error;
    if (err) return fail(err);
    onDone({ type: "ok", text: "Urutan list produksi disimpan." });
  }

  async function setHidden(e: ProductionEntry, hidden: boolean) {
    setBusy(true);
    const table = e.groupId ? "product_groups" : "menu_items";
    const id = e.groupId ?? e.rows[0].id;
    const { error } = await supabase.from(table).update({ hide_in_production: hidden }).eq("id", id);
    setBusy(false);
    if (error) return fail(error);
    onDone({ type: "ok", text: hidden ? `"${e.label}" disembunyikan dari list produksi.` : `"${e.label}" tampil di list produksi.` });
  }

  async function merge(e: ProductionEntry) {
    const holder = holderPick[e.key] ?? e.variants[0]?.id;
    const holderRow = e.variants.find((v) => v.id === holder);
    if (!holderRow) return onDone({ type: "err", text: "Pilih varian yang resepnya dipakai untuk produksi." });
    const movers = e.variants.filter((v) => v.id !== holder && v.track_stock && v.stock_on_hand !== 0);
    const warn = movers.length
      ? `\n\nStok varian lain (${movers.map((v) => `${v.variant_name || v.name}: ${fmt(v.stock_on_hand)}`).join(", ")}) akan dipindahkan ke stok gabungan.`
      : "";
    if (
      !confirm(
        `Satukan semua varian "${e.label}" jadi satu stok?\n\nProduksi dicatat sekali untuk "${e.label}" memakai resep "${holderRow.variant_name || holderRow.name}", dan penjualan varian apa pun mengurangi stok yang sama.${warn}`
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc("merge_group_stock", { p_group: e.groupId, p_holder: holder });
    setBusy(false);
    if (error) return fail(error);
    onDone({ type: "ok", text: `Varian "${e.label}" disatukan jadi satu stok.` });
  }

  async function split(e: ProductionEntry) {
    if (
      !confirm(
        `Pisahkan lagi varian "${e.label}"?\n\nStok yang ada tetap tersimpan di "${e.rows[0].variant_name || e.rows[0].name}". Varian lain mulai dari nol dan dianggap belum diproduksi.`
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.from("product_groups").update({ shared_stock: false }).eq("id", e.groupId!);
    setBusy(false);
    if (error) return fail(error);
    onDone({ type: "ok", text: `Varian "${e.label}" dipisah lagi.` });
  }

  // Memasukkan satu menu ke produk dasar lain supaya bisa disatukan stoknya. Menu yang dipindah:
  // menu tunggal, atau satu-satunya varian dalam produk dasarnya.
  const moverOf = (e: ProductionEntry) => (e.kind === "single" ? e.rows[0] : e.variants.length === 1 ? e.variants[0] : null);

  async function joinTo(e: ProductionEntry, targetKey: string) {
    const mover = moverOf(e);
    const target = entries.find((x) => x.key === targetKey);
    if (!mover || !target) return;
    const variant = prompt(`Nama varian untuk "${mover.name}" di dalam "${target.label}":`, mover.variant_name || mover.name)?.trim();
    if (!variant) return;
    setBusy(true);
    let groupId = target.groupId;
    if (!groupId) {
      // target menu tunggal: buat produk dasar baru dari namanya, lalu masukkan menu itu juga
      // (nama produk dasar harus unik: kalau sudah ada, mis. sisa yang kosong, pakai yang itu)
      const found = await supabase.from("product_groups").select("id").ilike("name", target.label).maybeSingle();
      if (found.data?.id) {
        groupId = found.data.id as string;
      } else {
        const created = await supabase.from("product_groups").insert({ name: target.label }).select("id").single();
        if (created.error || !created.data) {
          setBusy(false);
          return fail(created.error ?? { message: "Gagal membuat produk dasar." });
        }
        groupId = created.data.id as string;
      }
      const t = target.rows[0];
      const up = await supabase
        .from("menu_items")
        .update({ product_group_id: groupId, variant_name: t.variant_name || t.name })
        .eq("id", t.id);
      if (up.error) {
        setBusy(false);
        return fail(up.error);
      }
    }
    const { error } = await supabase
      .from("menu_items")
      .update({ product_group_id: groupId, variant_name: variant })
      .eq("id", mover.id);
    setBusy(false);
    if (error) return fail(error);
    onDone({
      type: "ok",
      text: `"${mover.name}" dimasukkan ke "${target.label}". Sekarang buka barisnya di sini dan tekan "Satukan varian jadi satu stok".`,
    });
  }

  const keys = entries.map((e) => e.key);

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Atur urutan list produksi dengan tombol panah (urutan ini dipakai di tab Stok produk dan pilihan menu
        di tab Produksi). Menu yang tidak diproduksi dalam batch bisa disembunyikan. Produk dasar yang bahannya
        sama dan hanya beda varian atau topping bisa disatukan jadi satu baris dan satu stok.
      </p>
      {!ready && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{NEED_SQL14}</p>}
      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li key={e.key}>
            <Card className={e.hidden ? "opacity-60" : ""}>
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    className="h-8 w-9 rounded-md border border-stone-200 text-sm disabled:opacity-30"
                    onClick={() => saveOrder(moveKey(keys, e.key, -1))}
                    disabled={busy || i === 0}
                    aria-label={`Naikkan ${e.label}`}
                  >▲</button>
                  <button
                    className="mt-1 h-8 w-9 rounded-md border border-stone-200 text-sm disabled:opacity-30"
                    onClick={() => saveOrder(moveKey(keys, e.key, 1))}
                    disabled={busy || i === entries.length - 1}
                    aria-label={`Turunkan ${e.label}`}
                  >▼</button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{i + 1}. {e.label}</div>
                  <div className="truncate text-xs text-stone-500">
                    {e.kind === "single" && "Menu tunggal"}
                    {e.kind === "group" && `${e.variants.length} varian, stok masing-masing`}
                    {e.kind === "shared" && `${e.variants.length} varian, satu stok (resep: ${e.rows[0].variant_name || e.rows[0].name})`}
                  </div>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={!e.hidden}
                    disabled={busy}
                    onChange={(ev) => setHidden(e, !ev.target.checked)}
                  />
                  Tampil
                </label>
              </div>

              {e.kind === "group" && e.variants.length > 1 && (
                <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3">
                  <div className="text-sm font-medium">Bahan dasarnya sama, hanya beda varian/topping?</div>
                  <Label>Resep varian yang dipakai untuk produksi</Label>
                  <select
                    className={inputCls}
                    value={holderPick[e.key] ?? e.variants[0].id}
                    onChange={(ev) => setHolderPick((p) => ({ ...p, [e.key]: ev.target.value }))}
                  >
                    {e.variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.variant_name || v.name}</option>
                    ))}
                  </select>
                  <button className={`${btnCls} w-full`} onClick={() => merge(e)} disabled={busy}>
                    Satukan varian jadi satu stok
                  </button>
                </div>
              )}
              {moverOf(e) && entries.length > 1 && (
                <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3">
                  <div className="text-sm font-medium">Sebenarnya varian dari produk lain?</div>
                  <select
                    className={inputCls}
                    value=""
                    disabled={busy}
                    onChange={(ev) => ev.target.value && joinTo(e, ev.target.value)}
                  >
                    <option value="">Masukkan ke produk dasar…</option>
                    {entries.filter((x) => x.key !== e.key).map((x) => (
                      <option key={x.key} value={x.key}>{x.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-stone-500">Setelah masuk, varian bisa disatukan stoknya.</p>
                </div>
              )}
              {e.kind === "shared" && (
                <button className={`${btnGhostCls} mt-3 w-full`} onClick={() => split(e)} disabled={busy}>
                  Pisahkan varian lagi
                </button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
