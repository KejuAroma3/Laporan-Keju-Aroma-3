export type Channel = "offline" | "gofood" | "grabfood" | "shopeefood";

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
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
};

export type RecipeItem = {
  menu_item_id: string;
  ingredient_id: string;
  qty: number;
};

export type StockRow = {
  id: string;
  name: string;
  unit: string;
  min_stock: number;
  avg_cost: number;
  on_hand: number;
  is_low: boolean;
};

export type SaleRow = {
  discount: number;
  platform_fee: number;
  sale_items: { qty: number; unit_price: number; unit_cogs: number }[];
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
  menu: string;
  category: string | null;
  qty_sold: number;
  revenue: number;
  gross_profit: number;
};
