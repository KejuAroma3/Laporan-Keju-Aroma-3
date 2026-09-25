"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, rupiah, todayJkt } from "@/lib/format";
import type { Channel, MenuItem } from "@/lib/types";
import { Card, Label, Notice, PageTitle, btnCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";

type Line = { qty: number; price: number };
const ONLINE_CHANNELS: Channel[] = ["gofood", "grabfood", "shopeefood"];

export default function SaleForm({ mode }: { mode: "offline" | "online" }) {
  const online = mode === "online";
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [channel, setChannel] = useState<Channel>(online ? "gofood" : "offline");
  const [date, setDate] = useState(todayJkt());
  const [discount, setDiscount] = useState("");
  const [fee, setFee] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name");
    if (error) setMsg({ type: "err", text: error.message });
    else setMenus((data ?? []) as MenuItem[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  function change(m: MenuItem, delta: number) {
    setCart((c) => {
      const cur = c[m.id] ?? { qty: 0, price: m.price };
      const qty = Math.max(0, cur.qty + delta);
      const next = { ...c };
      if (qty === 0) delete next[m.id];
      else next[m.id] = { ...cur, qty };
      return next;
    });
  }

  function setPrice(id: string, price: number) {
    setCart((c) => (c[id] ? { ...c, [id]: { ...c[id], price } } : c));
  }

  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, l]) => s + l.qty * l.price, 0);
  const portions = lines.reduce((s, [, l]) => s + l.qty, 0);
  const net = total - (Number(discount) || 0) - (Number(fee) || 0);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const map = new Map<string, MenuItem[]>();
    for (const m of menus) {
      if (term && !m.name.toLowerCase().includes(term)) continue;
      const key = m.category || "Lainnya";
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return Array.from(map.entries());
  }, [menus, q]);

  async function submit() {
    if (lines.length === 0) {
      setMsg({ type: "err", text: "Pilih minimal 1 menu." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const soldAt = online
      ? new Date(`${date}T12:00:00+07:00`).toISOString()
      : new Date().toISOString();
    const { error } = await supabase.rpc("record_sale", {
      p_channel: channel,
      p_discount: Number(discount) || 0,
      p_fee: Number(fee) || 0,
      p_sold_at: soldAt,
      p_items: lines.map(([id, l]) => ({ menu_item_id: id, qty: l.qty, unit_price: l.price })),
    });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setCart({});
    setDiscount("");
    setFee("");
    setMsg({ type: "ok", text: `Tersimpan. Pendapatan bersih ${rupiah(net)}.` });
  }

  return (
    <div>
      <PageTitle
        sub={
          online
            ? "Masukkan rekap satu hari dari dashboard merchant."
            : "Ketuk menu untuk menambah pesanan."
        }
      >
        {online ? "Rekap penjualan online" : "Catat penjualan"}
      </PageTitle>
      <Notice msg={msg} />

      {online && (
        <Card className="mb-4 space-y-3">
          <div>
            <Label>Platform</Label>
            <div className="grid grid-cols-3 gap-2">
              {ONLINE_CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`h-12 rounded-xl border text-sm font-semibold ${
                    channel === c
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Tanggal penjualan</Label>
            <input
              type="date"
              className={inputCls}
              value={date}
              max={todayJkt()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </Card>
      )}

      <input
        className={`${inputCls} mb-4`}
        placeholder="Cari menu…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {menus.length === 0 && (
        <p className="py-8 text-center text-sm text-stone-500">
          Belum ada menu aktif. Tambahkan dulu di Lainnya › Menu &amp; Resep.
        </p>
      )}

      {groups.map(([cat, items]) => (
        <section key={cat} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-stone-500">{cat}</h2>
          <div className="space-y-2">
            {items.map((m) => {
              const l = cart[m.id];
              return (
                <Card key={m.id} className={l ? "border-teal-600" : ""}>
                  <div className="flex items-center gap-3">
                    <Thumb url={m.photo_url} name={m.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{m.name}</div>
                      <div className="text-sm text-stone-500">{rupiah(m.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {l && (
                        <>
                          <button
                            onClick={() => change(m, -1)}
                            className="h-11 w-11 rounded-full border border-stone-300 text-xl active:bg-stone-100"
                            aria-label={`Kurangi ${m.name}`}
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-lg font-bold tabular-nums">
                            {l.qty}
                          </span>
                        </>
                      )}
                      <button
                        onClick={() => change(m, 1)}
                        className="h-11 w-11 rounded-full bg-teal-700 text-xl text-white active:bg-teal-800"
                        aria-label={`Tambah ${m.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {online && l && (
                    <div className="mt-3">
                      <Label>Harga jual di aplikasi (per porsi)</Label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={inputCls}
                        value={l.price}
                        onChange={(e) => setPrice(m.id, Number(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <Card className="sticky bottom-20 z-10 space-y-3 border-stone-300 shadow-lg">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Diskon (Rp)</Label>
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
          </div>
          {online && (
            <div>
              <Label>Komisi + promo platform (Rp)</Label>
              <input
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </div>
        <div className="flex items-end justify-between">
          <div className="text-sm text-stone-500">
            {portions} porsi, subtotal {rupiah(total)}
            <div className="text-lg font-bold text-stone-900">{rupiah(net)}</div>
          </div>
          <button className={btnCls} onClick={submit} disabled={busy || portions === 0}>
            {busy ? "Menyimpan…" : "Simpan penjualan"}
          </button>
        </div>
      </Card>
    </div>
  );
}
