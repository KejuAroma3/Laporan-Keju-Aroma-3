"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StockRow, Unit } from "@/lib/types";
import { Label, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

// Dipakai baik di halaman Bahan baku maupun di Stok > Sisa, supaya
// perilaku edit bahan (termasuk perbaikan harga) selalu konsisten
// di mana pun bahan itu ditampilkan.
export default function IngredientEditor({
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
  const [avgCost, setAvgCost] = useState(String(Math.round(row.avg_cost)));
  const [busy, setBusy] = useState(false);
  // pastikan satuan yang sedang dipakai tetap muncul, walau sudah dihapus dari daftar
  const unitOptions = Array.from(new Set([row.unit, ...units.map((u) => u.name)]));

  async function save() {
    if (!name.trim()) {
      onSaved({ type: "err", text: "Nama bahan tidak boleh kosong." });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("ingredients")
      .update({ name: name.trim(), unit, min_stock: Number(min) || 0, avg_cost: Number(avgCost) || 0 })
      .eq("id", row.id);
    setBusy(false);
    onSaved(
      error
        ? { type: "err", text: error.code === "23505" ? "Nama bahan sudah dipakai." : error.message }
        : { type: "ok", text: "Perubahan tersimpan." }
    );
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

      <div>
        <Label>Harga rata-rata saat ini (Rp per {unit || "satuan"})</Label>
        <input
          type="number"
          inputMode="numeric"
          className={inputCls}
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
        />
        <p className="mt-1 text-xs text-amber-700">
          Perbaikan manual untuk kesalahan input harga saja. Tidak tercatat sebagai pembelian, dan tidak
          mengubah laporan penjualan yang sudah lewat. Untuk mencatat pembelian baru, pakai Stok › Masuk.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className={btnGhostCls} onClick={() => onSaved(null)}>Batal</button>
        <button className={btnCls} onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </div>
  );
}
