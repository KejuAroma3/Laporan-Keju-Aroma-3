"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import type { StockRow } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, Tabs, btnCls, inputCls, type Msg } from "@/components/ui";

type Tab = "sisa" | "masuk" | "keluar" | "opname";
type Done = (m: Msg) => void;

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("sisa");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const { data, error } = await supabase.from("v_stock").select("*").order("name");
    if (error) setMsg({ type: "err", text: error.message });
    else setRows((data ?? []) as StockRow[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const done: Done = (m) => {
    setMsg(m);
    if (m?.type === "ok") load();
  };

  return (
    <div>
      <PageTitle>Stok</PageTitle>
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        tabs={[
          { id: "sisa", label: "Sisa" },
          { id: "masuk", label: "Masuk" },
          { id: "keluar", label: "Keluar" },
          { id: "opname", label: "Opname" },
        ]}
      />
      <Notice msg={msg} />
      {tab === "sisa" && <StockList rows={rows} />}
      {tab === "masuk" && <PurchaseForm rows={rows} onDone={done} />}
      {tab === "keluar" && <WasteForm rows={rows} onDone={done} />}
      {tab === "opname" && <OpnameForm rows={rows} onDone={done} />}
    </div>
  );
}

function StockList({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) return <Empty>Belum ada bahan. Tambahkan di Lainnya › Bahan baku.</Empty>;
  const value = rows.reduce((s, r) => s + Math.max(0, r.on_hand) * r.avg_cost, 0);
  const sorted = [...rows].sort((a, b) => Number(b.is_low) - Number(a.is_low) || a.name.localeCompare(b.name));
  return (
    <div>
      <Card className="mb-3">
        <div className="text-sm text-stone-500">Nilai persediaan saat ini</div>
        <div className="text-xl font-bold tabular-nums">{rupiah(value)}</div>
      </Card>
      <div className="space-y-2">
        {sorted.map((r) => (
          <Card key={r.id} className={r.is_low ? "border-red-300" : ""}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-sm text-stone-500">
                  {rupiah(r.avg_cost)} per {r.unit}, minimum {fmt(r.min_stock)} {r.unit}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold tabular-nums ${r.is_low ? "text-red-700" : ""}`}>
                  {fmt(r.on_hand)}
                </div>
                <div className="text-xs text-stone-500">{r.unit}</div>
              </div>
            </div>
            {r.is_low && <div className="mt-2 text-xs font-semibold text-red-700">Stok menipis, segera belanja.</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function IngredientSelect({ rows, value, onChange }: { rows: StockRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih bahan…</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name} ({r.unit})
        </option>
      ))}
    </select>
  );
}

function PurchaseForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = rows.find((r) => r.id === ing);
  const perUnit = Number(qty) > 0 ? Number(total) / Number(qty) : 0;

  async function save() {
    if (!ing || !(Number(qty) > 0) || !(Number(total) > 0)) {
      onDone({ type: "err", text: "Lengkapi bahan, jumlah, dan total harga." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("record_purchase", {
      p_ingredient: ing,
      p_qty: Number(qty),
      p_total: Number(total),
      p_note: note || null,
    });
    setBusy(false);
    if (error) {
      onDone({ type: "err", text: error.message });
      return;
    }
    setQty(""); setTotal(""); setNote("");
    onDone({ type: "ok", text: "Pembelian tercatat. Stok bertambah." });
  }

  return (
    <Card className="space-y-4">
      <div>
        <Label>Bahan</Label>
        <IngredientSelect rows={rows} value={ing} onChange={setIng} />
      </div>
      <div>
        <Label>Jumlah masuk{sel ? ` (${sel.unit})` : ""}</Label>
        <input type="number" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Contoh: 1 kg = 1000 gram" />
      </div>
      <div>
        <Label>Total harga beli (Rp)</Label>
        <input type="number" inputMode="numeric" className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} />
        {perUnit > 0 && sel && (
          <p className="mt-1 text-sm text-stone-500">
            Harga {rupiah(perUnit)} per {sel.unit}
          </p>
        )}
      </div>
      <div>
        <Label>Catatan (opsional)</Label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nama supplier, nomor nota" />
      </div>
      <button className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan pembelian"}
      </button>
    </Card>
  );
}

const REASONS = ["Rusak atau basi", "Tumpah atau salah buat", "Dipakai di luar resep", "Hilang atau tidak diketahui"];

function WasteForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = rows.find((r) => r.id === ing);

  async function save() {
    if (!sel || !(Number(qty) > 0)) {
      onDone({ type: "err", text: "Pilih bahan dan isi jumlah keluar." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("stock_movements").insert({
      ingredient_id: sel.id,
      type: "waste",
      qty: -Number(qty),
      unit_cost: sel.avg_cost,
      note: note ? `${reason}: ${note}` : reason,
    });
    setBusy(false);
    if (error) {
      onDone({ type: "err", text: error.message });
      return;
    }
    setQty(""); setNote("");
    onDone({ type: "ok", text: "Stok keluar tercatat sebagai waste." });
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-stone-500">
        Untuk bahan yang keluar di luar penjualan. Pemakaian dari penjualan otomatis terpotong sesuai resep.
      </p>
      <div>
        <Label>Bahan</Label>
        <IngredientSelect rows={rows} value={ing} onChange={setIng} />
      </div>
      <div>
        <Label>Jumlah keluar{sel ? ` (${sel.unit})` : ""}</Label>
        <input type="number" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div>
        <Label>Alasan</Label>
        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <Label>Catatan (opsional)</Label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan stok keluar"}
      </button>
    </Card>
  );
}

function OpnameForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const items = rows.flatMap((r) => {
      const v = counts[r.id];
      if (v === undefined || v === "" || Number.isNaN(Number(v))) return [];
      const diff = Number(v) - r.on_hand;
      if (Math.abs(diff) < 0.0001) return [];
      return [{ ingredient_id: r.id, type: "adjustment", qty: diff, unit_cost: r.avg_cost, note: "Opname stok" }];
    });
    if (items.length === 0) {
      onDone({ type: "ok", text: "Tidak ada selisih. Stok sistem sudah sesuai." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("stock_movements").insert(items);
    setBusy(false);
    if (error) {
      onDone({ type: "err", text: error.message });
      return;
    }
    setCounts({});
    onDone({ type: "ok", text: `Opname tersimpan. ${items.length} bahan disesuaikan.` });
  }

  if (rows.length === 0) return <Empty>Belum ada bahan.</Empty>;

  return (
    <div>
      <p className="mb-3 text-sm text-stone-500">
        Hitung stok fisik, isi hanya bahan yang dihitung. Selisih dengan stok sistem otomatis dicatat sebagai penyesuaian.
      </p>
      <div className="space-y-2">
        {rows.map((r) => {
          const v = counts[r.id];
          const diff = v === undefined || v === "" ? null : Number(v) - r.on_hand;
          return (
            <Card key={r.id}>
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-semibold">{r.name}</span>
                <span className="tabular-nums text-stone-500">
                  Sistem: {fmt(r.on_hand)} {r.unit}
                </span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                placeholder={`Stok fisik (${r.unit})`}
                value={v ?? ""}
                onChange={(e) => setCounts({ ...counts, [r.id]: e.target.value })}
              />
              {diff !== null && Math.abs(diff) >= 0.0001 && (
                <p className={`mt-1 text-sm font-medium ${diff < 0 ? "text-red-700" : "text-teal-800"}`}>
                  Selisih {diff > 0 ? "+" : ""}
                  {fmt(diff)} {r.unit} ({rupiah(diff * r.avg_cost)})
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <button className={`${btnCls} mt-4 w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan hasil opname"}
      </button>
    </div>
  );
}
