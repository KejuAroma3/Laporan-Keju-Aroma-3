"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import type { StockRow } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

const UNITS = ["gram", "ml", "pcs", "lembar", "sachet", "botol", "porsi"];

export default function IngredientsPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [min, setMin] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const { data, error } = await supabase.from("v_stock").select("*").order("name");
    if (error) setMsg({ type: "err", text: error.message });
    else setRows((data ?? []) as StockRow[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) {
      setMsg({ type: "err", text: "Nama bahan wajib diisi." });
      return;
    }
    const { error } = await supabase.from("ingredients").insert({
      name: name.trim(),
      unit,
      min_stock: Number(min) || 0,
    });
    if (error) {
      setMsg({ type: "err", text: error.message.includes("duplicate") ? "Nama bahan sudah ada." : error.message });
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
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
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

function EditIngredient({ row, onSaved }: { row: StockRow; onSaved: (m: Msg) => void }) {
  const [name, setName] = useState(row.name);
  const [unit, setUnit] = useState(row.unit);
  const [min, setMin] = useState(String(row.min_stock));

  async function save() {
    const { error } = await supabase
      .from("ingredients")
      .update({ name: name.trim(), unit, min_stock: Number(min) || 0 })
      .eq("id", row.id);
    onSaved(error ? { type: "err", text: error.message } : { type: "ok", text: "Perubahan tersimpan." });
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
            {Array.from(new Set([...UNITS, row.unit])).map((u) => (
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
        Mengubah satuan tidak mengonversi stok lama. Ubah hanya jika satuan salah sejak awal.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button className={btnGhostCls} onClick={() => onSaved(null)}>Batal</button>
        <button className={btnCls} onClick={save}>Simpan</button>
      </div>
    </div>
  );
}
