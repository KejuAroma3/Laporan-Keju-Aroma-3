import type { Channel, MenuItem } from "./types";

export const ONLINE_CHANNELS: Channel[] = ["gofood", "grabfood", "shopeefood"];

// Harga khusus per platform: { [menu_id]: { gofood: 25000, ... } }
export type PriceMap = Record<string, Partial<Record<Channel, number>>>;

// Harga yang dipakai untuk menu di sebuah platform: harga khusus kalau ada, kalau tidak harga dasar.
export function priceFor(m: { id: string; price: number }, channel: Channel, prices: PriceMap): number {
  if (channel === "offline") return m.price;
  const p = prices[m.id]?.[channel];
  return p !== undefined && p > 0 ? p : m.price;
}

// Margin dan laba untuk satu harga. komisi (%) dipotong dari harga jual; margin dihitung dari
// pendapatan bersih setelah komisi, supaya terlihat untung sebenarnya.
export function marginAt(price: number, hpp: number, commissionPct = 0) {
  const net = price * (1 - commissionPct / 100);
  const profit = net - hpp;
  return { net, profit, margin: net > 0 ? (profit / net) * 100 : 0 };
}

// Harga yang membuat margin bersih (setelah komisi) sebesar targetPct, dibulatkan ke atas ke kelipatan `step`.
export function suggestPrice(hpp: number, targetPct: number, commissionPct = 0, step = 500): number {
  const keep = (1 - commissionPct / 100) * (1 - targetPct / 100);
  if (keep <= 0 || hpp <= 0) return 0;
  return Math.ceil(hpp / keep / step) * step;
}
