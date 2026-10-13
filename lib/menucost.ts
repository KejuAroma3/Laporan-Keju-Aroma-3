import type { Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "./types";
import { stockHolderId } from "./production";
import { recipeCostBreakdown } from "./recipecost";

// HPP per satu penjualan sebuah menu (sama dengan yang tampil di halaman Resep):
// menu berstok produksi = HPP stok pemegang stok x isi + bahan "sekali per penjualan";
// menu tanpa stok = perkiraan dari resep. `stock` harus sudah lewat resolveSharedStock.
export function menuHpp(
  m: MenuItem,
  menus: MenuItem[],
  recipes: RecipeItem[],
  ings: Ingredient[],
  stock: Record<string, ProductStockRow>,
  groups: ProductGroup[]
): number {
  const pack = m.pack_qty ?? 1;
  const costOf = (id: string) => ings.find((i) => i.id === id)?.avg_cost ?? 0;
  const mine = recipes.filter((r) => r.menu_item_id === m.id);
  const st = stock[m.id];
  if (st?.track_stock) {
    const holder = menus.find((x) => x.id === stockHolderId(m, groups));
    const perUnit = st.avg_product_cost ?? holder?.avg_product_cost ?? m.avg_product_cost;
    const saleCost = mine.filter((r) => r.per_sale).reduce((s, r) => s + r.qty * costOf(r.ingredient_id), 0);
    return perUnit * pack + saleCost;
  }
  return recipeCostBreakdown(
    mine.map((r) => {
      const i = ings.find((x) => x.id === r.ingredient_id);
      return { qty: r.qty, per_sale: r.per_sale, avg_cost: i?.avg_cost ?? 0, category: i?.category ?? null };
    }),
    pack
  ).total;
}
