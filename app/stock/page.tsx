"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, labelDay, rupiah, todayJkt } from "@/lib/format";
import { groupByCategory } from "@/lib/group";
import type { StockRow, Unit } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, Tabs, btnCls, btnDangerCls, inputCls, type Msg } from "@/components/ui";
import IngredientEditor from "@/components/IngredientEditor";
import OwnerOnly from "@/components/OwnerOnly";
import { loadRole, type RoleState } from "@/lib/authClient";

type Tab = "sisa" | "masuk" | "keluar" | "opname" | "reset";
type Done = (m: Msg) => void;

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("sisa");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [role, setRole] = useState<RoleState>({ status: "loading" });

  async function load() {
    const [i, u] = await Promise.all([
      supabase.from("v_stock").select("*").order("name"),
      supabase.from("units").select("*").order("name"),
    ]);
    const err = [i, u].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });
    setRows((i.data ?? []) as StockRow[]);
    setUnits((u.data ?? []) as Unit[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); loadRole().then(setRole); }, []);

  const done: Done = (m) => {
    setMsg(m);
    if (m?.type === "ok") load();
  };

  return (
    <div>
      <PageTitle>Stok bahan</PageTitle>
      <OwnerOnly feature="stok bahan">
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        tabs={[
          { id: "sisa", label: "Sisa" },
          { id: "masuk", label: "Masuk" },
          { id: "keluar", label: "Keluar" },
          { id: "opname", label: "Opname" },
          { id: "reset", label: "Reset" },
        ]}
      />
      <Notice msg={msg} />
      {tab === "sisa" && <StockList rows={rows} units={units} onDone={done} />}
      {tab === "masuk" && <PurchaseForm rows={rows} onDone={done} />}
      {tab === "keluar" && <WasteForm rows={rows} onDone={done} />}
      {tab === "opname" && <OpnameForm rows={rows} onDone={done} />}
      {tab === "reset" && (
        <ResetForm rows={rows} blocked={role.status === "ready" && role.role === "staff"} onDone={done} />
      )}
      </OwnerOnly>
    </div>
  );
}

