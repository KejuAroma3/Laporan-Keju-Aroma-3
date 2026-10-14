export const CUSTOM_MENU_NAME = "Pesanan Khusus";

export type CustomLine = { key: number; id: string; qty: string };

// Hitung ringkasan pesanan khusus: pendapatan, HPP, laba, dan margin.
export function customTotals(opts: {
  unitPrice: number;
  qty: number;
  discount: number;
  fee: number;
  productCost: number; // total HPP produk jadi yang keluar
  supplyCost: number; // total harga rata-rata kemasan/bahan yang keluar
}) {
  const gross = opts.unitPrice * opts.qty;
  const revenue = gross - opts.discount - opts.fee;
  const cost = opts.productCost + opts.supplyCost;
  const profit = revenue - cost;
  return {
    gross,
    revenue,
    cost,
    costPerPcs: opts.qty > 0 ? cost / opts.qty : 0,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
  };
}
