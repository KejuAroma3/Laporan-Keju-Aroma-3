import type { MenuItem, ProductGroup } from "./types";

// Urutan tampil menu di halaman Jual: kategori, di dalamnya "unit" (produk dasar dengan variannya,
// atau menu tunggal), di dalamnya varian. Semuanya mengikuti menu_items.sell_order; menu yang belum
// diatur (0) tampil paling akhir dan urut abjad.
export type SellUnit = { key: string; label: string; groupId: string | null; menus: MenuItem[] };
export type SellCat = { name: string; units: SellUnit[] };

export const NO_CATEGORY = "Lainnya";

const ord = (m: MenuItem) => (m.sell_order && m.sell_order > 0 ? m.sell_order : Infinity);
const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
const minOrd = (ms: MenuItem[]) => ms.reduce((n, m) => Math.min(n, ord(m)), Infinity);
const byName = (a: string, b: string) => a.localeCompare(b, "id");

export function buildSellCats(menus: MenuItem[], groups: ProductGroup[]): SellCat[] {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const byCat = new Map<string, Map<string, SellUnit>>();
  for (const m of [...menus].sort((a, b) => cmp(ord(a), ord(b)) || byName(a.name, b.name))) {
    const cat = m.category?.trim() || NO_CATEGORY;
    const gid = m.product_group_id && groupName.has(m.product_group_id) ? m.product_group_id : null;
    const key = gid ? `g:${gid}` : `m:${m.id}`;
    const units = byCat.get(cat) ?? new Map<string, SellUnit>();
    const unit = units.get(key) ?? { key, label: gid ? groupName.get(gid)! : m.name, groupId: gid, menus: [] };
    unit.menus.push(m);
    units.set(key, unit);
    byCat.set(cat, units);
  }
  const cats: SellCat[] = [...byCat.entries()].map(([name, units]) => ({
    name,
    units: [...units.values()].sort((a, b) => cmp(minOrd(a.menus), minOrd(b.menus)) || byName(a.label, b.label)),
  }));
  const catOrd = (c: SellCat) => c.units.reduce((n, u) => Math.min(n, minOrd(u.menus)), Infinity);
  return cats.sort((a, b) => cmp(catOrd(a), catOrd(b)) || byName(a.name, b.name));
}

// Semua id menu menurut urutan tampil (kategori, unit, varian).
export const flattenIds = (cats: SellCat[]): string[] =>
  cats.flatMap((c) => c.units.flatMap((u) => u.menus.map((m) => m.id)));

export function moveAt<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
