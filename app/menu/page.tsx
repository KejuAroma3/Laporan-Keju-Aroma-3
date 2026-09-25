"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, pct, rupiah } from "@/lib/format";
import type { Ingredient, MenuItem, RecipeItem } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import PhotoUpload from "@/components/PhotoUpload";

export default function MenuPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [m, i, r] = await Promise.all([
      supabase.from("menu_items").select("*").order("category").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipe_items").select("*"),
    ]);
    const err = [m, i, r].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });
    setMenus((m.data ?? []) as MenuItem[]);
    setIngs((i.data ?? []) as Ingredient[]);
    setRecipes((r.data ?? []) as RecipeItem[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const cost = (id: string) =>
    recipes
      .filter((r) => r.menu_item_id === id)
      .reduce((s, r) => s + r.qty * (ings.find((i) => i.id === r.ingredient_id)?.avg_cost ?? 0), 0);

  async function add() {
    if (!name.trim() || !(Number(price) > 0)) {
      setMsg({ type: "err", text: "Isi nama menu dan harga jual." });
      return;
    }
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ name: name.trim(), category: category.trim() || null, price: Number(price) })
      .select("id")
      .single();
    if (error) {
      setMsg({ type: "err", text: error.message.includes("duplicate") ? "Nama menu sudah ada." : error.message });
      return;
    }
    setName(""); setCategory(""); setPrice("");
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

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Tambah menu</h2>
        <div>
          <Label>Nama menu</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Es kopi susu" />
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
        <button className={`${btnCls} w-full`} onClick={add}>Tambah menu</button>
      </Card>

      {menus.length === 0 ? (
        <Empty>Belum ada menu.</Empty>
      ) : (
        <div className="space-y-2">
          {menus.map((m) => {
            const hpp = cost(m.id);
            const hasRecipe = recipes.some((r) => r.menu_item_id === m.id);
            return (
              <Card key={m.id} className={m.is_active ? "" : "opacity-60"}>
                <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <Thumb url={m.photo_url} name={m.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {m.name} {!m.is_active && <span className="text-xs font-normal text-stone-500">(disembunyikan)</span>}
                    </div>
                    <div className="text-sm text-stone-500">
                      {m.category || "Tanpa kategori"}, {rupiah(m.price)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {hasRecipe ? (
                      <>
                        <div className="font-semibold tabular-nums">HPP {rupiah(hpp)}</div>
                        <div className="text-teal-800">margin {pct(m.price - hpp, m.price)}</div>
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
                    recipe={recipes.filter((r) => r.menu_item_id === m.id)}
                    onChanged={(x) => { if (x) setMsg(x); load(); }}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuEditor({
  menu,
  ings,
  recipe,
  onChanged,
}: {
  menu: MenuItem;
  ings: Ingredient[];
  recipe: RecipeItem[];
  onChanged: (m: Msg) => void;
}) {
  const [name, setName] = useState(menu.name);
  const [price, setPrice] = useState(String(menu.price));
  const [category, setCategory] = useState(menu.category ?? "");
  const [ing, setIng] = useState("");
  const [qty, setQty] = useState("");
  const sel = ings.find((i) => i.id === ing);

  // Fungsi pembantu untuk membaca teks matematika seperti "490 / 140"
  function parseMathInput(val: string): number {
    try {
      const sanitized = val.replace(/,/g, '.').replace(/[^0-9+\-*/().]/g, '');
      const result = Function('"use strict";return (' + sanitized + ')')();
      return isNaN(result) ? 0 : result;
    } catch {
      return 0;
    }
  }

  async function savePhoto(url: string | null) {
    const { error } = await supabase.from("menu_items").update({ photo_url: url }).eq("id", menu.id);
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: url ? "Foto tersimpan." : "Foto dihapus." });
  }

  async function saveInfo() {
    if (!name.trim()) {
      onChanged({ type: "err", text: "Nama menu tidak boleh kosong." });
      return;
    }
    const { error } = await supabase
      .from("menu_items")
      .update({ name: name.trim(), price: Number(price) || 0, category: category.trim() || null })
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
    const calculatedQty = parseMathInput(qty);
    if (!ing || !(calculatedQty > 0)) {
      onChanged({ type: "err", text: "Pilih bahan dan isi jumlah per porsi dengan benar." });
      return;
    }
    const { error } = await supabase
      .from("recipe_items")
      .upsert({ menu_item_id: menu.id, ingredient_id: ing, qty: calculatedQty }, { onConflict: "menu_item_id,ingredient_id" });
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

  return (
    <div className="mt-4 space-y-4 border-t border-stone-100 pt-4">
      <div>
        <Label>Foto produk</Label>
        <PhotoUpload value={menu.photo_url} onChange={savePhoto} pathPrefix={menu.id} />
      </div>

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
      <button className={`${btnGhostCls} w-full`} onClick={toggleActive}>
        {menu.is_active ? "Sembunyikan dari halaman Jual" : "Tampilkan di halaman Jual"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button className={`${btnGhostCls} text-red-700`} onClick={removeMenu}>Hapus menu</button>
        <button className={btnCls} onClick={saveInfo}>Simpan</button>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Resep per 1 porsi</h3>
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

      <div className="space-y-3 rounded-xl bg-stone-50 p-3">
        <select className={inputCls} value={ing} onChange={(e) => setIng(e.target.value)}>
          <option value="">Pilih bahan…</option>
          {ings.map((i) => (
            <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          className={inputCls}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={sel ? `Jumlah per porsi (${sel.unit}), cth: 490/140` : "Jumlah per porsi (bisa ketik 490/140)"}
        />
        <button className={`${btnCls} w-full`} onClick={addLine}>Tambah ke resep</button>
      </div>
    </div>
  );
}