function StockList({ rows, units, onDone }: { rows: StockRow[]; units: Unit[]; onDone: Done }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) return <Empty>Belum ada bahan. Tambahkan di Lainnya › Bahan baku.</Empty>;
  const value = rows.reduce((s, r) => s + Math.max(0, r.on_hand) * r.avg_cost, 0);
  const term = q.trim().toLowerCase();
  const searched = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  const grouped = groupByCategory(searched, (r) => r.category).map(
    ([cat, items]) =>
      [cat, [...items].sort((a, b) => Number(b.is_low) - Number(a.is_low) || a.name.localeCompare(b.name))] as const
  );
  const filtered = searched;

  return (
    <div>
      <Card className="mb-3">
        <div className="text-sm text-stone-500">Nilai persediaan saat ini</div>
        <div className="text-xl font-bold tabular-nums">{rupiah(value)}</div>
      </Card>
      <SearchInput value={q} onChange={setQ} placeholder="Cari bahan…" />
      {filtered.length === 0 ? (
        <Empty>Tidak ada bahan yang cocok dengan pencarian.</Empty>
      ) : (
        <ScrollList className="space-y-4">
          {grouped.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-stone-500">{cat}</h2>
              <div className="space-y-2">
                {items.map((r) => (
                  <Card key={r.id} className={r.is_low ? "border-red-300" : ""}>
                    <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.name}</div>
                        <div className="text-sm text-stone-500">
                          {rupiah(r.avg_cost)} per {r.unit}, minimum {fmt(r.min_stock)} {r.unit}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-lg font-bold tabular-nums ${r.is_low ? "text-red-700" : ""}`}>
                          {fmt(r.on_hand)}
                        </div>
                        <div className="text-xs text-stone-500">{r.unit}</div>
                      </div>
                    </button>
                    {r.is_low && <div className="mt-2 text-xs font-semibold text-red-700">Stok menipis, segera belanja.</div>}
                    {open === r.id && (
                      <IngredientEditor
                        row={r}
                        units={units}
                        onSaved={(m) => { onDone(m); setOpen(null); }}
                      />
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </ScrollList>
      )}
    </div>
  );
}

function IngredientSelect({ rows, value, onChange }: { rows: StockRow[]; value: string; onChange: (v: string) => void }) {
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

function PurchaseForm({ rows, onDone }: { rows: StockRow[]; onDone: Done }) {
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayJkt());
  const [busy, setBusy] = useState(false);
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
  }

  return (
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

function ResetForm({ rows, blocked, onDone }: { rows: StockRow[]; blocked: boolean; onDone: Done }) {
  const [ing, setIng] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = rows.find((r) => r.id === ing);

  if (blocked) {
    return (
      <Card>
        <p className="text-sm text-stone-600">
          Hanya akun pemilik yang bisa mereset stok bahan. Hubungi pemilik jika ada data stok yang perlu diulang.
        </p>
      </Card>
    );
  }

  async function resetOne() {
    if (!sel) {
      onDone({ type: "err", text: "Pilih bahan yang akan direset." });
      return;
    }
    const ok = confirm(
      `Apakah Anda yakin ingin mereset "${sel.name}"?\n\nStok jadi 0, harga rata-rata jadi Rp0, dan seluruh riwayat stok masuk, keluar, dan opname bahan ini dihapus. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusy(true);
    const { error: mErr } = await supabase.from("stock_movements").delete().eq("ingredient_id", sel.id);
    if (mErr) {
      setBusy(false);
      onDone({ type: "err", text: mErr.message });
      return;
    }
    const { error: iErr } = await supabase.from("ingredients").update({ avg_cost: 0 }).eq("id", sel.id);
    setBusy(false);
    if (iErr) {
      onDone({ type: "err", text: iErr.message });
      return;
    }
    setIng("");
    onDone({ type: "ok", text: `Bahan "${sel.name}" sudah direset. Silakan input stok awal lagi lewat tab Masuk.` });
  }

  async function resetAll() {
    if (confirmText.trim().toUpperCase() !== "RESET") return;
    const ok = confirm(
      `Apakah Anda yakin ingin mereset SEMUA ${rows.length} bahan?\n\nStok semua bahan jadi 0, harga rata-rata jadi Rp0, dan seluruh riwayat stok dihapus. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusy(true);
    const { error: mErr } = await supabase.from("stock_movements").delete().not("id", "is", null);
    if (mErr) {
      setBusy(false);
      onDone({ type: "err", text: mErr.message });
      return;
    }
    const { error: iErr } = await supabase.from("ingredients").update({ avg_cost: 0 }).not("id", "is", null);
    setBusy(false);
    if (iErr) {
      onDone({ type: "err", text: iErr.message });
      return;
    }
    setConfirmText("");
    onDone({ type: "ok", text: "Semua stok bahan sudah direset. Silakan input stok awal lagi lewat tab Masuk." });
  }

  if (rows.length === 0) return <Empty>Belum ada bahan yang bisa direset.</Empty>;

  return (
    <div className="space-y-4">
      <Card className="space-y-2 border-amber-300 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">Reset dipakai untuk mengulang input stok dari awal.</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">
          <li>Yang dihapus: riwayat stok masuk, keluar, opname, dan pemakaian dari penjualan untuk bahan yang direset.</li>
          <li>Yang tetap ada: daftar bahan, resep, menu, data penjualan, dan biaya operasional.</li>
          <li>Angka &quot;belanja bahan baku&quot; di Laporan ikut berkurang karena riwayat pembeliannya dihapus.</li>
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Reset satu bahan</h2>
        <IngredientSelect rows={rows} value={ing} onChange={setIng} />
        {sel && (
          <p className="text-sm text-stone-500">
            Sekarang: stok {fmt(sel.on_hand)} {sel.unit}, harga {rupiah(sel.avg_cost)} per {sel.unit}.
          </p>
        )}
        <button className={`${btnDangerCls} w-full`} onClick={resetOne} disabled={busy || !sel}>
          {busy ? "Memproses…" : "Reset bahan ini"}
        </button>
      </Card>

      <Card className="space-y-3 border-red-300">
        <h2 className="font-semibold text-red-800">Reset semua bahan</h2>
        <p className="text-sm text-stone-600">
          Mengosongkan stok dan riwayat {rows.length} bahan sekaligus. Ketik <b>RESET</b> untuk mengaktifkan tombol.
        </p>
        <input
          className={inputCls}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Ketik RESET"
          autoComplete="off"
        />
        <button
          className={`${btnDangerCls} w-full`}
          onClick={resetAll}
          disabled={busy || confirmText.trim().toUpperCase() !== "RESET"}
        >
          {busy ? "Memproses…" : "Reset semua bahan"}
        </button>
      </Card>
    </div>
  );
}
