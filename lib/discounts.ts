export type DiscountLine = { label: string; amount: number };
// Baris di form: jumlah masih berupa teks supaya bisa diketik bebas.
export type DiscountInput = { key: number; label: string; amount: string };

// Menyaring baris form jadi rincian yang valid (jumlah > 0), nama kosong jadi "Diskon".
export function cleanDiscounts(rows: { label: string; amount: string }[]): DiscountLine[] {
  return rows
    .map((r) => ({ label: r.label.trim() || "Diskon", amount: Math.round((Number(r.amount) || 0) * 100) / 100 }))
    .filter((r) => r.amount > 0);
}

export const sumDiscounts = (lines: DiscountLine[]) => lines.reduce((s, l) => s + l.amount, 0);

// Rincian untuk satu penjualan lama: kalau tidak ada rincian tersimpan tapi totalnya ada
// (penjualan sebelum fitur ini), tampilkan satu baris "Diskon".
export function discountLinesFor(total: number, saved: DiscountLine[] | undefined): DiscountLine[] {
  if (saved && saved.length > 0) return saved;
  return total > 0 ? [{ label: "Diskon", amount: total }] : [];
}
