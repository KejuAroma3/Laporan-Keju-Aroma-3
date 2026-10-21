"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmt, rupiah } from "@/lib/format";
import { groupByProduct } from "@/lib/group";
import type { Channel, Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "@/lib/types";
import PlatformPrices from "@/components/PlatformPrices";
import { menuHpp } from "@/lib/menucost";
import type { PriceMap } from "@/lib/platformprice";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, SearchInput, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import PhotoUpload from "@/components/PhotoUpload";
import { resolveSharedStock } from "@/lib/production";
import OwnerOnly from "@/components/OwnerOnly";
import { fetchBundles, saveBundle, type BundleMap, type BundlePart } from "@/lib/bundles";

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
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [stock, setStock] = useState<Record<string, ProductStockRow>>({});
  const [bundles, setBundles] = useState<BundleMap>({}); // isi menu paket (supabase/30-menu-paket.sql)
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [variantName, setVariantName] = useState("");
  const [pack, setPack] = useState("1");
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [m, r, s, g, i, pr] = await Promise.all([
      supabase.from("menu_items").select("*").order("category").order("name"),
      supabase.from("recipe_items").select("*"),
      supabase.from("v_product_stock").select("*"), // boleh gagal jika supabase/9-stok-produk.sql belum dijalankan
      supabase.from("product_groups").select("*").order("name"), // boleh gagal jika supabase/13-varian-produk.sql belum dijalankan
      supabase.from("ingredients").select("*"),
      supabase.from("menu_prices").select("menu_item_id, channel, price"), // boleh gagal jika supabase/19-harga-per-platform.sql belum dijalankan
    ]);
    const err = [m, r].find((x) => x.error)?.error;
    if (err) setMsg({ type: "err", text: err.message });
    setMenus((m.data ?? []) as MenuItem[]);
    setRecipes((r.data ?? []) as RecipeItem[]);
    setIngs((i.data ?? []) as Ingredient[]);
    const map: PriceMap = {};
    if (!pr.error) {
      for (const x of (pr.data ?? []) as { menu_item_id: string; channel: Channel; price: number }[]) {
        (map[x.menu_item_id] ??= {})[x.channel] = Number(x.price);
      }
    }
    setPrices(map);
    fetchBundles().then(setBundles);
    setGroups((g.data ?? []) as ProductGroup[]);
    setStock(resolveSharedStock((s.data ?? []) as ProductStockRow[], (g.data ?? []) as ProductGroup[]));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

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

  // HPP perkiraan; menu paket = jumlah HPP komponennya
  const hppOf = (m: MenuItem): number => {
    const parts = bundles[m.id];
    if (parts?.length) {
      return parts.reduce((t, p) => {
        const c = menus.find((x) => x.id === p.component_id);
        return t + (c ? menuHpp(c, menus, recipes, ings, stock, groups) * p.qty : 0);
      }, 0);
    }
    return menuHpp(m, menus, recipes, ings, stock, groups);
  };

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
        // hanya dikirim kalau bukan 1, supaya tetap jalan sebelum supabase/15-isi-per-penjualan.sql dijalankan
        ...(Number(pack) > 0 && Number(pack) !== 1 ? { pack_qty: Number(pack) } : {}),
      })
      .select("id")
      .single();
    if (error) {
      setMsg({ type: "err", text: error.message.includes("duplicate") ? "Nama menu sudah ada." : error.message });
      return;
    }
    setName(""); setCategory(""); setPrice(""); setProductGroup(""); setVariantName(""); setPack("1");
    setMsg({ type: "ok", text: "Menu ditambahkan. Lengkapi foto di bawah, lalu isi bahannya di Lainnya › Resep agar HPP dan stok terhitung." });
    setOpen(data?.id ?? null);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <PageTitle sub="Nama, harga jual, kategori, varian, dan foto. Bahan dan HPP diatur di Resep.">
          Menu
        </PageTitle>
        <div className="flex shrink-0 gap-2">
          <Link href="/menu/order" className={`${btnGhostCls} h-10 px-3 text-sm`}>
            Atur urutan
          </Link>
          <Link href="/menu/import" className={`${btnGhostCls} h-10 px-3 text-sm`}>
            Impor / ekspor
          </Link>
        </div>
      </div>
      <Notice msg={msg} />

      <OwnerOnly feature="menu">
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
        <div>
          <Label>Isi per penjualan (pcs stok)</Label>
          <input type="number" inputMode="decimal" className={inputCls} value={pack} onChange={(e) => setPack(e.target.value)} placeholder="1" />
          <p className="mt-1 text-xs text-stone-500">
            Berapa pcs dari stok produk yang keluar tiap 1 kali terjual. Contoh: &quot;isi 5&quot; diisi 5,
            &quot;Hampers isi 15&quot; diisi 15. Kalau satu penjualan = 1 pcs, biarkan 1. Harga jual di atas
            adalah harga per penjualan (per kotak), bukan per pcs.
          </p>
        </div>
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
                      const mine = recipes.filter((r) => r.menu_item_id === m.id);
                      const onlyPerSale = mine.length > 0 && mine.every((r) => r.per_sale);
                      const hasRecipe = mine.length > 0 || (stock[m.id]?.track_stock ?? false);
                      const st = stock[m.id];
                      const tracked = st?.track_stock ?? false;
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
                                {m.category || "Tanpa kategori"}{bundles[m.id]?.length ? ", paket" : (m.pack_qty ?? 1) !== 1 ? `, isi ${m.pack_qty}` : ""}
                              </div>
                              {tracked && (
                                <div className={`text-xs font-medium ${st.is_low ? "text-red-700" : "text-stone-400"}`}>
                                  Stok produk: {fmt(st.stock_on_hand)} {st.stock_unit}{st.is_low ? ", segera produksi lagi" : ""}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right text-sm">
                              <div className="font-semibold tabular-nums">{rupiah(m.price)}</div>
                              {hasRecipe ? (
                                <div className={`text-xs ${onlyPerSale && !(stock[m.id]?.track_stock) ? "font-medium text-amber-700" : "text-stone-400"}`}>
                                  {onlyPerSale && !(stock[m.id]?.track_stock) ? "hanya bahan per penjualan" : "resep ada"}
                                </div>
                              ) : (
                                <div className="text-xs font-medium text-amber-700">Resep kosong</div>
                              )}
                            </div>
                          </button>
                          {open === m.id && (
                            <MenuEditor
                              key={m.id}
                              menu={m}
                              groups={groups}
                              hpp={hppOf(m)}
                              allMenus={menus}
                              parts={bundles[m.id] ?? []}
                              hppOf={hppOf}
                              savedPrices={prices[m.id] ?? {}}
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
  groups,
  hpp,
  allMenus,
  parts,
  hppOf,
  savedPrices,
  onChanged,
}: {
  allMenus: MenuItem[];
  parts: BundlePart[];
  hppOf: (m: MenuItem) => number;
  menu: MenuItem;
  groups: ProductGroup[];
  hpp: number;
  savedPrices: Partial<Record<Channel, number>>;
  onChanged: (m: Msg) => void;
}) {
  const [name, setName] = useState(menu.name);
  const [price, setPrice] = useState(String(menu.price));
  const [category, setCategory] = useState(menu.category ?? "");
  const [minStock, setMinStock] = useState(String(menu.min_product_stock));
  const [stockUnit, setStockUnit] = useState(menu.stock_unit);
  const [productGroup, setProductGroup] = useState(groups.find((g) => g.id === menu.product_group_id)?.name ?? "");
  const [variantName, setVariantName] = useState(menu.variant_name ?? "");
  const [pack, setPack] = useState(String(menu.pack_qty ?? 1));

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
        ...(Number(pack) > 0 && Number(pack) !== (menu.pack_qty ?? 1) ? { pack_qty: Number(pack) } : {}),
      })
      .eq("id", menu.id);
    if (error) {
      const msg =
        error.code === "23505"
          ? "Nama menu sudah dipakai produk lain."
          : /pack_qty/.test(error.message)
            ? "Kolom isi belum aktif. Jalankan supabase/15-isi-per-penjualan.sql di Supabase (SQL Editor), lalu coba lagi."
            : error.message;
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

  // Salin menu: buat menu baru dengan data yang sama (dan, kalau dipilih, resep + harga platform).
  async function copyMenu() {
    const newName = prompt("Nama menu salinan:", `${menu.name} (salinan)`)?.trim();
    if (!newName) return;
    const withRecipe = confirm("Salin juga resep dan harga per platform ke menu baru?\n\nOK = ya, Batal = hanya data menu.");
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: newName,
        category: menu.category,
        price: menu.price,
        product_group_id: menu.product_group_id,
        variant_name: menu.variant_name,
        photo_url: menu.photo_url,
        stock_unit: menu.stock_unit,
        min_product_stock: menu.min_product_stock,
        ...((menu.pack_qty ?? 1) !== 1 ? { pack_qty: menu.pack_qty } : {}),
      })
      .select("id")
      .single();
    if (error || !data) {
      onChanged({ type: "err", text: error?.code === "23505" ? "Nama menu sudah ada, pakai nama lain." : error?.message ?? "Gagal menyalin menu." });
      return;
    }
    let note = "";
    if (withRecipe) {
      const r = await supabase.from("recipe_items").select("*").eq("menu_item_id", menu.id);
      if (!r.error && (r.data ?? []).length > 0) {
        // semua baris berasal dari tabel yang sama sehingga kuncinya seragam
        const rows = (r.data as Record<string, unknown>[]).map((x) => {
          const { id: _id, ...rest } = x;
          void _id;
          return { ...rest, menu_item_id: data.id };
        });
        const ins = await supabase.from("recipe_items").insert(rows);
        if (ins.error) note += ` Resep gagal disalin: ${ins.error.message}.`;
      }
      const pr = await supabase.from("menu_prices").select("channel, price").eq("menu_item_id", menu.id);
      if (!pr.error && (pr.data ?? []).length > 0) {
        const ins = await supabase
          .from("menu_prices")
          .insert((pr.data as { channel: Channel; price: number }[]).map((x) => ({ ...x, menu_item_id: data.id })));
        if (ins.error) note += ` Harga platform gagal disalin: ${ins.error.message}.`;
      }
    }
    onChanged({
      type: note ? "err" : "ok",
      text: `Menu "${newName}" dibuat dari salinan.${note || " Stok produksinya mulai dari nol; catat produksinya di Stok › Produksi."}`,
    });
  }

  async function toggleActive() {
    const { error } = await supabase.from("menu_items").update({ is_active: !menu.is_active }).eq("id", menu.id);
    onChanged(error ? { type: "err", text: error.message } : { type: "ok", text: menu.is_active ? "Menu disembunyikan dari halaman jual." : "Menu ditampilkan kembali." });
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
      <div>
        <Label>Isi per penjualan (pcs stok)</Label>
        <input type="number" inputMode="decimal" className={inputCls} value={pack} onChange={(e) => setPack(e.target.value)} />
        <p className="mt-1 text-xs text-stone-500">
          Jumlah pcs stok produk yang keluar tiap 1 kali terjual (isi 5 diisi 5, hampers isi 15 diisi 15).
          Biarkan 1 kalau satu penjualan = 1 pcs.
        </p>
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
      <BundleEditor key={`b-${menu.id}-${JSON.stringify(parts)}`} menu={menu} allMenus={allMenus} parts={parts} hppOf={hppOf} onChanged={onChanged} />
      <PlatformPrices key={`${menu.id}-${JSON.stringify(savedPrices)}`} menu={menu} hpp={hpp} saved={savedPrices} onChanged={onChanged} />
      <button className={`${btnGhostCls} w-full`} onClick={copyMenu}>
        Salin menu ini
      </button>
      <button className={`${btnGhostCls} w-full`} onClick={toggleActive}>
        {menu.is_active ? "Sembunyikan dari halaman Jual" : "Tampilkan di halaman Jual"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button className={`${btnGhostCls} text-red-700`} onClick={removeMenu}>Hapus menu</button>
        <button className={btnCls} onClick={saveInfo}>Simpan</button>
      </div>

      <Link href={`/recipes?menu=${menu.id}`} className={`${btnGhostCls} block w-full text-center`}>
        Atur resep menu ini
      </Link>
    </div>
  );
}

