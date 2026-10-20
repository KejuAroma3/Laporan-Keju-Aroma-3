import { supabase } from "./supabase";
import type { MenuItem, StockRow } from "./types";
import type { PackLine } from "./txpack";

export type BoxSize = { id: string; ingredient_id: string; capacity: number };
export type BoxConfig = { sizes: BoxSize[]; exclude: string[] };

export const NEED_BOX_SQL = "Ukuran box belum aktif. Jalankan supabase/27-ukuran-box.sql di Supabase (SQL Editor).";

// Ukuran box dan kata kunci pengecualian. Kosong bila SQL 27 belum dijalankan.
export async function fetchBoxConfig(): Promise<BoxConfig> {
  const [s, c] = await Promise.all([
    supabase.from("box_sizes").select("id, ingredient_id, capacity"),
    supabase.from("box_settings").select("exclude_keywords").maybeSingle(),
  ]);
  const sizes = s.error ? [] : ((s.data ?? []) as BoxSize[]).map((x) => ({ ...x, capacity: Number(x.capacity) }));
  const raw = c.error ? "frozen" : ((c.data as { exclude_keywords?: string } | null)?.exclude_keywords ?? "frozen");
  const exclude = raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  return { sizes: sizes.sort((a, b) => a.capacity - b.capacity), exclude };
}

// Total pcs yang butuh box: porsi x isi per penjualan, tanpa menu yang dikecualikan (mis. frozen, hampers).
export function boxPcs(cart: [string, { qty: number }][], menus: MenuItem[], exclude: string[]): number {
  let total = 0;
  for (const [id, l] of cart) {
    const m = menus.find((x) => x.id === id);
    if (!m) continue;
    const label = `${m.category ?? ""} ${m.name}`.toLowerCase(); // kata kunci cocok dengan kategori ATAU nama menu
    if (exclude.some((k) => label.includes(k))) continue;
    total += l.qty * (m.pack_qty ?? 1);
  }
  return total;
}

export type BoxPlan = { lines: { id: string; qty: number }[]; note: string };

// Pilih ukuran terkecil yang muat. perBox = isi tiap box yang diminta (null = otomatis, penuh sesuai kapasitas).
// Bila stok ukuran itu kurang, dipakai ukuran lebih besar yang stoknya cukup (dengan catatan).
export function planBoxes(pcs: number, perBox: number | null, sizes: BoxSize[], stock: Record<string, number>, names: Record<string, string>): BoxPlan {
  if (pcs <= 0 || sizes.length === 0) return { lines: [], note: "" };
  const maxCap = sizes[sizes.length - 1].capacity;
  const per = perBox && perBox > 0 ? Math.min(perBox, maxCap) : null;
  let count: number;
  let need: number; // kapasitas minimal yang harus dimuat satu box
  if (per) {
    count = Math.ceil(pcs / per);
    need = per;
  } else if (pcs <= maxCap) {
    count = 1;
    need = pcs;
  } else {
    count = Math.ceil(pcs / maxCap);
    need = maxCap;
  }
  const fits = sizes.filter((s) => s.capacity >= need);
  const first = fits[0] ?? sizes[sizes.length - 1];
  const pick = fits.find((s) => (stock[s.ingredient_id] ?? 0) >= count) ?? first;
  let note = `${Math.round(pcs)} pcs → ${count} ${names[pick.ingredient_id] ?? "box"}`;
  if (pick.id !== first.id) note += ` (${names[first.ingredient_id] ?? "box"} kurang/habis, diganti)`;
  else if ((stock[pick.ingredient_id] ?? 0) < count) note += " (stok kurang, cek stok)";
  return { lines: [{ id: pick.ingredient_id, qty: count }], note };
}

// Ganti baris box di daftar kemasan dengan hasil rencana; baris lain (plastik, tisu, dll) dipertahankan.
export function mergeBoxLines(current: PackLine[], plan: BoxPlan, sizes: BoxSize[]): PackLine[] {
  const boxIds = new Set(sizes.map((s) => s.ingredient_id));
  const others = current.filter((l) => !boxIds.has(l.id));
  return [...others, ...plan.lines.map((l, i) => ({ key: Date.now() + i, id: l.id, qty: String(l.qty) }))];
}

export const stockMap = (rows: StockRow[]) => Object.fromEntries(rows.map((r) => [r.id, r.on_hand])) as Record<string, number>;
