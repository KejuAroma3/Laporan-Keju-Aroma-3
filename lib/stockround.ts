import type { StockRow } from "./types";

// Bahan yang dihitung per biji. Pemakaian pecahan (mis. 1 stiker untuk 15 penjualan = 0,07 per penjualan)
// dihitung untuk HPP, tapi stok yang tampil dibulatkan ke bawah: begitu satu biji mulai terpakai, stok turun 1.
const COUNT_UNIT = /^(pcs|lembar|buah|biji|pack|roll|bungkus|pasang|set)$/i;

export const isCountUnit = (unit: string | null | undefined) => COUNT_UNIT.test((unit ?? "").trim());

export function roundStock(rows: StockRow[]): StockRow[] {
  return rows.map((r) => (isCountUnit(r.unit) ? { ...r, on_hand: Math.floor(Number(r.on_hand) + 1e-9) } : r));
}
