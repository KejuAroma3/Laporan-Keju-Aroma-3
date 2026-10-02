"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import { loadRole } from "@/lib/authClient";
import type { ProductStockRow } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, Tabs, btnCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";

type Tab = "stok" | "produksi" | "sesuaikan";
type Done = (m: Msg) => void;

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>("stok");
  const [rows, setRows] = useState<ProductStockRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    loadRole().then((r) => setIsOwner(r.status === "ready" && r.role === "owner"));
  }, []);

  async function load() {
    const { data, error } = await supabase.from("v_product_stock").select("*").order("name");
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

  const tracked = rows.filter((r) => r.track_stock);

  return (
    <div>
      <PageTitle sub="Untuk menu yang diproduksi dalam batch (digoreng/dikemas duluan), bukan dibuat saat dipesan.">
        Produksi
      </PageTitle>
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        tabs={[
          { id: "stok", label: "Stok produk" },
          { id: "produksi", label: "Produksi" },
          { id: "sesuaikan", label: "Sesuaikan" },
        ]}
      />
      <Notice msg={msg} />
      {tab === "stok" && <StockList rows={rows} showValue={isOwner} />}
      {tab === "produksi" && <ProduceForm rows={rows} onDone={done} />}
      {tab === "sesuaikan" && <AdjustForm rows={tracked} onDone={done} />}
    </div>
  );
}

function StockList({ rows, showValue }: { rows: ProductStockRow[]; showValue: boolean }) {
  const [q, setQ] = useState("");
  if (rows.length === 0) return <Empty>Belum ada menu. Tambahkan dulu di Menu dan resep.</Empty>;

  const term = q.trim().toLowerCase();
  const filtered = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  const value = rows.reduce((s, r) => s + Math.max(0, r.stock_on_hand) * r.avg_product_cost, 0);

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
        <Empty>Tidak ada menu yang cocok dengan pencarian.</Empty>
      ) : (
        <ScrollList className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className={r.is_low ? "border-red-300" : ""}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.name}</div>
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
            </Card>
          ))}
        </ScrollList>
      )}
    </div>
  );
}

function MenuSelect({ rows, value, onChange }: { rows: ProductStockRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih menu…</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
}

function ProduceForm({ rows, onDone }: { rows: ProductStockRow[]; onDone: Done }) {
  const [menu, setMenu] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = rows.find((r) => r.id === menu);

  async function save() {
    if (!menu || !(Number(qty) > 0)) {
      onDone({ type: "err", text: "Pilih menu dan isi jumlah yang diproduksi." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("record_production", {
      p_menu: menu,
      p_qty: Number(qty),
      p_note: note || null,
    });
    setBusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
      onDone({
        type: "err",
        text: missing
          ? "Fitur stok produk belum diaktifkan. Jalankan supabase/9-stok-produk.sql di Supabase (SQL Editor)."
          : error.message,
      });
      return;
    }
    setQty(""); setNote("");
    onDone({ type: "ok", text: `Produksi tercatat. Stok "${sel?.name ?? ""}" bertambah, bahan sesuai resep otomatis terpotong.` });
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-stone-500">
        Bahan dipotong otomatis sesuai resep dikali jumlah produksi. Isi resep menu ini dulu di Menu dan
        resep kalau belum ada.
      </p>
      <div>
        <Label>Menu</Label>
        <MenuSelect rows={rows} value={menu} onChange={setMenu} />
      </div>
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

function AdjustForm({ rows, onDone }: { rows: ProductStockRow[]; onDone: Done }) {
  const [menu, setMenu] = useState("");
  const [mode, setMode] = useState<"waste" | "opname">("waste");
  const [qty, setQty] = useState("");
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
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
          <MenuSelect rows={rows} value={menu} onChange={setMenu} />
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
