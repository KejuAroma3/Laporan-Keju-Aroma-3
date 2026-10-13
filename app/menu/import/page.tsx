"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/csv";
import { todayJkt } from "@/lib/format";
import { menuHpp } from "@/lib/menucost";
import { EMPTY_TEMPLATE, buildExport, planImport, type PlanRow } from "@/lib/menuimport";
import { resolveSharedStock } from "@/lib/production";
import type { Channel, Ingredient, MenuItem, ProductGroup, ProductStockRow, RecipeItem } from "@/lib/types";
import type { PriceMap } from "@/lib/platformprice";
import { Card, Notice, PageTitle, btnCls, btnGhostCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

const CHANNELS: Channel[] = ["gofood", "grabfood", "shopeefood"];

export default function ImportMenuPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [stock, setStock] = useState<Record<string, ProductStockRow>>({});
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    const [m, g, p, r, i, s] = await Promise.all([
      supabase.from("menu_items").select("*").order("category").order("name"),
      supabase.from("product_groups").select("*"), // boleh gagal jika supabase/13-varian-produk.sql belum dijalankan
      supabase.from("menu_prices").select("menu_item_id, channel, price"), // boleh gagal jika supabase/19 belum dijalankan
      supabase.from("recipe_items").select("*"),
      supabase.from("ingredients").select("*"),
      supabase.from("v_product_stock").select("*"), // boleh gagal jika supabase/9-stok-produk.sql belum dijalankan
    ]);
    if (m.error) setMsg({ type: "err", text: m.error.message });
    const gl = (g.data ?? []) as ProductGroup[];
    setMenus((m.data ?? []) as MenuItem[]);
    setGroups(gl);
    const map: PriceMap = {};
    if (!p.error) {
      for (const x of (p.data ?? []) as { menu_item_id: string; channel: Channel; price: number }[]) {
        (map[x.menu_item_id] ??= {})[x.channel] = Number(x.price);
      }
    }
    setPrices(map);
    setRecipes((r.data ?? []) as RecipeItem[]);
    setIngs((i.data ?? []) as Ingredient[]);
    setStock(resolveSharedStock((s.data ?? []) as ProductStockRow[], gl));
  }
  useEffect(() => { load(); }, []);

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const valid = rows.filter((r) => !r.error && r.changes.length > 0);
  const same = rows.filter((r) => !r.error && r.changes.length === 0);
  const invalid = rows.filter((r) => r.error);

  function exportMenus() {
    const data = buildExport(menus, groupNameById, prices, (m) => menuHpp(m, menus, recipes, ings, stock, groups));
    downloadCsv(`menu-${todayJkt()}.csv`, data, ";");
  }

  function onFile(file: File) {
    setResult(null);
    setMsg(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const plan = planImport(String(reader.result ?? ""), menus, groupNameById, prices);
      setRows(plan.rows);
      if (plan.rows.length === 0) setMsg({ type: "err", text: "File kosong atau formatnya tidak dikenali." });
    };
    reader.onerror = () => setMsg({ type: "err", text: "Gagal membaca file." });
    reader.readAsText(file, "utf-8");
  }

  async function submit() {
    if (valid.length === 0) return;
    setBusy(true);
    setMsg(null);
    const problems: string[] = [];
    try {
      // 1. produk dasar: pakai yang sudah ada (nama tidak membedakan huruf besar/kecil), buat kalau belum ada
      const groupId = new Map<string, string>(groups.map((g) => [g.name.trim().toLowerCase(), g.id]));
      for (const name of new Set(valid.map((r) => r.group).filter((x): x is string => !!x))) {
        if (groupId.has(name.toLowerCase())) continue;
        const { data, error } = await supabase.from("product_groups").insert({ name }).select("id").single();
        if (error || !data) throw new Error(`Produk dasar "${name}": ${error?.message ?? "gagal dibuat"}`);
        groupId.set(name.toLowerCase(), data.id as string);
      }
      const gid = (r: PlanRow) => (r.group ? groupId.get(r.group.toLowerCase()) ?? null : undefined);

      // 2. menu baru (satu insert, kunci seragam)
      const fresh = valid.filter((r) => !r.existing);
      const idByName = new Map<string, string>();
      for (const m of menus) idByName.set(m.name.trim().toLowerCase(), m.id);
      if (fresh.length > 0) {
        const withPack = fresh.some((r) => r.pack !== undefined && r.pack !== 1);
        const payload = fresh.map((r) => ({
          name: r.name,
          category: r.category ?? null,
          price: r.price!,
          product_group_id: gid(r) ?? null,
          variant_name: r.variant ?? null,
          is_active: r.active ?? true,
          ...(withPack ? { pack_qty: r.pack ?? 1 } : {}),
        }));
        const { data, error } = await supabase.from("menu_items").insert(payload).select("id, name");
        if (error) throw new Error(/pack_qty/.test(error.message) ? "Kolom isi belum aktif. Jalankan supabase/15-isi-per-penjualan.sql, lalu coba lagi." : error.message);
        for (const x of (data ?? []) as { id: string; name: string }[]) idByName.set(x.name.trim().toLowerCase(), x.id);
      }

      // 3. menu yang sudah ada: ubah hanya kolom yang diisi di file
      const updates = valid.filter((r) => r.existing);
      for (let i = 0; i < updates.length; i += 10) {
        const results = await Promise.all(
          updates.slice(i, i + 10).map(async (r) => {
            const patch: Record<string, unknown> = {};
            if (r.price !== undefined) patch.price = r.price;
            if (r.category !== undefined) patch.category = r.category;
            if (r.group !== undefined) patch.product_group_id = gid(r);
            if (r.variant !== undefined) patch.variant_name = r.variant;
            if (r.pack !== undefined) patch.pack_qty = r.pack;
            if (r.active !== undefined) patch.is_active = r.active;
            if (Object.keys(patch).length === 0) return null;
            const { error } = await supabase.from("menu_items").update(patch).eq("id", r.existing!.id);
            return error ? `${r.name}: ${error.message}` : null;
          })
        );
        problems.push(...results.filter((x): x is string => !!x));
      }

      // 4. harga per platform
      const upserts: { menu_item_id: string; channel: Channel; price: number }[] = [];
      const clears = new Map<Channel, string[]>();
      for (const r of valid) {
        const id = idByName.get(r.name.trim().toLowerCase());
        if (!id) continue;
        for (const c of CHANNELS) {
          const v = r.prices[c];
          if (v === undefined) continue;
          if (v > 0) upserts.push({ menu_item_id: id, channel: c, price: v });
          else clears.set(c, [...(clears.get(c) ?? []), id]);
        }
      }
      const priceErr: string[] = [];
      if (upserts.length > 0) {
        const { error } = await supabase.from("menu_prices").upsert(upserts, { onConflict: "menu_item_id,channel" });
        if (error) priceErr.push(error.message);
      }
      for (const [c, ids] of clears) {
        const { error } = await supabase.from("menu_prices").delete().eq("channel", c).in("menu_item_id", ids);
        if (error) priceErr.push(error.message);
      }
      if (priceErr.length > 0) {
        problems.push(
          /menu_prices/.test(priceErr[0])
            ? "Harga per platform belum aktif: jalankan supabase/19-harga-per-platform.sql di Supabase, lalu unggah ulang file yang sama (menu yang sudah masuk tidak akan digandakan)."
            : priceErr[0]
        );
      }
    } catch (e) {
      setBusy(false);
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mengimpor." });
      await load();
      return;
    }
    setBusy(false);
    await load();
    setRows([]);
    setFileName("");
    if (problems.length > 0) {
      setMsg({ type: "err", text: `Sebagian gagal: ${problems.slice(0, 3).join(" | ")}` });
    }
    setResult(
      `${valid.length} baris diproses (${valid.filter((r) => !r.existing).length} menu baru, ${valid.filter((r) => r.existing).length} diperbarui).` +
        (same.length > 0 ? ` ${same.length} baris tanpa perubahan dilewati.` : "") +
        (invalid.length > 0 ? ` ${invalid.length} baris dilewati karena datanya tidak valid.` : "")
    );
  }

  return (
    <div>
      <PageTitle sub="Unduh daftar menu lengkap dengan harga, ubah di Excel, lalu unggah lagi untuk memperbarui atau menambah menu.">
        Impor / ekspor menu
      </PageTitle>
      <Notice msg={msg} />

      <OwnerOnly feature="menu">
        <Card className="mb-4 space-y-3">
          <h2 className="font-semibold">Langkah 1: unduh daftar menu</h2>
          <p className="text-sm text-stone-500">
            Berisi nama, kategori, produk dasar, varian, isi per penjualan, harga Offline, GoFood, GrabFood,
            ShopeeFood, dan status tampil. Kolom HPP hanya sebagai patokan menentukan harga dan tidak ikut diimpor.
          </p>
          <button className={`${btnCls} w-full`} onClick={exportMenus} disabled={menus.length === 0}>
            Unduh {menus.length} menu (CSV untuk Excel)
          </button>
          <button className={`${btnGhostCls} w-full`} onClick={() => downloadCsv("format-menu.csv", EMPTY_TEMPLATE, ";")}>
            Unduh contoh format kosong
          </button>
        </Card>

        <Card className="mb-4 space-y-3">
          <h2 className="font-semibold">Langkah 2: ubah di Excel, unggah kembali</h2>
          <button className={`${btnGhostCls} w-full`} onClick={() => inputRef.current?.click()}>
            {fileName || "Pilih file CSV…"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) onFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <ul className="list-disc space-y-1 pl-5 text-xs text-stone-500">
            <li>Simpan dari Excel sebagai <b>CSV (pemisah koma atau titik koma)</b>, jangan ganti nama kolom.</li>
            <li>Menu dicocokkan lewat <b>nama</b>: nama yang sudah ada diperbarui, nama baru ditambahkan.</li>
            <li>Kolom yang <b>dikosongkan atau dihapus</b> tidak mengubah apa pun. Untuk menghapus harga khusus sebuah platform (ikut harga dasar), isi <b>0</b>.</li>
            <li>Menu baru wajib punya harga_offline. Produk dasar yang belum ada dibuat otomatis.</li>
            <li>Resep, foto, dan stok tidak diubah lewat file ini.</li>
          </ul>
        </Card>

        {rows.length > 0 && (
          <Card className="mb-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Pratinjau</h2>
              <span className="text-right text-sm text-stone-500">
                {valid.length} akan diproses
                {same.length > 0 ? `, ${same.length} tanpa perubahan` : ""}
                {invalid.length > 0 ? `, ${invalid.length} bermasalah` : ""}
              </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <ul className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <li key={r.line} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`truncate ${r.error || r.changes.length === 0 ? "text-stone-400" : "font-medium"}`}>
                        Baris {r.line}: {r.name || "(tanpa nama)"}
                      </span>
                      {!r.error && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.changes.length === 0
                              ? "bg-stone-100 text-stone-500"
                              : r.existing
                                ? "bg-amber-100 text-amber-800"
                                : "bg-brand-100 text-brand-900"
                          }`}
                        >
                          {r.changes.length === 0 ? "sama" : r.existing ? "ubah" : "baru"}
                        </span>
                      )}
                    </div>
                    {r.error && <p className="text-xs font-medium text-red-700">{r.error}</p>}
                    {!r.error && r.changes.length > 0 && <p className="text-xs text-stone-500">{r.changes.join("; ")}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <button className={`${btnCls} mt-4 w-full`} onClick={submit} disabled={busy || valid.length === 0}>
              {busy ? "Memproses…" : `Terapkan ${valid.length} perubahan`}
            </button>
          </Card>
        )}

        {result && (
          <Card className="space-y-3">
            <p className="text-sm font-medium text-brand-800">{result}</p>
            <Link href="/menu" className={`${btnCls} block text-center`}>
              Lihat daftar menu
            </Link>
          </Card>
        )}
      </OwnerOnly>
    </div>
  );
}
