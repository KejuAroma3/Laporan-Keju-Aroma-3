"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, labelDay, rupiah, todayJkt } from "@/lib/format";
import { groupByCategory } from "@/lib/group";
import type { StockRow } from "@/lib/types";
import { Card, Empty, Label, ScrollList, SearchInput, btnCls, inputCls, type Msg } from "@/components/ui";
import PurchaseLog from "@/components/PurchaseLog";

type Done = (m: Msg) => void;

export function IngredientSelect({ rows, value, onChange }: { rows: StockRow[]; value: string; onChange: (v: string) => void }) {
  const grouped = groupByCategory(rows, (r) => r.category);
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih bahan…</option>
      {grouped.map(([cat, items]) => (
        <optgroup key={cat} label={cat}>
          {items.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.unit})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function PurchaseForm({ rows, onDone, scoped = false }: { rows: StockRow[]; onDone: Done; scoped?: boolean }) {
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayJkt());
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const sel = rows.find((r) => r.id === ing);
  const perUnit = Number(qty) > 0 ? Number(total) / Number(qty) : 0;
  const today = todayJkt();
  const backdated = date !== "" && date < today;

  async function save() {
    if (!ing || !(Number(qty) > 0) || !(Number(total) > 0)) {
      onDone({ type: "err", text: "Lengkapi bahan, jumlah, dan total harga." });
      return;
    }
    if (!date || date > today) {
      onDone({ type: "err", text: "Tanggal belanja tidak boleh kosong atau di masa depan." });
      return;
    }
    setBusy(true);
    // Tanggal hanya dikirim untuk pembelian yang sudah lewat. Untuk hari ini, biarkan
    // database memakai waktu saat ini, sehingga tetap jalan walau SQL tanggal belanja
    // (supabase/7-tanggal-belanja.sql) belum dijalankan.
    const { error } = await supabase.rpc("record_purchase", {
      p_ingredient: ing,
      p_qty: Number(qty),
      p_total: Number(total),
      p_note: note || null,
      ...(backdated ? { p_date: new Date(`${date}T12:00:00+07:00`).toISOString() } : {}),
    });
    setBusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
      onDone({
        type: "err",
        text:
          backdated && missing
            ? "Fitur tanggal belanja belum aktif. Jalankan supabase/7-tanggal-belanja.sql di Supabase (SQL Editor), lalu coba lagi."
            : error.message,
      });
      return;
    }
    setQty(""); setTotal(""); setNote("");
    onDone({
      type: "ok",
      text: backdated
        ? `Pembelian tercatat di tanggal ${labelDay(date)}. Stok bertambah.`
        : "Pembelian tercatat. Stok bertambah.",
    });
    setHistoryKey((k) => k + 1);
  }

  return (
    <>
    <Card className="space-y-4">
      <p className="text-sm text-stone-500">
        Salin saja angka dari nota belanja: jumlah barang dan total yang dibayar. Harga per satuan
        dihitung otomatis, tidak perlu membagi sendiri.
      </p>
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
          <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900">
            Harga pembelian ini: {rupiah(perUnit)} per {sel.unit}
          </div>
        )}
      </div>
      <div>
        <Label>Tanggal belanja</Label>
        <input type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        {backdated && (
          <p className="mt-1 text-xs font-medium text-amber-700">
            Pembelian ini akan dicatat di tanggal {labelDay(date)}, bukan hari ini.
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

      <PurchaseLog refreshKey={historyKey} onChanged={onDone} onlyIds={scoped ? new Set(rows.map((r) => r.id)) : undefined} />
    </>
  );
}

const REASONS = ["Rusak atau basi", "Tumpah atau salah buat", "Dipakai di luar resep", "Hilang atau tidak diketahui"];

export function WasteForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
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

export function OpnameForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [q, setQ] = useState("");
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
  const term = q.trim().toLowerCase();
  const filtered = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  const grouped = groupByCategory(filtered, (r) => r.category);
  const filledCount = Object.values(counts).filter((v) => v !== "").length;

  return (
    <div>
      <p className="mb-3 text-sm text-stone-500">
        Hitung stok fisik, isi hanya bahan yang dihitung. Selisih dengan stok sistem otomatis dicatat sebagai penyesuaian.
      </p>
      <SearchInput value={q} onChange={setQ} placeholder="Cari bahan…" />
      {filtered.length === 0 ? (
        <Empty>Tidak ada bahan yang cocok dengan pencarian.</Empty>
      ) : (
        <ScrollList className="space-y-4">
          {grouped.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-stone-500">{cat}</h2>
              <div className="space-y-2">
                {items.map((r) => {
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
                        <p className={`mt-1 text-sm font-medium ${diff < 0 ? "text-red-700" : "text-brand-800"}`}>
                          Selisih {diff > 0 ? "+" : ""}
                          {fmt(diff)} {r.unit} ({rupiah(diff * r.avg_cost)})
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </ScrollList>
      )}
      <button className={`${btnCls} mt-4 w-full`} onClick={save} disabled={busy || filledCount === 0}>
        {busy ? "Menyimpan…" : `Simpan hasil opname${filledCount > 0 ? ` (${filledCount} bahan)` : ""}`}
      </button>
    </div>
  );
}


const USAGE_REASONS = ["Dipakai operasional", "Rusak", "Hilang atau tidak diketahui"];

// Catat pemakaian banyak barang sekaligus (mis. kemasan dan perlengkapan di akhir hari): isi jumlah
// yang terpakai di tiap barang, lalu simpan sekali. Disimpan sebagai stok keluar.
export function UsageBatchForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [q, setQ] = useState("");
  const [used, setUsed] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(USAGE_REASONS[0]);
  const [busy, setBusy] = useState(false);

  const entries = rows.flatMap((r) => {
    const v = Number(used[r.id]);
    return v > 0 ? [{ row: r, qty: v }] : [];
  });

  async function save() {
    if (entries.length === 0) {
      onDone({ type: "err", text: "Isi jumlah terpakai minimal pada satu barang." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("stock_movements").insert(
      entries.map(({ row, qty }) => ({
        ingredient_id: row.id,
        type: "waste",
        qty: -qty,
        unit_cost: row.avg_cost,
        note: reason,
      }))
    );
    setBusy(false);
    if (error) {
      onDone({ type: "err", text: error.message });
      return;
    }
    setUsed({});
    onDone({ type: "ok", text: `Pemakaian tercatat untuk ${entries.length} barang. Stok berkurang.` });
  }

  if (rows.length === 0) return <Empty>Belum ada barang kemasan atau perlengkapan.</Empty>;
  const term = q.trim().toLowerCase();
  const filtered = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  const grouped = groupByCategory(filtered, (r) => r.category);

  return (
    <div>
      <p className="mb-3 text-sm text-stone-500">
        Untuk barang yang terpakai di luar resep, misalnya handgloves atau kabel ties. Isi jumlah yang terpakai,
        kosongkan yang tidak dipakai, lalu simpan sekali.
      </p>
      <div className="mb-3">
        <Label>Alasan</Label>
        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          {USAGE_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Cari barang…" />
      {filtered.length === 0 ? (
        <Empty>Tidak ada barang yang cocok.</Empty>
      ) : (
        <ScrollList className="space-y-4">
          {grouped.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-stone-500">{cat}</h2>
              <div className="space-y-2">
                {items.map((r) => {
                  const v = Number(used[r.id]);
                  const over = v > r.on_hand;
                  return (
                    <Card key={r.id}>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{r.name}</div>
                          <div className="text-sm text-stone-500 tabular-nums">Sisa {fmt(r.on_hand)} {r.unit}</div>
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          className={`${inputCls} w-28 shrink-0`}
                          placeholder={r.unit}
                          value={used[r.id] ?? ""}
                          onChange={(e) => setUsed({ ...used, [r.id]: e.target.value })}
                        />
                      </div>
                      {over && <p className="mt-1 text-xs font-medium text-red-700">Lebih banyak dari sisa stok.</p>}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </ScrollList>
      )}
      <button className={`${btnCls} mt-4 w-full`} onClick={save} disabled={busy || entries.length === 0}>
        {busy ? "Menyimpan…" : `Simpan pemakaian${entries.length > 0 ? ` (${entries.length} barang)` : ""}`}
      </button>
    </div>
  );
}
