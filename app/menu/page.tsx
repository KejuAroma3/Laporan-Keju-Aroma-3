"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, pct, rupiah } from "@/lib/format";
import { groupByCategory, groupByProduct } from "@/lib/group";
import type { Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import PhotoUpload from "@/components/PhotoUpload";
import OwnerOnly from "@/components/OwnerOnly";

// Mencari produk dasar berdasarkan nama (dibuat kalau belum ada), dipakai
// baik saat menambah menu baru maupun saat mengubah menu yang sudah ada.
async function resolveProductGroup(name: string, category: string | null): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase
    .from("product_groups")
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("product_groups")
    .insert({ name: trimmed, category })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export default function MenuPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [stock, setStock] = useState<Record<string, ProductStockRow>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [variantName, setVariantName] = useState("");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

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

  async function add() {
    if (!name.trim() || !(Number(price) > 0)) {
      setMsg({ type: "err", text: "Isi nama menu dan harga jual." });
      return;
    }
    let groupId: string | null = null;
    try {
      groupId = await resolveProductGroup(productGroup, category.trim() || null);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan produk dasar." });
      return;
    }
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: name.trim(),
        category: category.trim() || null,
        price: Number(price),
        product_group_id: groupId,
        variant_name: variantName.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setMsg({ type: "err", text: error.message.includes("duplicate") ? "Nama menu sudah ada." : error.message });
      return;
    }
    setName(""); setCategory(""); setPrice(""); setProductGroup(""); setVariantName("");
    setMsg({ type: "ok", text: "Menu ditambahkan. Lengkapi resep dan foto di bawah agar HPP dan stok terhitung." });
    setOpen(data?.id ?? null);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <PageTitle sub="Resep menentukan pemotongan stok dan HPP tiap penjualan.">
          Menu dan resep
        </PageTitle>
        <Link href="/menu/import" className={`${btnGhostCls} h-10 shrink-0 px-3 text-sm`}>
          Impor massal
        </Link>
      </div>
      <Notice msg={msg} />

      <OwnerOnly feature="menu dan resep">
      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Tambah menu</h2>
        <div>
          <Label>Nama menu</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Keju Aroma Original" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kategori</Label>
            <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kopi, Makanan…" />
          </div>
          <div>
            <Label>Harga jual (Rp)</Label>
            <input type="number" inputMode="numeric" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Produk dasar (opsional)</Label>
            <input
              className={inputCls}
              value={productGroup}
              onChange={(e) => setProductGroup(e.target.value)}
              placeholder="Contoh: Keju Aroma"
              list="daftar-produk-dasar"
            />
            <datalist id="daftar-produk-dasar">
              {groups.map((g) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Nama varian (opsional)</Label>
            <input className={inputCls} value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Original, Cokelat…" />
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Isi kedua kolom ini kalau menu ini salah satu varian (beda isi/topping) dari produk yang sama,
          misalnya &quot;Keju Aroma&quot; dengan varian Original dan Cokelat — supaya keduanya dikelompokkan
          berdekatan di seluruh aplikasi. Kosongkan kalau menu ini berdiri sendiri.
        </p>
        <button className={`${btnCls} w-full`} onClick={add}>Tambah menu</button>
      </Card>

      {menus.length === 0 ? (
        <Empty>Belum ada menu.</Empty>
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
                      const hasRecipe = recipes.some((r) => r.menu_item_id === m.id);
                      const st = stock[m.id];
                      const tracked = st?.track_stock ?? false;
                      const hpp = tracked ? m.avg_product_cost : cost(m.id);
                      const otherVariants = bucket.items.filter((x) => x.id !== m.id);
                      return (
                        <Card key={m.id} className={m.is_active ? "" : "opacity-60"}>
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                            <Thumb url={m.photo_url} name={m.name} size={48} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">
                                {m.variant_name || m.name}
                                {!m.is_active && <span className="text-xs font-normal text-stone-500"> (disembunyikan)</span>}
                              </div>
                              <div className="truncate text-sm text-stone-500">
                                {m.variant_name ? `${m.name} · ` : ""}
                                {m.category || "Tanpa kategori"}, {rupiah(m.price)}
                              </div>
                              {tracked && (
                                <div className={`text-xs font-medium ${st.is_low ? "text-red-700" : "text-stone-400"}`}>
                                  Stok produk: {fmt(st.stock_on_hand)} {st.stock_unit}{st.is_low ? ", segera produksi lagi" : ""}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right text-sm">
                              {hasRecipe ? (
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
                            <MenuEditor
                              key={m.id}
                              menu={m}
                              ings={ings}
                              groups={groups}
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

function MenuEditor({
  menu,
  ings,
  groups,
  recipe,
  otherVariants,
  recipesByMenu,
  onChanged,
}: {
  menu: MenuItem;
  ings: Ingredient[];
  groups: ProductGroup[];
  recipe: RecipeItem[];
  otherVariants: MenuItem[];
  recipesByMenu: RecipeItem[];
  onChanged: (m: Msg) => void;
}) {
  const [name, setName] = useState(menu.name);
  const [price, setPrice] = useState(String(menu.price));
  const [category, setCategory] = useState(menu.category ?? "");
  const [minStock, setMinStock] = useState(String(menu.min_product_stock));
  const [stockUnit, setStockUnit] = useState(menu.stock_unit);
  const [productGroup, setProductGroup] = useState(groups.find((g) => g.id === menu.product_group_id)?.name ?? "");
  const [variantName, setVariantName] = useState(menu.variant_name ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const sel = ings.find((i) => i.id === ing);

  async function savePhoto(url: string | null) {
    const { error } = await supabase.from("menu_items").update({ photo_url: url }).eq("id", menu.id);
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: url ? "Foto tersimpan." : "Foto dihapus." });
  }

  async function saveInfo() {
    if (!name.trim()) {
      onChanged({ type: "err", text: "Nama menu tidak boleh kosong." });
      return;
    }
    let groupId: string | null = null;
    try {
      groupId = await resolveProductGroup(productGroup, category.trim() || null);
    } catch (e) {
      onChanged({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan produk dasar." });
      return;
    }
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: name.trim(),
        price: Number(price) || 0,
        category: category.trim() || null,
        min_product_stock: Number(minStock) || 0,
        stock_unit: stockUnit.trim() || "pcs",
        product_group_id: groupId,
        variant_name: variantName.trim() || null,
      })
      .eq("id", menu.id);
    if (error) {
      const msg = error.code === "23505" ? "Nama menu sudah dipakai produk lain." : error.message;
      onChanged({ type: "err", text: msg });
      return;
    }
    onChanged({ type: "ok", text: "Menu diperbarui. Perubahan berlaku untuk penjualan berikutnya." });
  }

  async function removeMenu() {
    if (!confirm(`Hapus menu "${menu.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", menu.id);
    if (error) {
      const msg =
        error.code === "23503"
          ? "Menu ini sudah pernah terjual, jadi tidak bisa dihapus (supaya laporan lama tidak berubah). Pakai tombol Sembunyikan saja."
          : error.message;
      onChanged({ type: "err", text: msg });
      return;
    }
    onChanged({ type: "ok", text: "Menu dihapus." });
  }

  async function toggleActive() {
    const { error } = await supabase.from("menu_items").update({ is_active: !menu.is_active }).eq("id", menu.id);
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: menu.is_active ? "Menu disembunyikan dari halaman jual." : "Menu ditampilkan kembali." });
  }

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
      <div>
        <Label>Foto produk</Label>
        <PhotoUpload value={menu.photo_url} onChange={savePhoto} pathPrefix={menu.id} />
      </div>

      {menu.track_stock ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
          Menu ini memakai stok produk (HPP dari produksi, bukan estimasi resep). Catat produksi dan lihat
          jumlah stoknya di <Link href="/production" className="underline">Lainnya › Produksi</Link>.
        </p>
      ) : (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          Menu ini masih dibuat saat dipesan (bahan langsung terpotong tiap laku). Kalau menu ini sebenarnya
          diproduksi dalam batch duluan, catat produksi pertamanya di{" "}
          <Link href="/production" className="underline">Lainnya › Produksi</Link>.
        </p>
      )}

      <div>
        <Label>Nama menu</Label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Harga jual (Rp)</Label>
          <input type="number" inputMode="numeric" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <Label>Kategori</Label>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Produk dasar</Label>
          <input className={inputCls} value={productGroup} onChange={(e) => setProductGroup(e.target.value)} placeholder="Kosongkan jika berdiri sendiri" list="daftar-produk-dasar-edit" />
          <datalist id="daftar-produk-dasar-edit">
            {groups.map((g) => (
              <option key={g.id} value={g.name} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Nama varian</Label>
          <input className={inputCls} value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Original, Cokelat…" />
        </div>
      </div>
      {menu.track_stock && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Satuan stok produk</Label>
            <input className={inputCls} value={stockUnit} onChange={(e) => setStockUnit(e.target.value)} placeholder="pcs" />
          </div>
          <div>
            <Label>Stok minimum ({stockUnit || "satuan"})</Label>
            <input type="number" inputMode="decimal" className={inputCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
          </div>
          <p className="col-span-2 text-xs text-stone-500">Diberi tanda "stok menipis" kalau stok produk turun sampai atau di bawah angka minimum.</p>
        </div>
      )}
      <button className={`${btnGhostCls} w-full`} onClick={toggleActive}>
        {menu.is_active ? "Sembunyikan dari halaman Jual" : "Tampilkan di halaman Jual"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button className={`${btnGhostCls} text-red-700`} onClick={removeMenu}>Hapus menu</button>
        <button className={btnCls} onClick={saveInfo}>Simpan</button>
      </div>

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
