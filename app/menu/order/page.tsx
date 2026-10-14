"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildSellCats, flattenIds, moveAt, type SellCat } from "@/lib/sellorder";
import type { MenuItem, ProductGroup } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, btnCls, btnGhostCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

const arrowCls = "h-9 w-9 rounded-md border border-stone-200 bg-white text-sm disabled:opacity-30";

export default function MenuOrderPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [cats, setCats] = useState<SellCat[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [m, g] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_active", true),
      supabase.from("product_groups").select("*"),
    ]);
    if (m.error) setMsg({ type: "err", text: m.error.message });
    const list = (m.data ?? []) as MenuItem[];
    setMenus(list);
    setCats(buildSellCats(list, (g.data ?? []) as ProductGroup[]));
    setDirty(false);
  }
  useEffect(() => { load(); }, []);

  const edit = (fn: (c: SellCat[]) => SellCat[]) => {
    setCats(fn);
    setDirty(true);
    setMsg(null);
  };
  const moveCat = (ci: number, d: -1 | 1) => edit((c) => moveAt(c, ci, d));
  const moveUnit = (ci: number, ui: number, d: -1 | 1) =>
    edit((c) => c.map((x, i) => (i === ci ? { ...x, units: moveAt(x.units, ui, d) } : x)));
  const moveVariant = (ci: number, ui: number, vi: number, d: -1 | 1) =>
    edit((c) =>
      c.map((x, i) =>
        i === ci ? { ...x, units: x.units.map((u, j) => (j === ui ? { ...u, menus: moveAt(u.menus, vi, d) } : u)) } : x
      )
    );

  async function save() {
    setBusy(true);
    const ids = flattenIds(cats);
    const current = new Map(menus.map((m) => [m.id, m.sell_order ?? 0]));
    const changed = ids.map((id, i) => ({ id, order: i + 1 })).filter((x) => current.get(x.id) !== x.order);
    for (let i = 0; i < changed.length; i += 10) {
      const res = await Promise.all(
        changed.slice(i, i + 10).map((x) => supabase.from("menu_items").update({ sell_order: x.order }).eq("id", x.id))
      );
      const err = res.find((r) => r.error)?.error;
      if (err) {
        setBusy(false);
        setMsg({
          type: "err",
          text: /sell_order|schema cache/i.test(err.message)
            ? "Urutan menu belum aktif. Jalankan supabase/23-urutan-menu-jual.sql di Supabase (SQL Editor), lalu coba lagi."
            : err.message,
        });
        return;
      }
    }
    setBusy(false);
    await load();
    setMsg({ type: "ok", text: "Urutan menu tersimpan. Halaman Rekap penjualan memakai urutan ini." });
  }

  return (
    <div>
      <PageTitle sub="Atur urutan kategori, produk, dan varian seperti yang tampil di halaman Rekap penjualan.">
        Atur urutan menu
      </PageTitle>
      <Notice msg={msg} />
      <OwnerOnly feature="menu">
        {cats.length === 0 ? (
          <Empty>Belum ada menu aktif.</Empty>
        ) : (
          <div className="space-y-4 pb-24">
            {cats.map((c, ci) => (
              <Card key={c.name} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 gap-1">
                    <button className={arrowCls} onClick={() => moveCat(ci, -1)} disabled={busy || ci === 0} aria-label={`Naikkan kategori ${c.name}`}>▲</button>
                    <button className={arrowCls} onClick={() => moveCat(ci, 1)} disabled={busy || ci === cats.length - 1} aria-label={`Turunkan kategori ${c.name}`}>▼</button>
                  </div>
                  <h2 className="min-w-0 flex-1 truncate font-bold">{c.name}</h2>
                  <span className="shrink-0 text-xs text-stone-500">kategori</span>
                </div>
                <ul className="space-y-2">
                  {c.units.map((u, ui) => (
                    <li key={u.key} className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 gap-1">
                          <button className={arrowCls} onClick={() => moveUnit(ci, ui, -1)} disabled={busy || ui === 0} aria-label={`Naikkan ${u.label}`}>▲</button>
                          <button className={arrowCls} onClick={() => moveUnit(ci, ui, 1)} disabled={busy || ui === c.units.length - 1} aria-label={`Turunkan ${u.label}`}>▼</button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{u.label}</div>
                          {u.groupId && <div className="text-xs text-stone-500">{u.menus.length} varian</div>}
                        </div>
                      </div>
                      {u.menus.length > 1 && (
                        <ul className="mt-2 space-y-1.5 border-t border-stone-200 pt-2">
                          {u.menus.map((m, vi) => (
                            <li key={m.id} className="flex items-center gap-2 pl-4">
                              <div className="flex shrink-0 gap-1">
                                <button className={arrowCls} onClick={() => moveVariant(ci, ui, vi, -1)} disabled={busy || vi === 0} aria-label={`Naikkan ${m.name}`}>▲</button>
                                <button className={arrowCls} onClick={() => moveVariant(ci, ui, vi, 1)} disabled={busy || vi === u.menus.length - 1} aria-label={`Turunkan ${m.name}`}>▼</button>
                              </div>
                              <span className="min-w-0 flex-1 truncate text-sm">{m.variant_name || m.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-3 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">
              <Link href="/menu" className={`${btnGhostCls} text-center`}>Kembali</Link>
              <button className={btnCls} onClick={save} disabled={busy || !dirty}>
                {busy ? "Menyimpan…" : dirty ? "Simpan urutan" : "Belum ada perubahan"}
              </button>
            </div>
          </div>
        )}
      </OwnerOnly>
    </div>
  );
}
