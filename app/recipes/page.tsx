"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, pct, rupiah } from "@/lib/format";
import { groupByCategory, groupByProduct } from "@/lib/group";
import type { Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, ScrollList, SearchInput, btnCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import OwnerOnly from "@/components/OwnerOnly";

export default function RecipesPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [stock, setStock] = useState<Record<string, ProductStockRow>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [m, i, r, s, g] = await Promise.all([
      supabase.from("menu_items").select("*").order("category").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipe_items").select("*"),
      supabase.from("v_product_stock").select("*"), // boleh gagal jika supabase/9-stok-produk.sql belum dijalankan
      supabase.from("product_groups").select("*").order("name"), // boleh gagal jika supabase/13-varian-produk.sql belum dijalankan
    ]);
    const err = [m, i, r].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });
    setMenus((m.data ?? []) as MenuItem[]);
    setIngs((i.data ?? []) as Ingredient[]);
    setRecipes((r.data ?? []) as RecipeItem[]);
    setGroups((g.data ?? []) as ProductGroup[]);
    const stockMap: Record<string, ProductStockRow> = {};
    for (const row of (s.data ?? []) as ProductStockRow[]) stockMap[row.id] = row;
    setStock(stockMap);
  }
  useEffect(() => {
    load();
    // Tautan dari halaman Menu: /recipes?menu=<id> langsung membuka resep menu itu.
    try {
      const id = new URLSearchParams(window.location.search).get("menu");
      if (id) setOpen(id);
    } catch { /* abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cost = (id: string) =>
    recipes
      .filter((r) => r.menu_item_id === id)
      .reduce((s, r) => s + r.qty * (ings.find((i) => i.id === r.ingredient_id)?.avg_cost ?? 0), 0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return menus;
    return menus.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        (m.category ?? "").toLowerCase().includes(term) ||
        (m.variant_name ?? "").toLowerCase().includes(term)
    );
  }, [menus, q]);

  const buckets = useMemo(() => groupByProduct(filtered, groups, "Menu lainnya"), [filtered, groups]);

  return (
    <div>
      <PageTitle sub="Bahan yang dipakai tiap menu. Resep menentukan pemotongan stok bahan dan HPP.">
        Resep
      </PageTitle>
      <Notice msg={msg} />

      <OwnerOnly feature="resep">
      {menus.length === 0 ? (
        <Empty>
          Belum ada menu. Tambahkan dulu di <Link href="/menu" className="underline">Lainnya › Menu</Link>.
        </Empty>
      ) : (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Cari menu…" />
          {filtered.length === 0 ? (
            <Empty>Tidak ada menu yang cocok dengan pencarian.</Empty>
          ) : (
            <ScrollList className="space-y-4">
              {buckets.map((bucket) => (
                <section key={bucket.key}>
                  <h2 className="mb-2 text-sm font-semibold text-stone-500">{bucket.label}</h2>
                  <div className="space-y-2">
                    {bucket.items.map((m) => {
                      const count = recipes.filter((r) => r.menu_item_id === m.id).length;
                      const st = stock[m.id];
                      const tracked = st?.track_stock ?? false;
                      const hpp = tracked ? m.avg_product_cost : cost(m.id);
                      const otherVariants = bucket.items.filter((x) => x.id !== m.id);
                      return (
                        <Card key={m.id} className={m.is_active ? "" : "opacity-60"}>
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                            <Thumb url={m.photo_url} name={m.name} size={48} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">{m.variant_name || m.name}</div>
                              <div className="truncate text-sm text-stone-500">
                                {m.variant_name ? `${m.name} · ` : ""}
                                {count > 0 ? `${count} bahan` : "Belum ada bahan"}
                              </div>
                            </div>
                            <div className="shrink-0 text-right text-sm">
                              {count > 0 ? (
                                <>
                                  <div className="font-semibold tabular-nums">HPP {rupiah(hpp)}</div>
                                  <div className="text-brand-800">margin {pct(m.price - hpp, m.price)}</div>
                                  {tracked && <div className="text-xs text-stone-400">dari produksi</div>}
                                </>
                              ) : (
                                <div className="font-medium text-amber-700">Resep kosong</div>
                              )}
                            </div>
                          </button>
                          {open === m.id && (
                            <RecipeEditor
                              key={m.id}
                              menu={m}
                              ings={ings}
                              recipe={recipes.filter((r) => r.menu_item_id === m.id)}
                              otherVariants={otherVariants}
                              recipesByMenu={recipes}
                              onChanged={(x) => { if (x) setMsg(x); load(); }}
                            />
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))}
            </ScrollList>
          )}
        </>
      )}
      </OwnerOnly>
    </div>
  );
}

function RecipeEditor({
  menu,
  ings,
  recipe,
  otherVariants,
  recipesByMenu,
  onChanged,
}: {
  menu: MenuItem;
  ings: Ingredient[];
  recipe: RecipeItem[];
  otherVariants: MenuItem[];
  recipesByMenu: RecipeItem[];
  onChanged: (m: Msg) => void;
}) {
  const [copyFrom, setCopyFrom] = useState("");
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const sel = ings.find((i) => i.id === ing);

  async function addLine() {
    if (!ing || !(Number(qty) > 0)) {
      onChanged({ type: "err", text: `Pilih bahan dan isi jumlah per ${menu.stock_unit}.` });
      return;
    }
    const { error } = await supabase
      .from("recipe_items")
      .upsert({ menu_item_id: menu.id, ingredient_id: ing, qty: Number(qty) }, { onConflict: "menu_item_id,ingredient_id" });
    if (!error) { setIng(""); setQty(""); }
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: "Resep diperbarui." });
  }

  async function removeLine(ingredientId: string) {
    const { error } = await supabase
      .from("recipe_items")
      .delete()
      .eq("menu_item_id", menu.id)
      .eq("ingredient_id", ingredientId);
    onChanged(error ? { type: "err", text: error.message } : null);
  }

  async function copyRecipe() {
    if (!copyFrom) {
      onChanged({ type: "err", text: "Pilih varian yang resepnya mau disalin." });
      return;
    }
    const source = recipesByMenu.filter((r) => r.menu_item_id === copyFrom);
    if (source.length === 0) {
      onChanged({ type: "err", text: "Varian itu belum punya resep untuk disalin." });
      return;
    }
    const { error } = await supabase
      .from("recipe_items")
      .upsert(
        source.map((r) => ({ menu_item_id: menu.id, ingredient_id: r.ingredient_id, qty: r.qty })),
        { onConflict: "menu_item_id,ingredient_id" }
      );
    onChanged(
      error
        ? { type: "err", text: error.message }
        : { type: "ok", text: `Resep disalin. Sesuaikan bahan yang beda (misalnya isi/toppingnya) di bawah.` }
    );
  }

  return (
    <div className="mt-4 space-y-4 border-t border-stone-100 pt-4">
      <p className="text-xs text-stone-500">
        Nama, harga, dan foto menu diatur di <Link href="/menu" className="underline">Lainnya › Menu</Link>.
      </p>
      <div>
        <h3 className="mb-2 font-semibold">Resep per 1 {menu.stock_unit}</h3>
        {recipe.length === 0 ? (
          <p className="text-sm text-stone-500">Belum ada bahan di resep ini.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recipe.map((r) => {
              const i = ings.find((x) => x.id === r.ingredient_id);
              return (
                <li key={r.ingredient_id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {i?.name ?? "Bahan dihapus"}: {fmt(r.qty)} {i?.unit}
                    <span className="text-stone-500"> ({rupiah(r.qty * (i?.avg_cost ?? 0))})</span>
                  </span>
                  <button className="h-10 px-3 font-medium text-red-700" onClick={() => removeLine(r.ingredient_id)}>
                    Hapus
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {otherVariants.length > 0 && recipe.length === 0 && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-900">Salin resep dari varian lain</div>
          <p className="text-xs text-amber-900">
            Mulai dari resep varian lain dalam produk yang sama, lalu tinggal ganti bahan yang beda
            (misalnya isi/toppingnya).
          </p>
          <select className={inputCls} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Pilih varian…</option>
            {otherVariants.map((v) => (
              <option key={v.id} value={v.id}>{v.variant_name || v.name}</option>
            ))}
          </select>
          <button className={`${btnCls} w-full`} onClick={copyRecipe}>Salin resep</button>
        </div>
      )}

      <div className="space-y-3 rounded-xl bg-stone-50 p-3">
        <select className={inputCls} value={ing} onChange={(e) => setIng(e.target.value)}>
          <option value="">Pilih bahan…</option>
          {groupByCategory(ings, (i) => i.category).map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          className={inputCls}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={sel ? `Jumlah per ${menu.stock_unit} (${sel.unit})` : `Jumlah per ${menu.stock_unit}`}
        />
        <button className={`${btnCls} w-full`} onClick={addLine}>Tambah ke resep</button>
      </div>
    </div>
  );
}
