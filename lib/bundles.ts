import { supabase } from "./supabase";
import type { MenuItem } from "./types";

// Menu paket (bundling): satu menu berisi beberapa menu lain (supabase/30-menu-paket.sql).
export type BundlePart = { component_id: string; qty: number };
export type BundleMap = Record<string, BundlePart[]>;

export const NEED_BUNDLE_SQL = "Menu paket belum aktif. Jalankan supabase/30-menu-paket.sql di Supabase (SQL Editor), lalu coba lagi.";

// Kosong kalau SQL 30 belum dijalankan.
export async function fetchBundles(): Promise<BundleMap> {
  const res = await supabase.from("menu_bundle_items").select("bundle_id, component_id, qty").order("created_at");
  if (res.error || !res.data) return {};
  const map: BundleMap = {};
  for (const r of res.data as unknown as { bundle_id: string; component_id: string; qty: number }[]) {
    (map[r.bundle_id] ??= []).push({ component_id: r.component_id, qty: Number(r.qty) });
  }
  return map;
}

// Ganti isi paket sebuah menu. Daftar kosong = menu biasa lagi.
export async function saveBundle(bundleId: string, parts: BundlePart[]): Promise<string | null> {
  const del = await supabase.from("menu_bundle_items").delete().eq("bundle_id", bundleId);
  if (del.error) return /menu_bundle_items|schema cache/i.test(del.error.message) ? NEED_BUNDLE_SQL : del.error.message;
  if (parts.length === 0) return null;
  const ins = await supabase
    .from("menu_bundle_items")
    .insert(parts.map((p) => ({ bundle_id: bundleId, component_id: p.component_id, qty: p.qty })));
  return ins.error ? ins.error.message : null;
}

// Ganti baris paket di keranjang dengan komponennya (jumlah x qty komponen), untuk menghitung kebutuhan stok.
export function expandBundles<T extends { menu: MenuItem; qty: number }>(lines: T[], bundles: BundleMap, menus: MenuItem[]): { menu: MenuItem; qty: number }[] {
  const out: { menu: MenuItem; qty: number }[] = [];
  for (const l of lines) {
    const parts = bundles[l.menu.id];
    if (!parts || parts.length === 0) {
      out.push({ menu: l.menu, qty: l.qty });
      continue;
    }
    for (const p of parts) {
      const c = menus.find((m) => m.id === p.component_id);
      if (c) out.push({ menu: c, qty: l.qty * p.qty });
    }
  }
  return out;
}
