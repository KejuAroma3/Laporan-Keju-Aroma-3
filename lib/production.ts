import type { ProductGroup, ProductStockRow } from "@/lib/types";

// Satu baris di daftar Produksi. Ada tiga jenis:
//  - "single": menu berdiri sendiri (tanpa produk dasar)
//  - "group":  produk dasar yang variannya punya stok sendiri-sendiri (ditampilkan per varian)
//  - "shared": produk dasar yang variannya disatukan, satu stok, varian tidak ditampilkan satu per satu
export type ProductionEntry = {
  key: string; // "m:<menuId>" atau "g:<groupId>"
  kind: "single" | "group" | "shared";
  label: string;
  groupId: string | null;
  // Menu tempat produksi dicatat/stok dilihat. single: menu itu; shared: pemegang stok; group: semua varian.
  rows: ProductStockRow[];
  // Semua varian dalam produk dasar (untuk keterangan), kosong untuk single.
  variants: ProductStockRow[];
  order: number;
  hidden: boolean;
};

const byOrder = (a: ProductionEntry, b: ProductionEntry) =>
  a.order - b.order || a.label.localeCompare(b.label, "id");

// Menyusun daftar produksi dari stok per menu + produk dasar. Hasil sudah terurut
// (urutan yang diatur pemilik, lalu nama). Yang disembunyikan tetap ada di hasil,
// tandai lewat `hidden`; saring dengan visibleEntries().
export function buildProductionEntries(rows: ProductStockRow[], groups: ProductGroup[]): ProductionEntry[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const byGroup = new Map<string, ProductStockRow[]>();
  const entries: ProductionEntry[] = [];

  for (const r of rows) {
    const g = r.product_group_id ? groupById.get(r.product_group_id) : undefined;
    if (!g) {
      entries.push({
        key: `m:${r.id}`,
        kind: "single",
        label: r.name,
        groupId: null,
        rows: [r],
        variants: [],
        order: r.production_order ?? 0,
        hidden: r.hide_in_production ?? false,
      });
    } else {
      byGroup.set(g.id, [...(byGroup.get(g.id) ?? []), r]);
    }
  }

  for (const [gid, variants] of byGroup) {
    const g = groupById.get(gid)!;
    const holder = g.shared_stock && g.stock_menu_id ? variants.find((v) => v.id === g.stock_menu_id) : undefined;
    entries.push({
      key: `g:${gid}`,
      kind: holder ? "shared" : "group",
      label: g.name,
      groupId: gid,
      rows: holder ? [holder] : variants,
      variants,
      order: g.production_order ?? 0,
      hidden: g.hide_in_production ?? false,
    });
  }

  return entries.sort(byOrder);
}

export const visibleEntries = (entries: ProductionEntry[]) => entries.filter((e) => !e.hidden);

// Memindahkan satu entri naik/turun, mengembalikan daftar kunci baru.
export function moveKey(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Untuk Rekap penjualan: varian dari produk dasar yang stoknya disatukan memakai
// stok pemegang stok (id dan nama varian tetap milik varian itu sendiri).
export function resolveSharedStock(rows: ProductStockRow[], groups: ProductGroup[]): Record<string, ProductStockRow> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const out: Record<string, ProductStockRow> = {};
  for (const r of rows) {
    const g = r.product_group_id ? groupById.get(r.product_group_id) : undefined;
    const holder = g?.shared_stock && g.stock_menu_id ? byId.get(g.stock_menu_id) : undefined;
    out[r.id] = holder
      ? { ...holder, id: r.id, name: r.name, variant_name: r.variant_name, product_group_id: r.product_group_id }
      : r;
  }
  return out;
}

// Menu pemegang stok untuk satu menu (dirinya sendiri kecuali varian dari produk dasar yang stoknya disatukan).
export function stockHolderId(menu: { id: string; product_group_id: string | null }, groups: ProductGroup[]): string {
  const g = menu.product_group_id ? groups.find((x) => x.id === menu.product_group_id) : undefined;
  return g?.shared_stock && g.stock_menu_id ? g.stock_menu_id : menu.id;
}

// Total stok (dalam satuan stok, mis. pcs) yang dibutuhkan keranjang per menu pemegang stok:
// jumlah terjual x isi per penjualan, dijumlahkan untuk semua varian yang berbagi stok.
export function stockNeeded(
  lines: { menu: { id: string; product_group_id: string | null; pack_qty?: number }; qty: number }[],
  groups: ProductGroup[]
): Map<string, number> {
  const need = new Map<string, number>();
  for (const l of lines) {
    const h = stockHolderId(l.menu, groups);
    need.set(h, (need.get(h) ?? 0) + l.qty * (l.menu.pack_qty ?? 1));
  }
  return need;
}
