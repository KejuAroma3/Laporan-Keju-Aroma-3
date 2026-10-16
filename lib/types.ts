export type Channel = "offline" | "gofood" | "grabfood" | "shopeefood";

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  min_stock: number;
  avg_cost: number;
  is_active: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  is_active: boolean;
  photo_url: string | null;
  track_stock: boolean;
  avg_product_cost: number;
  min_product_stock: number;
  stock_unit: string;
  product_group_id: string | null;
  variant_name: string | null;
  sell_order?: number; // urutan di halaman Jual (supabase/23-urutan-menu-jual.sql), 0 = belum diatur
  pack_qty?: number; // isi per penjualan (supabase/15-isi-per-penjualan.sql), bawaan 1
};

// Produk dasar: wadah pengelompokan untuk menu yang beda varian (isi/
// topping) dari produk yang sama, murni untuk tampilan (lihat catatan
// di supabase/13-varian-produk.sql).
export type ProductGroup = {
  id: string;
  name: string;
  category: string | null;
  // Kolom dari supabase/14-urutan-produksi.sql; kosong/undefined kalau SQL itu belum dijalankan.
  production_order?: number;
  hide_in_production?: boolean;
  shared_stock?: boolean;
  stock_menu_id?: string | null;
};

// Dari view v_product_stock: stok produk jadi per menu, dihitung dari
// riwayat produksi/penjualan/waste/penyesuaian (product_movements).
export type ProductStockRow = {
  id: string;
  name: string;
  category: string | null;
  track_stock: boolean;
  avg_product_cost: number;
  min_product_stock: number;
  stock_unit: string;
  product_group_id: string | null;
  variant_name: string | null;
  stock_on_hand: number;
  is_low: boolean;
  production_order?: number; // supabase/14-urutan-produksi.sql
  hide_in_production?: boolean;
};

export type RecipeItem = {
  menu_item_id: string;
  ingredient_id: string;
  qty: number;
  per_sale?: boolean; // supabase/17-kemasan-per-penjualan.sql: dipakai saat dijual, bukan saat produksi
};

export type StockRow = {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  min_stock: number;
  avg_cost: number;
  on_hand: number;
  is_low: boolean;
};

export type SaleRow = {
  discount: number;
  platform_fee: number;
  sale_items: { qty: number; unit_price: number; unit_cogs: number; menu_items?: { name: string } | { name: string }[] | null }[];
};

export type Pnl = {
  gross_sales: number;
  discounts: number;
  platform_fees: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  opex: number;
  net_profit: number;
};

export type BestSeller = {
  menu_item_id: string;
  menu: string;
  category: string | null;
  photo_url: string | null;
  product_group_id: string | null;
  variant_name: string | null;
  qty_sold: number;
  revenue: number;
  gross_profit: number;
};

export type Period = "harian" | "mingguan" | "bulanan";

export type Unit = { id: string; name: string };
