export type CostLine = {
  qty: number;
  per_sale?: boolean;
  avg_cost: number;
  category: string | null;
};

export type CostBreakdown = {
  total: number; // HPP per satu penjualan
  byCategory: [string, number][]; // rincian per kategori bahan, terbesar dulu
};

// Perkiraan HPP per satu penjualan dari resep, memakai harga rata-rata bahan saat ini.
//  - tracked (menu diproduksi dalam batch): bahan produksi dihitung per pcs lalu dikali isi per
//    penjualan; bahan "dipakai saat dijual" dihitung per penjualan (tidak dikali isi).
//  - tidak tracked (dibuat saat dipesan): semua bahan dihitung per penjualan.
export function recipeCostBreakdown(lines: CostLine[], tracked: boolean, pack = 1): CostBreakdown {
  const by = new Map<string, number>();
  let total = 0;
  for (const l of lines) {
    const mult = tracked && !l.per_sale ? pack : 1;
    const cost = l.qty * l.avg_cost * mult;
    const label = l.category?.trim() || "Tanpa kategori";
    by.set(label, (by.get(label) ?? 0) + cost);
    total += cost;
  }
  return { total, byCategory: [...by.entries()].sort((a, b) => b[1] - a[1]) };
}

// Jumlah resep dari "dipakai X untuk N pcs": misalnya 1 pasang handgloves untuk 50 pcs = 0,02 per pcs.
export const perUnitQty = (used: number, forPcs: number) => (forPcs > 0 ? used / forPcs : used);
