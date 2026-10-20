import { supabase } from "./supabase";
import type { Channel } from "./types";

export const NEED_TXPACK_SQL = "Kemasan per transaksi belum aktif. Jalankan supabase/26-kemasan-per-transaksi.sql di Supabase (SQL Editor).";
export const TXPACK_NOTE = "Kemasan transaksi"; // catatan pergerakan stok yang ditulis apply_sale_packaging

export type TxRule = { id: string; ingredient_id: string; qty: number; channels: string[] };
export type PackLine = { key: number; id: string; qty: string };

// Aturan kemasan per transaksi. Kosong bila SQL 26 belum dijalankan.
export async function fetchTxRules(): Promise<TxRule[]> {
  const { data, error } = await supabase.from("transaction_packaging_rules").select("id, ingredient_id, qty, channels").order("created_at");
  if (error || !data) return [];
  return (data as TxRule[]).map((r) => ({ ...r, qty: Number(r.qty) }));
}

// Baris kemasan awal untuk satu platform, dari aturan yang berlaku di platform itu.
export function linesFromRules(rules: TxRule[], channel: Channel): PackLine[] {
  return rules
    .filter((r) => r.channels.includes(channel))
    .map((r, i) => ({ key: i + 1, id: r.ingredient_id, qty: String(r.qty) }));
}

// Kemasan transaksi yang tersimpan untuk satu penjualan (saat penjualan diubah).
export async function fetchSavedPack(saleId: string): Promise<PackLine[]> {
  const { data } = await supabase
    .from("stock_movements")
    .select("ingredient_id, qty")
    .eq("sale_id", saleId)
    .eq("note", TXPACK_NOTE);
  return ((data ?? []) as { ingredient_id: string; qty: number }[]).map((r, i) => ({ key: i + 1, id: r.ingredient_id, qty: String(-Number(r.qty)) }));
}

// Simpan kemasan transaksi sesudah penjualan tersimpan. Mengembalikan pesan peringatan, atau "" bila aman.
export async function savePack(saleId: string, lines: PackLine[]): Promise<string> {
  const merged = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty);
    if (l.id && q > 0) merged.set(l.id, (merged.get(l.id) ?? 0) + q);
  }
  if (merged.size === 0) return "";
  const { error } = await supabase.rpc("apply_sale_packaging", {
    p_sale: saleId,
    p_items: [...merged.entries()].map(([ingredient_id, qty]) => ({ ingredient_id, qty })),
  });
  if (!error) return "";
  return /apply_sale_packaging|could not find the function|schema cache/i.test(error.message)
    ? `Kemasan transaksi belum tercatat. ${NEED_TXPACK_SQL}`
    : `Kemasan transaksi gagal dicatat (${error.message}).`;
}
