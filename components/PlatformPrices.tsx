"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, pct, rupiah } from "@/lib/format";
import { ONLINE_CHANNELS, marginAt, suggestPrice } from "@/lib/platformprice";
import type { Channel, MenuItem } from "@/lib/types";
import { Label, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

const KEY = "harga-platform-pengaturan";
type Cfg = { commission: Record<string, string>; target: string };
const DEFAULT: Cfg = { commission: { gofood: "20", grabfood: "20", shopeefood: "20" }, target: "30" };

// Harga jual per platform untuk satu menu, dibandingkan dengan HPP. Kolom kosong = pakai harga dasar.
// Komisi (%) dan target margin hanya alat bantu hitung (disimpan di perangkat ini), bukan data penjualan.
export default function PlatformPrices({
  menu,
  hpp,
  saved,
  onChanged,
}: {
  menu: MenuItem;
  hpp: number;
  saved: Partial<Record<Channel, number>>;
  onChanged: (m: Msg) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(ONLINE_CHANNELS.map((c) => [c, saved[c] ? String(saved[c]) : ""]))
  );
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Cfg>;
        setCfg({ commission: { ...DEFAULT.commission, ...(p.commission ?? {}) }, target: p.target ?? DEFAULT.target });
      }
    } catch { /* pakai bawaan */ }
  }, []);

  function updateCfg(next: Cfg) {
    setCfg(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }

  const target = Number(cfg.target) || 0;
  const commissionOf = (c: string) => Number(cfg.commission[c]) || 0;

  function suggestAll() {
    if (hpp <= 0) return;
    setVals(Object.fromEntries(ONLINE_CHANNELS.map((c) => [c, String(suggestPrice(hpp, target, commissionOf(c)))])));
  }

  async function save() {
    setBusy(true);
    const toSet = ONLINE_CHANNELS.filter((c) => Number(vals[c]) > 0).map((c) => ({
      menu_item_id: menu.id,
      channel: c,
      price: Number(vals[c]),
    }));
    const toClear = ONLINE_CHANNELS.filter((c) => !(Number(vals[c]) > 0));
    let error = null as { message: string } | null;
    if (toSet.length > 0) error = (await supabase.from("menu_prices").upsert(toSet, { onConflict: "menu_item_id,channel" })).error;
    if (!error && toClear.length > 0)
      error = (await supabase.from("menu_prices").delete().eq("menu_item_id", menu.id).in("channel", toClear)).error;
    setBusy(false);
    if (error) {
      onChanged({
        type: "err",
        text: /menu_prices/.test(error.message)
          ? "Harga per platform belum aktif. Jalankan supabase/19-harga-per-platform.sql di Supabase (SQL Editor), lalu coba lagi."
          : error.message,
      });
      return;
    }
    onChanged({ type: "ok", text: "Harga per platform tersimpan. Berlaku untuk rekap penjualan berikutnya." });
  }

  const row = (c: Channel, price: number, editable: boolean) => {
    const m = marginAt(price, hpp, c === "offline" ? 0 : commissionOf(c));
    return (
      <div key={c} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <div className="text-sm font-medium">{CHANNEL_LABEL[c]}</div>
        <div>
          {editable ? (
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              placeholder={`${menu.price} (harga dasar)`}
              value={vals[c]}
              onChange={(e) => setVals({ ...vals, [c]: e.target.value })}
            />
          ) : (
            <div className="rounded-xl bg-stone-50 px-3 py-3 text-sm tabular-nums">{rupiah(price)} (harga dasar di atas)</div>
          )}
          {hpp > 0 && price > 0 && (
            <div className={`mt-1 text-xs ${m.profit < 0 ? "font-semibold text-red-700" : "text-stone-500"}`}>
              Laba {rupiah(m.profit)} · margin {pct(m.profit, m.net)}
              {c !== "offline" && commissionOf(c) > 0 ? ` (setelah komisi ${commissionOf(c)}%)` : ""}
              {editable && (
                <button
                  type="button"
                  className="ml-2 font-medium text-brand-800 underline"
                  onClick={() => setVals({ ...vals, [c]: String(suggestPrice(hpp, target, commissionOf(c))) })}
                >
                  Saran: {rupiah(suggestPrice(hpp, target, commissionOf(c)))}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 p-3">
      <div>
        <div className="font-semibold">Harga per platform</div>
        <p className="text-xs text-stone-500">
          Harga jual di aplikasi bisa beda dari harga offline. Kosongkan kolom kalau platform itu memakai harga dasar.
          HPP menu ini {hpp > 0 ? rupiah(hpp) : "belum ada (isi resep atau catat produksi)"} per penjualan.
        </p>
      </div>
      {row("offline", menu.price, false)}
      {ONLINE_CHANNELS.map((c) => row(c, Number(vals[c]) > 0 ? Number(vals[c]) : menu.price, true))}
      <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
        <div>
          <Label>Target margin (%)</Label>
          <input type="number" inputMode="decimal" className={inputCls} value={cfg.target} onChange={(e) => updateCfg({ ...cfg, target: e.target.value })} />
        </div>
        <div className="text-xs text-stone-500">
          Komisi platform (%), dipakai menghitung laba dan saran harga:
        </div>
        {ONLINE_CHANNELS.map((c) => (
          <div key={c}>
            <Label>{CHANNEL_LABEL[c]}</Label>
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={cfg.commission[c] ?? ""}
              onChange={(e) => updateCfg({ ...cfg, commission: { ...cfg.commission, [c]: e.target.value } })}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={btnGhostCls} onClick={suggestAll} disabled={hpp <= 0}>
          Isi semua dengan saran
        </button>
        <button type="button" className={btnCls} onClick={save} disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan harga"}
        </button>
      </div>
    </div>
  );
}
