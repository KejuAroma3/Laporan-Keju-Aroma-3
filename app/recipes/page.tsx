"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, pct, rupiah } from "@/lib/format";
import { groupByCategory, groupByProduct } from "@/lib/group";
import type { Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, btnCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import { resolveSharedStock, stockHolderId } from "@/lib/production";
import { perUnitQty, recipeCostBreakdown } from "@/lib/recipecost";
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
    setStock(resolveSharedStock((s.data ?? []) as ProductStockRow[], (g.data ?? []) as ProductGroup[]));
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

  const cost = (id: string) => {
    const m = menus.find((x) => x.id === id);
    return recipeCostBreakdown(
      recipes
        .filter((r) => r.menu_item_id === id)
        .map((r) => {
          const i = ings.find((x) => x.id === r.ingredient_id);
          return { qty: r.qty, per_sale: r.per_sale, avg_cost: i?.avg_cost ?? 0, category: i?.category ?? null };
        }),
      m?.pack_qty ?? 1
    ).total;
  };

  // Bahan yang ditandai "dipakai saat dijual" ikut HPP penjualan, bukan HPP produksi.
  const saleCost = (id: string) =>
    recipes
      .filter((r) => r.menu_item_id === id && r.per_sale)
      .reduce((sum, r) => sum + r.qty * (ings.find((i) => i.id === r.ingredient_id)?.avg_cost ?? 0), 0);

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
                      const hpp = tracked ? (st?.avg_product_cost ?? m.avg_product_cost) * (m.pack_qty ?? 1) + saleCost(m.id) : cost(m.id);
                      const otherVariants = bucket.items.filter((x) => x.id !== m.id);
                      // Varian dari produk dasar yang stoknya disatukan: stok dan HPP ikut menu pemegang stok.
                      const holderMenu = menus.find((x) => x.id === stockHolderId(m, groups));
                      const holderLabel = holderMenu && holderMenu.id !== m.id ? holderMenu.variant_name || holderMenu.name : null;
                      return (
                        <Card key={m.id} className={m.is_active ? "" : "opacity-60"}>
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                            <Thumb url={m.photo_url} name={m.name} size={48} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">{m.variant_name || m.name}</div>
                              <div className="truncate text-sm text-stone-500">
                                {m.variant_name ? `${m.name} · ` : ""}
                                {holderLabel
                                  ? `Stok & HPP mengikuti "${holderLabel}"${count > 0 ? `, +${count} bahan per penjualan` : ""}`
                                  : count > 0
                                    ? `${count} bahan`
                                    : "Belum ada bahan"}
                              </div>
                            </div>
                            <div className="shrink-0 text-right text-sm">
                              {count > 0 || holderLabel ? (
                                <>
                                  <div className="font-semibold tabular-nums">HPP {rupiah(hpp)}</div>
                                  <div className="text-brand-800">margin {pct(m.price - hpp, m.price)}</div>
                                  <div className="text-xs text-stone-400">
                                    {holderLabel ? `ikut ${holderLabel}` : tracked ? "dari produksi" : "dari resep"}{(m.pack_qty ?? 1) !== 1 ? `, isi ${m.pack_qty}` : ""}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-medium text-amber-700">Resep kosong</div>
                                  {tracked && hpp > 0 && (
                                    <div className="text-xs text-stone-400">sisa HPP stok {rupiah(hpp)}</div>
                                  )}
                                </>
                              )}
                            </div>
                          </button>
                          {open === m.id && (
                            <RecipeEditor
                              key={m.id}
                              menu={m}
                              ings={ings}
                              tracked={tracked}
                              stockCost={tracked ? (st?.avg_product_cost ?? m.avg_product_cost) : null}
                              isHolder={stockHolderId(m, groups) === m.id}
                              holderLabel={holderLabel}
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
  tracked,
  stockCost,
  isHolder,
  holderLabel,
  recipe,
  otherVariants,
  recipesByMenu,
  onChanged,
}: {
  menu: MenuItem;
  ings: Ingredient[];
  tracked: boolean;
  stockCost: number | null; // HPP per pcs yang tercatat di stok produksi (null kalau menu belum diproduksi)
  isHolder: boolean; // true kalau stok produksi tersimpan di menu ini sendiri
  holderLabel: string | null; // diisi kalau stok menu ini ikut menu lain (varian disatukan)
  
  recipe: RecipeItem[];
  otherVariants: MenuItem[];
  recipesByMenu: RecipeItem[];
  onChanged: (m: Msg) => void;
}) {
  const [copyFrom, setCopyFrom] = useState("");
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const [forPcs, setForPcs] = useState("");
  const [perSale, setPerSale] = useState(false);
  const sel = ings.find((i) => i.id === ing);
  const member = holderLabel !== null;
  // Biaya bahan produksi per 1 pcs dari resep dan harga bahan SAAT INI (tanpa bahan "sekali per penjualan").
  const prodPerUnit = recipe.reduce(
    (sum, r) => sum + (r.per_sale ? 0 : r.qty * (ings.find((x) => x.id === r.ingredient_id)?.avg_cost ?? 0)),
    0
  );
  const salePart = recipe.reduce(
    (sum, r) => sum + (r.per_sale ? r.qty * (ings.find((x) => x.id === r.ingredient_id)?.avg_cost ?? 0) : 0),
    0
  );
  const recordedTotal = stockCost !== null ? stockCost * (menu.pack_qty ?? 1) + salePart : null;

  async function syncCost() {
    const per = Math.round(prodPerUnit * 10000) / 10000;
    if (
      !confirm(
        `Samakan HPP stok "${menu.name}" dengan resep sekarang?\n\nHPP per ${menu.stock_unit} jadi ${rupiah(per)} (sebelumnya ${rupiah(stockCost ?? 0)}). Berlaku untuk penjualan berikutnya dan nilai stok. Penjualan yang sudah tercatat tidak berubah.`
      )
    )
      return;
    const { error } = await supabase.from("menu_items").update({ avg_product_cost: per }).eq("id", menu.id);
    onChanged(
      error
        ? { type: "err", text: error.message }
        : { type: "ok", text: `HPP stok disamakan dengan resep: ${rupiah(per)} per ${menu.stock_unit}.` }
    );
  }

  const effQty = Number(qty) > 0 ? perUnitQty(Number(qty), Number(forPcs) || 0) : 0;
  const cost = recipeCostBreakdown(
    recipe.map((r) => {
      const i = ings.find((x) => x.id === r.ingredient_id);
      return { qty: r.qty, per_sale: r.per_sale, avg_cost: i?.avg_cost ?? 0, category: i?.category ?? null };
    }),
    menu.pack_qty ?? 1
  );
  const costGap = recordedTotal !== null && cost.total > 0 ? Math.abs(recordedTotal - cost.total) / cost.total : 0;

  async function addLine() {
    if (!ing || !(Number(qty) > 0)) {
      onChanged({ type: "err", text: `Pilih bahan dan isi jumlah per ${menu.stock_unit}.` });
      return;
    }
    // Bahan yang dihitung per biji (pcs, lembar, ...) tidak boleh berpecahan: stok akan jadi 49,8 dst.
    const ingRow = ings.find((x) => x.id === ing);
    if (ingRow && /^(pcs|lembar|buah|biji|pack|roll|bungkus)$/i.test(ingRow.unit.trim()) && Math.abs(effQty - Math.round(effQty)) > 1e-9) {
      const ok = confirm(
        `Jumlah ${fmt(effQty)} ${ingRow.unit} berupa pecahan, jadi stok ${ingRow.name} akan turun pecahan (mis. 49,8).\n\n` +
          `Untuk box/plastik/kemasan yang dipakai per transaksi, sebaiknya pakai Lainnya › Kemasan per transaksi (aturan dan ukuran box) dan jangan dimasukkan ke resep.\n\nTetap simpan di resep?`
      );
      if (!ok) return;
    }
    const existing = recipe.find((r) => r.ingredient_id === ing);
    // per_sale hanya dikirim bila perlu, supaya tetap jalan sebelum supabase/17-kemasan-per-penjualan.sql dijalankan
    const flag = member ? { per_sale: true } : perSale || existing?.per_sale ? { per_sale: perSale } : {};
    const { error } = await supabase
      .from("recipe_items")
      .upsert({ menu_item_id: menu.id, ingredient_id: ing, qty: effQty, ...flag }, { onConflict: "menu_item_id,ingredient_id" });
    if (!error) { setIng(""); setQty(""); setForPcs(""); setPerSale(false); }
    onChanged(
      error
        ? { type: "err", text: /per_sale/.test(error.message) ? "Penanda 'dipakai saat dijual' belum aktif. Jalankan supabase/17-kemasan-per-penjualan.sql di Supabase (SQL Editor)." : error.message }
        : { type: "ok", text: "Resep diperbarui." }
    );
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
    const anyPerSale = source.some((r) => r.per_sale);
    const { error } = await supabase
      .from("recipe_items")
      .upsert(
        source.map((r) => ({
          menu_item_id: menu.id,
          ingredient_id: r.ingredient_id,
          qty: r.qty,
          // Semua baris harus punya kolom yang sama: kalau sebagian ada per_sale dan sebagian tidak,
          // baris tanpa kolom itu dikirim sebagai null dan ditolak database (kolomnya wajib terisi).
          // per_sale hanya dikirim bila ada yang memakainya, supaya tetap jalan sebelum SQL 17.
          ...(anyPerSale ? { per_sale: Boolean(r.per_sale) } : {}),
        })),
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
      {member && (
        <div className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <div className="font-semibold">Stok dan HPP menu ini mengikuti &quot;{holderLabel}&quot;</div>
          <p className="text-xs">
            Variannya disatukan (Stok › Atur list), jadi menu ini tidak punya resep produksi sendiri: bahan produksi
            diatur di resep &quot;{holderLabel}&quot;. HPP-nya = HPP per {menu.stock_unit} &quot;{holderLabel}&quot;
            {stockCost !== null ? ` (${rupiah(stockCost)})` : ""} x isi {menu.pack_qty ?? 1}, ditambah bahan sekali
            per penjualan di bawah (box, label, plastik).
            {(menu.pack_qty ?? 1) === 1 ? " Kalau satu penjualan menu ini berisi lebih dari 1, ubah Isi per penjualan di Lainnya › Menu." : ""}
          </p>
        </div>
      )}
      <div>
        <h3 className="mb-2 font-semibold">{member ? "Bahan sekali per penjualan" : `Resep per 1 ${menu.stock_unit}`}</h3>
        {recipe.length === 0 ? (
          <p className="text-sm text-stone-500">{member ? "Belum ada bahan tambahan per penjualan." : "Belum ada bahan di resep ini."}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recipe.map((r) => {
              const i = ings.find((x) => x.id === r.ingredient_id);
              return (
                <li key={r.ingredient_id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {i?.name ?? "Bahan dihapus"}: {fmt(r.qty)} {i?.unit}
                    <span className="text-stone-500"> ({rupiah(r.qty * (i?.avg_cost ?? 0))})</span>
                    {i?.category && <span className="block text-xs text-stone-400">{i.category}</span>}
                    {r.per_sale && <span className="block text-xs font-medium text-brand-800">Sekali per penjualan (tidak dikali isi)</span>}
                    {member && !r.per_sale && (
                      <span className="block text-xs font-medium text-amber-700">Tidak dipakai: stok menu ini ikut &quot;{holderLabel}&quot;. Hapus saja.</span>
                    )}
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

      {(recipe.length > 0 || member) && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3 text-sm">
          {recordedTotal !== null && (
            <div>
              <div className="flex items-baseline justify-between gap-3 font-semibold">
                <span>{member ? `HPP menu ini (mengikuti ${holderLabel})` : "HPP tercatat (dipakai di penjualan)"}</span>
                <span className="tabular-nums">{rupiah(recordedTotal)}</span>
              </div>
              <p className="text-xs text-stone-500">
                {rupiah(stockCost ?? 0)} per {menu.stock_unit} dari stok produksi
                {(menu.pack_qty ?? 1) !== 1 ? ` x isi ${menu.pack_qty}` : ""}
                {salePart > 0 ? `, ditambah ${rupiah(salePart)} bahan sekali per penjualan` : ""}.
              </p>
            </div>
          )}
          {!member && <div>
            <div className="mb-1 flex items-baseline justify-between gap-3 font-semibold">
              <span>Perkiraan dari resep sekarang</span>
              <span className="tabular-nums">{rupiah(cost.total)}</span>
            </div>
            {cost.byCategory.map(([cat, amount]) => (
              <div key={cat} className="flex justify-between gap-3 text-stone-600">
                <span>{cat}</span>
                <span className="tabular-nums">{rupiah(amount)}</span>
              </div>
            ))}
            {(menu.pack_qty ?? 1) !== 1 && (
              <p className="mt-1 text-xs text-stone-500">
                Bahan sudah dikali isi {menu.pack_qty} per penjualan (resep dihitung per 1 {menu.stock_unit}).
                Bahan yang ditandai &quot;sekali per penjualan&quot; tidak dikali.
              </p>
            )}
          </div>}
          {!member && recordedTotal !== null && costGap > 0.02 && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900">
              <p className="text-xs">
                Dua angka ini beda karena HPP tercatat dihitung saat produksi (harga bahan dan resep waktu itu,
                dirata-rata dengan stok yang masih ada, dan bahan yang belum pernah dibeli dihitung Rp0),
                sedangkan perkiraan memakai resep dan harga bahan sekarang.
              </p>
              {isHolder ? (
                <button className={`${btnCls} w-full`} onClick={syncCost}>
                  Samakan HPP stok dengan resep sekarang
                </button>
              ) : (
                <p className="text-xs font-medium">Stok varian ini disatukan, samakan HPP-nya dari resep varian pemegang stok.</p>
              )}
            </div>
          )}
        </div>
      )}

      {!member && otherVariants.length > 0 && recipe.length === 0 && (
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Jumlah dipakai{sel ? ` (${sel.unit})` : ""}</Label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Contoh: 1"
            />
          </div>
          <div>
            <Label>Untuk berapa {perSale || member ? "penjualan" : menu.stock_unit}</Label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={forPcs}
              onChange={(e) => setForPcs(e.target.value)}
              placeholder="1"
            />
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Kosongkan kolom kedua kalau jumlahnya sudah per 1. Untuk barang yang dipakai sedikit-sedikit, isi
          misalnya 1 pasang handgloves untuk 50: sistem menghitung 0,02 per satuan.
        </p>
        {effQty > 0 && sel && (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900">
            Masuk resep: {fmt(Math.round(effQty * 10000) / 10000)} {sel.unit}, biaya {rupiah(effQty * sel.avg_cost)}
          </div>
        )}
        {member ? (
          <p className="text-xs text-stone-500">
            Bahan di sini selalu dihitung sekali per penjualan (tidak dikali isi), misalnya box atau stiker untuk menu ini.
          </p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={perSale} onChange={(e) => setPerSale(e.target.checked)} />
          <span>
            Dipakai sekali per penjualan{tracked ? " (bukan saat produksi)" : ""}
            <span className="block text-xs text-stone-500">
              Centang untuk box, kantong, atau stiker yang dipasang per kotak yang terjual, berapa pun isinya.
              {(menu.pack_qty ?? 1) !== 1 ? ` Tanpa centang, jumlahnya dikali isi ${menu.pack_qty}.` : ""}
              {tracked ? ` Tanpa centang, bahan ini dipotong saat produksi dan ikut HPP per ${menu.stock_unit}.` : ""}
            </span>
          </span>
        </label>
        )}
        {!tracked && (
          <p className="text-xs text-stone-500">
            Menu ini dibuat saat dipesan: bahan dipotong tiap kali terjual, sebanyak resep per {menu.stock_unit} x isi
            {(menu.pack_qty ?? 1) !== 1 ? ` (${menu.pack_qty})` : ""}.
          </p>
        )}
        <button className={`${btnCls} w-full`} onClick={addLine}>{member ? "Tambah bahan per penjualan" : "Tambah ke resep"}</button>
      </div>
    </div>
  );
}
