"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { rupiah } from "@/lib/format";
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
  const [totalPrice, setTotalPrice] = useState("");
  const [boughtQty, setBoughtQty] = useState("");
  const [busy, setBusy] = useState(false);
  // pastikan satuan yang sedang dipakai tetap muncul, walau sudah dihapus dari daftar
  const unitOptions = Array.from(new Set([row.unit, ...units.map((u) => u.name)]));

  const total = Number(totalPrice);
  const qty = Number(boughtQty);
  const newAvg = total > 0 && qty > 0 ? total / qty : null;

  async function save() {
    if (!name.trim()) {
      onSaved({ type: "err", text: "Nama bahan tidak boleh kosong." });
      return;
    }
    const wantsPriceChange = totalPrice !== "" || boughtQty !== "";
    if (wantsPriceChange && newAvg === null) {
      onSaved({
        type: "err",
        text: "Untuk koreksi harga, isi total harga beli dan jumlah barang (keduanya lebih dari 0), atau kosongkan keduanya jika harga tidak diubah.",
      });
      return;
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      unit,
      min_stock: Number(min) || 0,
    };
    if (wantsPriceChange && newAvg !== null) payload.avg_cost = Math.round(newAvg * 10000) / 10000;

    setBusy(true);
    const { error } = await supabase.from("ingredients").update(payload).eq("id", row.id);
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

      <div className="space-y-3 rounded-xl bg-stone-50 p-3">
        <div>
          <div className="text-sm font-semibold">Koreksi harga (opsional)</div>
          <div className="text-xs text-stone-500">
            Harga rata-rata saat ini: {rupiah(row.avg_cost)} per {row.unit}. Jika harga itu salah, salin
            saja dua angka dari nota belanja (total yang dibayar dan jumlah barang yang didapat), tidak perlu
            membagi sendiri. Kosongkan keduanya jika harga tidak diubah.
          </div>
        </div>
        <div>
          <Label>Total harga beli (Rp)</Label>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={totalPrice}
            onChange={(e) => setTotalPrice(e.target.value)}
            placeholder="Contoh: 26000"
          />
        </div>
        <div>
          <Label>Jumlah barang ({unit || "satuan"})</Label>
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            value={boughtQty}
            onChange={(e) => setBoughtQty(e.target.value)}
            placeholder="Contoh: 12"
          />
          <p className="mt-1 text-xs text-stone-500">
            Pakai satuan yang sama dengan satuan bahan. Jika nota tertulis kg sedangkan satuan bahan gram,
            tulis dalam gram (2 kg = 2000).
          </p>
        </div>
        {newAvg !== null && (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900">
            Harga rata-rata: {rupiah(newAvg)} per {unit}
          </div>
        )}
        <p className="text-xs text-amber-700">
          Dua kolom ini hanya untuk menghitung harga, tidak menambah stok dan tidak tercatat sebagai
          pembelian. Untuk mencatat pembelian baru, pakai Stok › Masuk. Laporan penjualan yang sudah lewat
          tidak berubah.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className={btnGhostCls} onClick={() => onSaved(null)}>Batal</button>
        <button className={btnCls} onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </div>
  );
}