// Isi menu paket: menu lain yang ikut terjual tiap paket ini laku (stok tiap komponen ikut berkurang).
function BundleEditor({
  menu,
  allMenus,
  parts,
  hppOf,
  onChanged,
}: {
  menu: MenuItem;
  allMenus: MenuItem[];
  parts: BundlePart[];
  hppOf: (m: MenuItem) => number;
  onChanged: (m: Msg) => void;
}) {
  const [rows, setRows] = useState<{ id: string; qty: string }[]>(parts.map((p) => ({ id: p.component_id, qty: String(p.qty) })));
  const [open, setOpen] = useState(parts.length > 0);
  const [busy, setBusy] = useState(false);
  const options = allMenus.filter((m) => m.id !== menu.id && m.is_active);
  const nameOf = (m: MenuItem) => `${m.name}${m.variant_name ? ` (${m.variant_name})` : ""}`;
  const cost = rows.reduce((t, r) => {
    const c = allMenus.find((m) => m.id === r.id);
    return t + (c ? hppOf(c) * (Number(r.qty) || 0) : 0);
  }, 0);

  async function save() {
    const clean = rows.filter((r) => r.id);
    const ids = clean.map((r) => r.id);
    if (new Set(ids).size !== ids.length) return onChanged({ type: "err", text: "Satu menu hanya boleh sekali di daftar isi paket. Naikkan jumlahnya saja." });
    if (clean.some((r) => !(Number(r.qty) > 0))) return onChanged({ type: "err", text: "Jumlah tiap isi paket harus lebih dari 0." });
    setBusy(true);
    const err = await saveBundle(menu.id, clean.map((r) => ({ component_id: r.id, qty: Number(r.qty) })));
    setBusy(false);
    onChanged(err ? { type: "err", text: err } : { type: "ok", text: clean.length ? "Isi paket tersimpan. Penjualan berikutnya memotong stok tiap isi paket." : "Menu ini kembali jadi menu biasa." });
  }

  if (!open) {
    return (
      <button type="button" className={`${btnGhostCls} w-full`} onClick={() => { setOpen(true); if (rows.length === 0) setRows([{ id: "", qty: "1" }]); }}>
        Jadikan menu paket (isi beberapa menu)
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-stone-200 p-3">
      <div>
        <h3 className="text-sm font-semibold">Isi paket</h3>
        <p className="text-xs text-stone-500">
          Tiap paket terjual, stok semua menu di bawah berkurang (jumlah × isi per penjualan masing-masing). Harga jual paket
          tetap satu angka di atas, HPP paket = jumlah HPP isinya. &quot;Isi per penjualan&quot; menu paket ini tidak dipakai.
        </p>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select className={`${inputCls} min-w-0 flex-1`} value={r.id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
            <option value="">Pilih menu…</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{nameOf(m)}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            className={`${inputCls} w-16 shrink-0`}
            value={r.qty}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            aria-label="Jumlah"
          />
          <button type="button" className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Hapus isi">×</button>
        </div>
      ))}
      <button type="button" className={`${btnGhostCls} w-full`} onClick={() => setRows([...rows, { id: "", qty: "1" }])}>+ Tambah isi paket</button>
      {rows.some((r) => r.id) && (
        <p className="text-xs text-stone-500">Perkiraan HPP paket: {rupiah(cost)}{menu.price > 0 ? `, laba kotor ${rupiah(menu.price - cost)}` : ""}</p>
      )}
      <button type="button" className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : rows.some((r) => r.id) ? "Simpan isi paket" : "Simpan (jadi menu biasa)"}
      </button>
    </div>
  );
}
