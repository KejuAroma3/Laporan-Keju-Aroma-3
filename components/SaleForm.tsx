"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, rangeIso, rupiah, todayJkt } from "@/lib/format";
import type { Channel, MenuItem } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";

type Line = { qty: number; price: number };
type HistoryItem = { menu_item_id: string; qty: number; unit_price: number; menu_items: { name: string } | null };
type HistorySale = {
  id: string;
  sold_at: string;
  channel: Channel;
  discount: number;
  platform_fee: number;
  sale_items: HistoryItem[];
};
const RECAP_CHANNELS: Channel[] = ["offline", "gofood", "grabfood", "shopeefood"];

const timeWib = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
const summarize = (s: HistorySale) =>
  s.sale_items.map((i) => `${i.menu_items?.name ?? "Menu dihapus"} ×${i.qty}`).join(", ");
const grossOf = (s: HistorySale) => s.sale_items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);

export default function SaleForm({ mode }: { mode: "offline" | "online" }) {
  const online = mode === "online";
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [channel, setChannel] = useState<Channel>("offline");
  const [date, setDate] = useState(todayJkt());
  const [discount, setDiscount] = useState("");
  const [fee, setFee] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [history, setHistory] = useState<HistorySale[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function loadHistory() {
    if (!online) return;
    const { start, end } = rangeIso(date, date);
    const { data, error } = await supabase
      .from("sales")
      .select("id, sold_at, channel, discount, platform_fee, sale_items(menu_item_id, qty, unit_price, menu_items(name))")
      .eq("channel", channel)
      .gte("sold_at", start)
      .lte("sold_at", end)
      .order("sold_at", { ascending: false });
    if (error) setMsg({ type: "err", text: error.message });
    else setHistory((data ?? []) as unknown as HistorySale[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistory(); }, [online, date, channel]);

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

  function resetForm() {
    setCart({});
    setDiscount("");
    setFee("");
    setEditingId(null);
  }

  function editSale(s: HistorySale) {
    const next: Record<string, Line> = {};
    for (const i of s.sale_items) next[i.menu_item_id] = { qty: i.qty, price: i.unit_price };
    setCart(next);
    setDiscount(s.discount ? String(s.discount) : "");
    setFee(s.platform_fee ? String(s.platform_fee) : "");
    setEditingId(s.id);
    setMsg(null);
  }

  async function removeSale(s: HistorySale) {
    const ok = confirm(
      `Hapus penjualan ${summarize(s)} (${rupiah(grossOf(s))}) jam ${timeWib(s.sold_at)}?\n\nStok bahan yang terpotong akan dikembalikan. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_sale", { p_sale: s.id });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: missingFnMsg(error, "delete_sale") });
      return;
    }
    if (editingId === s.id) resetForm();
    setMsg({ type: "ok", text: "Penjualan dihapus, stok dikembalikan." });
    loadHistory();
  }

  function missingFnMsg(error: { code?: string; message: string }, fn: string) {
    const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
    return missing
      ? `Fitur koreksi penjualan belum aktif. Jalankan supabase/8-koreksi-penjualan.sql di Supabase (SQL Editor), lalu coba lagi.`
      : error.message;
  }

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
    const items = lines.map(([id, l]) => ({ menu_item_id: id, qty: l.qty, unit_price: l.price }));

    const { error } = editingId
      ? await supabase.rpc("update_sale", {
          p_sale: editingId,
          p_channel: channel,
          p_discount: Number(discount) || 0,
          p_fee: Number(fee) || 0,
          p_sold_at: soldAt,
          p_items: items,
        })
      : await supabase.rpc("record_sale", {
          p_channel: channel,
          p_discount: Number(discount) || 0,
          p_fee: Number(fee) || 0,
          p_sold_at: soldAt,
          p_items: items,
        });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: missingFnMsg(error, "update_sale") });
      return;
    }
    const wasEditing = Boolean(editingId);
    resetForm();
    setMsg({ type: "ok", text: `${wasEditing ? "Perubahan disimpan" : "Tersimpan"}. Pendapatan bersih ${rupiah(net)}.` });
    loadHistory();
  }

  return (
    <div>
      <PageTitle
        sub={
          online
            ? channel === "offline"
              ? "Catat penjualan offline, bisa untuk tanggal yang sudah lewat."
              : "Masukkan rekap satu hari dari dashboard merchant."
            : "Ketuk menu untuk menambah pesanan."
        }
      >
        {online ? "Rekap penjualan" : "Catat penjualan"}
      </PageTitle>
      <Notice msg={msg} />

      {editingId && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-900">Sedang mengubah penjualan yang sudah tersimpan.</p>
            <button className="shrink-0 text-sm font-medium text-amber-900 underline" onClick={resetForm}>
              Batal ubah
            </button>
          </div>
        </Card>
      )}

      {online && (
        <Card className="mb-4 space-y-3">
          <div>
            <Label>Platform</Label>
            <div className="grid grid-cols-2 gap-2">
              {RECAP_CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setChannel(c); if (c === "offline") setFee(""); }}
                  className={`h-12 rounded-xl border text-sm font-semibold ${
                    channel === c
                      ? "border-brand-700 bg-brand-700 text-brand-fg"
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
                <Card key={m.id} className={l ? "border-brand-600" : ""}>
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
                        className="h-11 w-11 rounded-full bg-brand-700 text-xl text-brand-fg active:bg-brand-800"
                        aria-label={`Tambah ${m.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {online && l && (
                    <div className="mt-3">
                      <Label>{channel === "offline" ? "Harga jual (per porsi)" : "Harga jual di aplikasi (per porsi)"}</Label>
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
        <div className={`grid gap-3 ${online && channel !== "offline" ? "grid-cols-2" : "grid-cols-1"}`}>
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
          {online && channel !== "offline" && (
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
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 text-sm text-stone-500">
            {portions} porsi, subtotal {rupiah(total)}
            <div className="text-lg font-bold text-stone-900">{rupiah(net)}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            {editingId && (
              <button className={btnGhostCls} onClick={resetForm} disabled={busy}>
                Batal
              </button>
            )}
            <button className={btnCls} onClick={submit} disabled={busy || portions === 0}>
              {busy ? "Menyimpan…" : editingId ? "Perbarui" : "Simpan penjualan"}
            </button>
          </div>
        </div>
      </Card>

      {online && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold">
            Penjualan {CHANNEL_LABEL[channel]} di tanggal ini
          </h2>
          {history.length === 0 ? (
            <Empty>Belum ada penjualan {CHANNEL_LABEL[channel]} pada tanggal ini.</Empty>
          ) : (
            <ScrollList className="divide-y divide-stone-100">
              {history.map((s) => (
                <div key={s.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{summarize(s)}</div>
                      <div className="text-xs text-stone-500">
                        {timeWib(s.sold_at)}
                        {s.discount > 0 ? `, diskon ${rupiah(s.discount)}` : ""}
                        {s.platform_fee > 0 ? `, komisi ${rupiah(s.platform_fee)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums">{rupiah(grossOf(s))}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className={`${btnGhostCls} h-9 flex-1 px-3 text-sm`}
                      onClick={() => editSale(s)}
                      disabled={busy}
                    >
                      Ubah
                    </button>
                    <button
                      className={`${btnGhostCls} h-9 flex-1 px-3 text-sm text-red-700`}
                      onClick={() => removeSale(s)}
                      disabled={busy}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </ScrollList>
          )}
        </Card>
      )}
    </div>
  );
}
