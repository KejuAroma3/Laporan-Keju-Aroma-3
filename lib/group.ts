// Mengelompokkan daftar (bahan, menu, dsb.) berdasarkan kategori, dipakai
// di beberapa halaman (Bahan baku, Stok, pemilihan bahan di resep) supaya
// daftar panjang tidak tercampur jadi satu. Kategori kosong/null masuk ke
// kelompok "Tanpa kategori" di urutan paling akhir.
export function groupByCategory<T>(
  items: T[],
  getCategory: (item: T) => string | null,
  otherLabel = "Tanpa kategori"
): [string, T[]][] {
  const OTHER = otherLabel;
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getCategory(item)?.trim() || OTHER;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    if (a[0] === OTHER) return 1;
    if (b[0] === OTHER) return -1;
    return a[0].localeCompare(b[0], "id");
  });
  return entries;
}

// Saran kategori umum untuk bahan baku toko/dapur, ditawarkan lewat
// <datalist> supaya tetap bisa mengetik kategori lain secara bebas.
export const INGREDIENT_CATEGORY_SUGGESTIONS = ["Bahan baku", "Bahan kemasan", "Bahan habis pakai"];

export type ProductGroupBucket<T> = { key: string; groupId: string | null; label: string; items: T[] };

// Mengelompokkan menu berdasarkan produk dasarnya (product_group_id),
// dipakai di Menu dan resep, Rekap penjualan, dan Produksi supaya varian
// (isi/topping beda dari produk yang sama) tampil berdekatan, bukan
// tercampur rata dengan menu lain. Menu tanpa produk dasar masuk satu
// kelompok di urutan paling akhir.
export function groupByProduct<T extends { product_group_id: string | null }>(
  items: T[],
  groups: { id: string; name: string }[],
  standaloneLabel = "Menu lainnya"
): ProductGroupBucket<T>[] {
  const STANDALONE = "__standalone__";
  const nameById = new Map(groups.map((g) => [g.id, g.name]));
  const map = new Map<string, T[]>();
  for (const item of items) {
    // id grup yang tak ada di daftar (misalnya daftar gagal termuat) diperlakukan berdiri sendiri
    const key = item.product_group_id && nameById.has(item.product_group_id) ? item.product_group_id : STANDALONE;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  const entries: ProductGroupBucket<T>[] = Array.from(map.entries()).map(([key, its]) => ({
    key,
    groupId: key === STANDALONE ? null : key,
    label: key === STANDALONE ? standaloneLabel : nameById.get(key) ?? standaloneLabel,
    items: its,
  }));
  entries.sort((a, b) => {
    if (a.key === STANDALONE) return 1;
    if (b.key === STANDALONE) return -1;
    return a.label.localeCompare(b.label, "id");
  });
  return entries;
}

type MergeableSale = {
  menu_item_id: string;
  menu: string;
  photo_url: string | null;
  product_group_id: string | null;
  qty_sold: number;
  revenue: number;
  gross_profit: number;
};

// Menggabungkan hasil penjualan semua varian dari produk dasar yang sama
// jadi satu baris (jumlah terjual, omzet, dan laba dijumlahkan). Menu yang
// berdiri sendiri (tanpa produk dasar) dibiarkan apa adanya. Tidak mengubah
// data masukan.
export function mergeSalesByProduct<T extends MergeableSale>(items: T[], groupNames: Record<string, string>): T[] {
  const standalone: T[] = [];
  const byGroup = new Map<string, T>();
  for (const b of items) {
    if (!b.product_group_id) {
      standalone.push(b);
      continue;
    }
    const cur = byGroup.get(b.product_group_id);
    if (cur) {
      cur.qty_sold += b.qty_sold;
      cur.revenue += b.revenue;
      cur.gross_profit += b.gross_profit;
      cur.photo_url = cur.photo_url ?? b.photo_url;
    } else {
      byGroup.set(b.product_group_id, {
        ...b,
        menu_item_id: `grp-${b.product_group_id}`,
        menu: groupNames[b.product_group_id] ?? b.menu,
      });
    }
  }
  return [...standalone, ...byGroup.values()];
}
