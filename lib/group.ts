// Mengelompokkan daftar (bahan, menu, dsb.) berdasarkan kategori, dipakai
// di beberapa halaman (Bahan baku, Stok, pemilihan bahan di resep) supaya
// daftar panjang tidak tercampur jadi satu. Kategori kosong/null masuk ke
// kelompok "Tanpa kategori" di urutan paling akhir.
export function groupByCategory<T>(items: T[], getCategory: (item: T) => string | null): [string, T[]][] {
  const OTHER = "Tanpa kategori";
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
