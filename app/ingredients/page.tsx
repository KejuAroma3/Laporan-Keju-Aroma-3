"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import type { StockRow, Unit } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

export default function IngredientsPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [min, setMin] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [i, u] = await Promise.all([
      supabase.from("v_stock").select("*").order("name"),
      supabase.from("units").select("*").order("name"),
    ]);
    const err = [i, u].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });
    setRows((i.data ?? []) as StockRow[]);
    const uList = (u.data ?? []) as Unit[];
    setUnits(uList);
    setUnit((cur) => cur || uList[0]?.name || "");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) {
      setMsg({ type: "err", text: "Nama bahan wajib diisi." });
      return;
    }
    if (!unit) {
      setMsg({ type: "err", text: "Pilih satuan, atau tambahkan satuan baru dulu di bawah." });
      return;
    }
    const { error } = await supabase.from("ingredients").insert({
      name: name.trim(),
      unit,
      min_stock: Number(min) || 0,
    });
    if (error) {
      setMsg({ type: "err", text: error.code === "23505" ? "Nama bahan sudah ada." : error.message });
      return;
    }
    setName(""); setMin("");
    setMsg({ type: "ok", text: "Bahan ditambahkan. Isi stok awal lewat Stok › Masuk." });
    load();
  }

  return (
    <div>
      <PageTitle sub="Daftar bahan baku dan batas stok minimum.">Bahan baku</PageTitle>
      <Notice msg={msg} />

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Tambah bahan</h2>
        <div>
          <Label>Nama bahan</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Biji kopi arabika" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Satuan</Label>
            <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.length === 0 && <option value="">Belum ada satuan</option>}
              {units.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Stok minimum</Label>
            <input type="number" inputMode="decimal" className={inputCls} value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" />
          </div>
        </div>
        <button className={`${btnCls} w-full`} onClick={add}>Tambah bahan</button>
      </Card>

      <UnitsManager units={units} onChanged={(m) => { if (m) setMsg(m); load(); }} />

      {rows.length === 0 ? (
        <Empty>Belum ada bahan.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-sm text-stone-500">
                    Sisa {fmt(r.on_hand)} {r.unit}, {rupiah(r.avg_cost)} per {r.unit}
                  </div>
                </div>
                <span className="text-sm text-teal-800">{open === r.id ? "Tutup" : "Ubah"}</span>
              </button>
              {open === r.id && (
                <EditIngredient
                  row={r}
                  units={units}
                  onSaved={(m) => { setMsg(m); setOpen(null); load(); }}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitsManager({ units, onChanged }: { units: Unit[]; onChanged: (m: Msg) => void }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function add() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    const { error } = await supabase.from("units").insert({ name: trimmed });
    setBusy(false);
    if (error) {
      onChanged({ type: "err", text: error.code === "23505" ? "Satuan itu sudah ada." : error.message });
      return;
    }
    setNewName("");
    onChanged({ type: "ok", text: "Satuan ditambahkan." });
  }

  async function rename(u: Unit) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === u.name) { setEditId(null); return; }
    setBusy(true);
    const { error } = await supabase.from("units").update({ name: trimmed }).eq("id", u.id);
    if (error) {
      setBusy(false);
      onChanged({ type: "err", text: error.code === "23505" ? "Satuan itu sudah ada." : error.message });
      return;
    }
    // ikut perbarui bahan yang sudah memakai nama satuan lama, supaya tetap konsisten
    await supabase.from("ingredients").update({ unit: trimmed }).eq("unit", u.name);
    setBusy(false);
    setEditId(null);
    onChanged({ type: "ok", text: `Satuan diganti jadi "${trimmed}", bahan yang memakainya ikut diperbarui.` });
  }

  async function remove(u: Unit) {
    if (!confirm(`Hapus satuan "${u.name}" dari daftar pilihan? Bahan yang sudah memakainya tidak akan berubah.`)) return;
    setBusy(true);
    const { error } = await supabase.from("units").delete().eq("id", u.id);
    setBusy(false);
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: "Satuan dihapus dari daftar pilihan." });
  }

  return (
    <Card className="mb-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <div className="font-semibold">Kelola satuan</div>
        <span className="text-sm text-teal-800">{open ? "Tutup" : "Buka"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          {units.length === 0 ? (
            <Empty>Belum ada satuan. Tambahkan di bawah.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {units.map((u) => (
                <li key={u.id} className="py-2">
                  {editId === u.id ? (
                    <div className="flex gap-2">
                      <input
                        className={`${inputCls} h-10`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <button className={`${btnCls} h-10 px-3 text-sm`} onClick={() => rename(u)} disabled={busy}>
                        Simpan
                      </button>
                      <button className={`${btnGhostCls} h-10 px-3 text-sm`} onClick={() => setEditId(null)}>
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{u.name}</span>
                      <div className="flex gap-3">
                        <button
                          className="font-medium text-teal-800"
                          onClick={() => { setEditId(u.id); setEditName(u.name); }}
                        >
                          Ubah
                        </button>
                        <button className="font-medium text-red-700" onClick={() => remove(u)} disabled={busy}>
                          Hapus
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className={`${inputCls} h-10`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Satuan baru, contoh: kaleng"
            />
            <button className={`${btnCls} h-10 shrink-0 px-4 text-sm`} onClick={add} disabled={busy || !newName.trim()}>
              Tambah
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EditIngredient({
  row,
  units,
  onSaved,
}: {
  row: StockRow;
  units: Unit[];
  onSaved: (m: Msg) => void;
}) {
  const [name, setName] = useState(row.name);
  const [unit, setUnit] = useState(row.unit);
  const [min, setMin] = useState(String(row.min_stock));
  // pastikan satuan yang sedang dipakai tetap muncul, walau sudah dihapus dari daftar
  const unitOptions = Array.from(new Set([row.unit, ...units.map((u) => u.name)]));

  async function save() {
    const { error } = await supabase
      .from("ingredients")
      .update({ name: name.trim(), unit, min_stock: Number(min) || 0 })
      .eq("id", row.id);
    onSaved(error ? { type: "err", text: error.code === "23505" ? "Nama bahan sudah dipakai." : error.message } : { type: "ok", text: "Perubahan tersimpan." });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
      <div>
        <Label>Nama bahan</Label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Satuan</Label>
          <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {unitOptions.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Stok minimum</Label>
          <input type="number" inputMode="decimal" className={inputCls} value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-stone-500">
        Mengubah satuan di sini tidak mengonversi jumlah stok lama. Ubah hanya jika satuan salah sejak awal.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button className={btnGhostCls} onClick={() => onSaved(null)}>Batal</button>
        <button className={btnCls} onClick={save}>Simpan</button>
      </div>
    </div>
  );
}
