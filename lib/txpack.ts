import { supabase } from "./supabase";
import type { Channel } from "./types";

export const NEED_TXPACK_SQL = "Kemasan per transaksi belum aktif. Jalankan supabase/26-kemasan-per-transaksi.sql di Supabase (SQL Editor).";
export const TXPACK_NOTE = "Kemasan transaksi"; // catatan pergerakan stok yang ditulis apply_sale_packaging

export type TxRule = { id: string; ingredient_id: string; qty: number; channels: string[]; follow_of: string[]; per_trigger: boolean };
export type PackLine = { key: number; id: string; qty: string };

// Aturan kemasan per transaksi. Kosong bila SQL 26 belum dijalankan.
export async function fetchTxRules(): Promise<TxRule[]> {
  const full = await supabase.from("transaction_packaging_rules").select("id, ingredient_id, qty, channels, follow_of, per_trigger").order("created_at");
  // SQL 28 belum dijalankan: kolom follow_of/per_trigger belum ada, pakai kolom dasar
  const res = full.error ? await supabase.from("transaction_packaging_rules").select("id, ingredient_id, qty, channels").order("created_at") : full;
  if (res.error || !res.data) return [];
  return (res.data as unknown as Partial<TxRule>[]).map((r) => ({
    id: r.id as string,
    ingredient_id: r.ingredient_id as string,
    qty: Number(r.qty),
    channels: r.channels ?? [],
    follow_of: r.follow_of ?? [],
    per_trigger: Boolean(r.per_trigger),
  }));
}

// Baris kemasan awal untuk satu platform, dari aturan yang berlaku di platform itu.
export function linesFromRules(rules: TxRule[], channel: Channel): PackLine[] {
  return rules
    .filter((r) => r.channels.includes(channel) && r.follow_of.length === 0)
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

const has = (lines: PackLine[], id: string) => lines.some((l) => l.id === id && Number(l.qty) > 0);
const triggerQty = (lines: PackLine[], ids: string[]) => lines.filter((l) => ids.includes(l.id)).reduce((t, l) => t + (Number(l.qty) || 0), 0);

// Kemasan ikutan (mis. kabel ties ikut plastik). Tambah baris ikutan saat pemicu pertama muncul (`prev` = daftar sebelumnya,
// null = susun awal) dan hapus saat semua pemicu hilang. Jumlah yang sudah diubah kasir tidak ditimpa.
export function applyFollow(prev: PackLine[] | null, next: PackLine[], rules: TxRule[], channel: Channel): PackLine[] {
  let out = next;
  for (const r of rules) {
    if (r.follow_of.length === 0 || !r.channels.includes(channel)) continue;
    const hadTrigger = prev === null ? false : r.follow_of.some((id) => has(prev, id));
    const hasTrigger = r.follow_of.some((id) => has(out, id));
    if (!hadTrigger && hasTrigger && !out.some((l) => l.id === r.ingredient_id)) {
      const q = r.per_trigger ? r.qty * triggerQty(out, r.follow_of) : r.qty;
      out = [...out, { key: Date.now() + out.length, id: r.ingredient_id, qty: String(q) }];
    } else if (hadTrigger && !hasTrigger) {
      out = out.filter((l) => l.id !== r.ingredient_id);
    }
  }
  return out;
}
