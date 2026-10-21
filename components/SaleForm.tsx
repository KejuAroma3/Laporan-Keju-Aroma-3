"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { roundStock } from "@/lib/stockround";
import { CHANNEL_LABEL, rangeIso, rupiah, todayJkt } from "@/lib/format";
import { buildSellCats } from "@/lib/sellorder";
import { resolveSharedStock, stockHolderId, stockNeeded } from "@/lib/production";
import type { Channel, MenuItem, ProductGroup, ProductStockRow, StockRow } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, ScrollList, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import { Thumb } from "@/components/BestSellerList";
import CustomerField from "@/components/CustomerField";
import { expandBundles, fetchBundles, type BundleMap } from "@/lib/bundles";
import { boxPcs, fetchBoxConfig, mergeBoxLines, planBoxes, stockMap, type BoxConfig } from "@/lib/boxes";
import { applyFollow, fetchSavedPack, fetchTxRules, linesFromRules, savePack, type PackLine, type TxRule } from "@/lib/txpack";
import { isSupplyCategory } from "@/lib/group";
import { DEFAULT_FEE_RULES, calcFee, fetchFeeRules, feeLabel, type FeeRules } from "@/lib/feerules";
import { custKey, fetchCustomerIndex, saveCustomerName, type CustomerStat } from "@/lib/customers";
import CustomOrderForm from "@/components/CustomOrderForm";
import { CUSTOM_MENU_NAME } from "@/lib/customorder";
import { priceFor, type PriceMap } from "@/lib/platformprice";
import { cleanDiscounts, discountLinesFor, sumDiscounts, type DiscountInput, type DiscountLine } from "@/lib/discounts";

type Line = { qty: number; price: number };
type PartInfo = { name: string; qty: number; short: boolean; canSell: number | null };
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
const isCustomSale = (s: HistorySale) => s.sale_items.some((i) => i.menu_items?.name === CUSTOM_MENU_NAME);
const grossOf = (s: HistorySale) => s.sale_items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);

export default function SaleForm({ mode }: { mode: "offline" | "online" }) {
  const online = mode === "online";
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [stock, setStock] = useState<Record<string, ProductStockRow>>({});
  const [bundles, setBundles] = useState<BundleMap>({}); // isi menu paket (SQL 30)
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [channel, setChannel] = useState<Channel>("offline");
  const [prices, setPrices] = useState<PriceMap>({});
  const [date, setDate] = useState(todayJkt());
  const [discRows, setDiscRows] = useState<DiscountInput[]>([]);
  const [discKey, setDiscKey] = useState(1);
  const [discTypes, setDiscTypes] = useState<{ id: string; name: string }[]>([]);
  const [discDetails, setDiscDetails] = useState<Record<string, DiscountLine[]>>({});
  const [manageTypes, setManageTypes] = useState(false);
  const [newType, setNewType] = useState("");
  const [txRules, setTxRules] = useState<TxRule[]>([]); // aturan kemasan per transaksi (SQL 26)
  const [packOptions, setPackOptions] = useState<StockRow[]>([]);
  const [packLines, setPackLines] = useState<PackLine[]>([]);
  const [packTouched, setPackTouched] = useState(false); // sudah diubah/dimuat dari penjualan lama: jangan isi ulang dari aturan
  const [boxCfg, setBoxCfg] = useState<BoxConfig>({ sizes: [], exclude: ["frozen"] }); // ukuran box otomatis (SQL 27)
  const [perBox, setPerBox] = useState("auto"); // isi per box: "auto" atau angka pcs
  const [boxNote, setBoxNote] = useState("");
  const [feeRules, setFeeRules] = useState<FeeRules>(DEFAULT_FEE_RULES);
  const [feeKept, setFeeKept] = useState<number | null>(null); // saat ubah penjualan lama: komisi tersimpan dipertahankan sampai dihitung ulang
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [history, setHistory] = useState<HistorySale[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [step, setStep] = useState<"pilih" | "ringkas">("pilih");
  const [noDisc, setNoDisc] = useState(false); // dicentang: memang tidak ada diskon
  const [custIndex, setCustIndex] = useState<Map<string, CustomerStat>>(new Map());
  const [custNames, setCustNames] = useState<Record<string, string>>({}); // sale_id -> nama pelanggan
  const [custom, setCustom] = useState<{ editId: string | null } | null>(null); // form Pesanan Khusus terbuka
  const [customNames, setCustomNames] = useState<Record<string, string>>({}); // sale_id -> nama pesanan khusus

  async function load() {
    fetchCustomerIndex().then(setCustIndex);
    fetchBundles().then(setBundles);
    const [m, s, g] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_active", true).order("category").order("name"),
      supabase.from("v_product_stock").select("*"), // boleh gagal jika supabase/9-stok-produk.sql belum dijalankan
      supabase.from("product_groups").select("*"), // boleh gagal jika supabase/13-varian-produk.sql belum dijalankan
    ]);
    if (m.error) setMsg({ type: "err", text: m.error.message });
    else setMenus((m.data ?? []) as MenuItem[]);
    setStock(resolveSharedStock((s.data ?? []) as ProductStockRow[], (g.data ?? []) as ProductGroup[]));
    setProductGroups((g.data ?? []) as ProductGroup[]);
    supabase.from("v_stock").select("*").order("name").then((r) => { if (!r.error) setPackOptions(roundStock((r.data ?? []) as StockRow[])); });
    // boleh gagal jika supabase/16-rincian-diskon.sql belum dijalankan
    const t = await supabase.from("discount_types").select("id, name").order("created_at");
    if (!t.error) setDiscTypes((t.data ?? []) as { id: string; name: string }[]);
    // boleh gagal jika supabase/19-harga-per-platform.sql belum dijalankan
    const pr = await supabase.from("menu_prices").select("menu_item_id, channel, price");
    if (!pr.error) {
      const map: PriceMap = {};
      for (const r of (pr.data ?? []) as { menu_item_id: string; channel: Channel; price: number }[]) {
        (map[r.menu_item_id] ??= {})[r.channel] = Number(r.price);
      }
      setPrices(map);
    }
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
    else {
      const list = (data ?? []) as unknown as HistorySale[];
      setHistory(list);
      const ids = list.map((x) => x.id);
      const details: Record<string, DiscountLine[]> = {};
      if (ids.length > 0) {
        // boleh gagal jika supabase/16-rincian-diskon.sql belum dijalankan
        const d = await supabase.from("sale_discounts").select("sale_id, label, amount").in("sale_id", ids);
        if (!d.error) {
          for (const r of (d.data ?? []) as { sale_id: string; label: string; amount: number }[]) {
            details[r.sale_id] = [...(details[r.sale_id] ?? []), { label: r.label, amount: Number(r.amount) }];
          }
        }
      }
      setDiscDetails(details);
      // nama pesanan khusus (boleh gagal jika supabase/21-pesanan-khusus.sql belum dijalankan)
      const names: Record<string, string> = {};
      if (ids.length > 0) {
        const cn = await supabase.from("custom_orders").select("sale_id, name").in("sale_id", ids);
        if (!cn.error) for (const r of (cn.data ?? []) as { sale_id: string; name: string }[]) names[r.sale_id] = r.name;
      }
      setCustomNames(names);
      // nama pelanggan (boleh gagal jika supabase/22-nama-pelanggan.sql belum dijalankan)
      const cnames: Record<string, string> = {};
      if (ids.length > 0) {
        const cu = await supabase.from("sales").select("id, customer_name").in("id", ids).not("customer_name", "is", null);
        if (!cu.error) for (const r of (cu.data ?? []) as { id: string; customer_name: string }[]) cnames[r.id] = r.customer_name;
      }
      setCustNames(cnames);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistory(); }, [online, date, channel]);
  useEffect(() => { fetchFeeRules().then(setFeeRules); }, []);
  useEffect(() => {
    fetchTxRules().then(setTxRules);
    supabase.from("v_stock").select("*").order("name").then((r) => setPackOptions(roundStock((r.data ?? []) as StockRow[])));
  }, []);
  useEffect(() => { fetchBoxConfig().then(setBoxCfg); }, []);
  // Kemasan transaksi: dari aturan (SQL 26) + box otomatis sesuai jumlah pcs (SQL 27). Yang sudah diubah kasir dipertahankan.
  function setPackManual(next: PackLine[]) {
    setPackTouched(true);
    setPackLines(applyFollow(packLines, next, txRules, channel));
  }
  const boxTotalPcs = boxPcs(Object.entries(cart).filter(([id]) => !bundles[id]?.length), menus, boxCfg.exclude);
  useEffect(() => {
    if (step !== "ringkas") return;
    if (editingId && perBox === "auto") return;
    const base = packTouched ? packLines : linesFromRules(txRules, channel);
    const names = Object.fromEntries(packOptions.map((r) => [r.id, r.name]));
    const plan = planBoxes(boxTotalPcs, perBox === "auto" ? null : Number(perBox) || null, boxCfg.sizes, stockMap(packOptions), names);
    const merged = mergeBoxLines(base, plan, boxCfg.sizes);
    setPackLines(packTouched ? merged : applyFollow(null, merged, txRules, channel));
    setBoxNote(plan.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, channel, txRules, boxCfg, boxTotalPcs, perBox, packOptions, editingId]);

  function change(m: MenuItem, delta: number) {
    setLastSavedId(null);
    setCart((c) => {
      const cur = c[m.id] ?? { qty: 0, price: priceFor(m, channel, prices) };
      const qty = Math.max(0, cur.qty + delta);
      const next = { ...c };
      if (qty === 0) delete next[m.id];
      else next[m.id] = { ...cur, qty };
      return next;
    });
  }

  // Ganti platform: harga baris di keranjang ikut harga platform itu (harga yang sudah diubah manual ikut diganti).
  function switchChannel(c: Channel) {
    setChannel(c);
    setFeeKept(null);
    setCart((cur) => {
      const next: Record<string, Line> = {};
      for (const [id, l] of Object.entries(cur)) {
        const menu = menus.find((m) => m.id === id);
        next[id] = menu ? { ...l, price: priceFor(menu, c, prices) } : l;
      }
      return next;
    });
  }

  function setPrice(id: string, price: number) {
    setCart((c) => (c[id] ? { ...c, [id]: { ...c[id], price } } : c));
  }

  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, l]) => s + l.qty * l.price, 0);
  const portions = lines.reduce((s, [, l]) => s + l.qty, 0);
  const need = stockNeeded(
    expandBundles(
      lines.flatMap(([id, l]) => {
        const menu = menus.find((m) => m.id === id);
        return menu ? [{ menu, qty: l.qty }] : [];
      }),
      bundles,
      menus
    ),
    productGroups
  );
  const isShort = (c: MenuItem) => !!stock[c.id]?.track_stock && (need.get(stockHolderId(c, productGroups)) ?? 0) > (stock[c.id]?.stock_on_hand ?? 0);
  const overStockItems = lines
    .filter(([id]) => {
      const menu = menus.find((m) => m.id === id);
      if (!menu) return false;
      if (bundles[id]?.length) return bundles[id].some((p) => { const c = menus.find((x) => x.id === p.component_id); return !!c && isShort(c); });
      return isShort(menu);
    })
    .map(([id]) => menus.find((m) => m.id === id)?.name ?? "menu");
  const partsOf = (m: MenuItem): PartInfo[] =>
    (bundles[m.id] ?? []).map((p) => {
      const c = menus.find((x) => x.id === p.component_id);
      const st = c ? stock[c.id] : undefined;
      const per = c ? p.qty * (c.pack_qty ?? 1) : 0;
      return { name: c?.name ?? "Menu", qty: p.qty, short: c ? isShort(c) : false, canSell: st?.track_stock && per > 0 ? Math.floor(st.stock_on_hand / per) : null };
    });
  const discLines = cleanDiscounts(discRows);
  const discountTotal = sumDiscounts(discLines);
  const isPlatform = online && channel !== "offline";
  const feeAuto = isPlatform ? calcFee(feeRules, channel, total - discountTotal) : 0;
  const fee = isPlatform ? (feeKept ?? feeAuto) : 0;
  const net = total - discountTotal - fee;

  const cats = useMemo(() => {
    const term = q.trim().toLowerCase();
    return buildSellCats(term ? menus.filter((m) => m.name.toLowerCase().includes(term)) : menus, productGroups);
  }, [menus, q, productGroups]);

  function resetForm() {
    setCart({});
    setDiscRows([]);
    setFeeKept(null);
    setCustomer("");
    setPackLines([]);
    setPackTouched(false);
    setPerBox("auto");
    setBoxNote("");
    setNoDisc(false);
    setStep("pilih");
    setEditingId(null);
  }

  function editSale(s: HistorySale) {
    const next: Record<string, Line> = {};
    for (const i of s.sale_items) next[i.menu_item_id] = { qty: i.qty, price: i.unit_price };
    setCart(next);
    setDiscRows(
      discountLinesFor(s.discount, discDetails[s.id]).map((d, i) => ({ key: discKey + i, label: d.label, amount: String(d.amount) }))
    );
    setDiscKey((k) => k + 10);
    setFeeKept(Number(s.platform_fee) || 0);
    setPackTouched(true);
    setPackLines([]);
    fetchSavedPack(s.id).then(setPackLines);
    setCustomer(custNames[s.id] ?? "");
    setNoDisc(true);
    setStep("pilih");
    setEditingId(s.id);
    setMsg(null);
    setLastSavedId(null);
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
    load();
    loadHistory();
  }

  function missingFnMsg(error: { code?: string; message: string }, fn: string) {
    const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
    return missing
      ? `Fitur koreksi penjualan belum aktif. Jalankan supabase/8-koreksi-penjualan.sql di Supabase (SQL Editor), lalu coba lagi.`
      : error.message;
  }

  async function addType() {
    const name = newType.trim();
    if (!name) return;
    const { error } = await supabase.from("discount_types").insert({ name });
    if (error) {
      setMsg({
        type: "err",
        text: error.code === "23505"
          ? "Nama diskon itu sudah ada."
          : /discount_types|does not exist|schema cache/i.test(error.message)
            ? "Fitur diskon bernama belum aktif. Jalankan supabase/16-rincian-diskon.sql di Supabase (SQL Editor)."
            : error.message,
      });
      return;
    }
    setNewType("");
    load();
  }

  async function removeType(id: string) {
    const { error } = await supabase.from("discount_types").delete().eq("id", id);
    if (error) setMsg({ type: "err", text: error.message });
    else load();
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

    const { data: savedId, error } = editingId
      ? await supabase.rpc("update_sale", {
          p_sale: editingId,
          p_channel: channel,
          p_discount: discountTotal,
          p_fee: fee,
          p_sold_at: soldAt,
          p_items: items,
        })
      : await supabase.rpc("record_sale", {
          p_channel: channel,
          p_discount: discountTotal,
          p_fee: fee,
          p_sold_at: soldAt,
          p_items: items,
        });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: missingFnMsg(error, "update_sale") });
      return;
    }
    const wasEditing = Boolean(editingId);
    let packWarn = "";
    if (typeof savedId === "string" && packLines.length > 0) packWarn = await savePack(savedId, packLines);
    let custWarn = "";
    if (typeof savedId === "string") custWarn = (await saveCustomerName(savedId, customer, custIndex)) ?? "";
    // Rincian diskon disimpan setelah penjualan; total diskon sudah tersimpan di penjualannya.
    let detailWarn = "";
    if (typeof savedId === "string" && discLines.length > 0) {
      const ins = await supabase.from("sale_discounts").insert(discLines.map((d) => ({ sale_id: savedId, label: d.label, amount: d.amount })));
      if (ins.error) {
        detailWarn = /sale_discounts|does not exist|schema cache/i.test(ins.error.message)
          ? " Rincian diskon belum bisa disimpan: jalankan supabase/16-rincian-diskon.sql di Supabase (total diskon tetap tercatat)."
          : ` Rincian diskon gagal disimpan (${ins.error.message}), total diskon tetap tercatat.`;
      }
    }
    resetForm();
    const warn = [detailWarn, custWarn ? ` ${custWarn}` : "", packWarn ? ` ${packWarn}` : ""].join("");
    setMsg({ type: warn ? "err" : "ok", text: `${wasEditing ? "Perubahan disimpan" : "Tersimpan"}. Pendapatan bersih ${rupiah(total - discountTotal)}${fee > 0 ? `, diterima ${rupiah(net)} setelah komisi` : ""}.${warn}` });
    setLastSavedId(typeof savedId === "string" ? savedId : null);
    load();
    loadHistory();
  }

  const needDisc = isPlatform && discLines.length === 0 && !noDisc;

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch { /* abaikan */ }
  }, [step, custom]);

  if (step === "ringkas" && !custom) {
    return (
      <div>
        <PageTitle sub="Periksa lagi sebelum menyimpan. Pelanggan dan diskon diisi di sini; komisi platform dihitung otomatis.">
          {editingId ? "Cek perubahan" : "Cek pesanan"}
        </PageTitle>
        <Notice msg={msg} />

        <Card className="mb-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">
              {CHANNEL_LABEL[channel]}
              {online ? ` · ${date}` : ""}
            </h2>
            <button type="button" className="text-sm font-medium text-brand-800 underline" onClick={() => setStep("pilih")}>
              Ubah pesanan
            </button>
          </div>
          <ul className="divide-y divide-stone-100">
            {lines.map(([id, l]) => {
              const m = menus.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{m ? m.variant_name || m.name : "Menu"}</span>
                    <span className="block text-xs text-stone-500">{l.qty} × {rupiah(l.price)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{rupiah(l.qty * l.price)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2 text-sm font-semibold">
            <span>Subtotal</span>
            <span className="tabular-nums">{rupiah(total)}</span>
          </div>
        </Card>

        <Card className="mb-4">
<CustomerField
          value={customer}
          onChange={setCustomer}
          index={custIndex}
          listId="daftar-pelanggan"
          ownCount={editingId && custNames[editingId] && custKey(custNames[editingId]) === custKey(customer) ? 1 : 0}
        />
        </Card>

        <Card className="mb-4 space-y-3">
          <h2 className="font-semibold">Diskon</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Diskon{discLines.length > 0 ? `: ${rupiah(discountTotal)}` : ""}</Label>
            <button type="button" className="text-sm font-medium text-brand-800 underline" onClick={() => setManageTypes((v) => !v)}>
              {manageTypes ? "Selesai" : "Atur jenis diskon"}
            </button>
          </div>
          {discRows.map((r, idx) => (
            <div key={r.key} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm font-semibold text-stone-600">Potongan Rp</span>
                <div className="min-w-0 flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    autoFocus={!r.amount}
                    className={`${inputCls} text-right font-semibold`}
                    value={r.amount}
                    onChange={(e) => setDiscRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700"
                  onClick={() => setDiscRows((rows) => rows.filter((x) => x.key !== r.key))}
                  aria-label={`Hapus diskon ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
              <input
                className="h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-brand-700"
                value={r.label}
                list="daftar-jenis-diskon"
                onChange={(e) => setDiscRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
                placeholder="Nama diskon (boleh dikosongkan)"
              />
            </div>
          ))}
          <datalist id="daftar-jenis-diskon">
            {discTypes.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            {discTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm"
                onClick={() => { setDiscRows((rows) => [...rows, { key: discKey, label: t.name, amount: "" }]); setDiscKey((k) => k + 1); }}
              >
                + {t.name}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-dashed border-stone-400 bg-white px-3 py-1.5 text-sm text-stone-600"
              onClick={() => { setDiscRows((rows) => [...rows, { key: discKey, label: "", amount: "" }]); setDiscKey((k) => k + 1); }}
            >
              + Tambah diskon (isi angka saja)
            </button>
          </div>
          {manageTypes && (
            <div className="space-y-2 rounded-lg bg-stone-50 p-3">
              <p className="text-xs text-stone-500">Daftar nama diskon yang sering dipakai (tombol di atas).</p>
              {discTypes.length === 0 && <p className="text-xs text-stone-400">Belum ada. Tambahkan di bawah.</p>}
              <div className="flex flex-wrap gap-2">
                {discTypes.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-sm ring-1 ring-stone-200">
                    {t.name}
                    <button type="button" className="h-7 w-7 rounded-full text-red-700" onClick={() => removeType(t.id)} aria-label={`Hapus ${t.name}`}>✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={`${inputCls} min-w-0 flex-1`} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Contoh: Diskon member" />
                <button type="button" className={`${btnGhostCls} shrink-0 px-4`} onClick={addType}>Tambah</button>
              </div>
            </div>
          )}
        </div>
          {isPlatform && discLines.length === 0 && (
            <label className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${noDisc ? "border-brand-600 bg-brand-50" : "border-amber-300 bg-amber-50"}`}>
              <input type="checkbox" className="h-5 w-5" checked={noDisc} onChange={(e) => setNoDisc(e.target.checked)} />
              Tidak ada diskon di pesanan ini
            </label>
          )}
        </Card>

        {(packLines.length > 0 || txRules.length > 0 || packTouched || boxCfg.sizes.length > 0) && (
          <Card className="mb-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Kemasan transaksi ini</h2>
              <span className="text-xs text-stone-500">sekali per transaksi</span>
            </div>
            {boxCfg.sizes.length > 0 && boxTotalPcs > 0 && (
              <div className="space-y-1.5 rounded-xl bg-stone-50 p-2.5">
                <div className="text-xs font-semibold text-stone-600">Isi per box (pcs)</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {["auto", ...[5, 10, 20].filter((n) => n <= boxCfg.sizes[boxCfg.sizes.length - 1].capacity).map(String)].map((v) => (
                    <button key={v} type="button" onClick={() => setPerBox(v)}
                      className={`rounded-full border px-3 py-1 text-sm ${perBox === v ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"}`}>
                      {v === "auto" ? "Otomatis" : v}
                    </button>
                  ))}
                  <input type="number" inputMode="numeric" placeholder="lain"
                    className="h-8 w-16 rounded-full border border-stone-300 bg-white px-2 text-center text-sm"
                    value={perBox !== "auto" && ![5, 10, 20].map(String).includes(perBox) ? perBox : ""}
                    onChange={(e) => setPerBox(e.target.value === "" ? "auto" : e.target.value)} />
                </div>
                {boxNote && <div className="text-xs text-stone-500">{boxNote}</div>}
              </div>
            )}
            {packLines.length === 0 && <p className="text-sm text-stone-500">Tidak ada kemasan.</p>}
            {packLines.map((l) => {
              const ing = packOptions.find((x) => x.id === l.id);
              return (
                <div key={l.key} className="flex items-center gap-2">
                  <select
                    className={`${inputCls} !h-10 min-w-0 flex-1 text-sm`}
                    value={l.id}
                    onChange={(e) => { setPackManual(packLines.map((x) => (x.key === l.key ? { ...x, id: e.target.value } : x))); }}
                  >
                    <option value="">Pilih kemasan…</option>
                    {[...packOptions]
                      .sort((a, b) => Number(isSupplyCategory(b.category)) - Number(isSupplyCategory(a.category)) || a.name.localeCompare(b.name, "id"))
                      .map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    className={`${inputCls} !h-10 !w-16 shrink-0 text-right`}
                    value={l.qty}
                    onChange={(e) => { setPackManual(packLines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x))); }}
                  />
                  <span className="w-9 shrink-0 text-xs text-stone-500">{ing?.unit ?? ""}</span>
                  <button type="button" className="h-10 w-10 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700" aria-label="Hapus kemasan"
                    onClick={() => setPackManual(packLines.filter((x) => x.key !== l.key))}>✕</button>
                </div>
              );
            })}
            <button type="button" className="text-sm font-medium text-brand-800 underline"
              onClick={() => setPackManual([...packLines, { key: Date.now(), id: "", qty: "1" }])}>
              + Tambah kemasan
            </button>
          </Card>
        )}

        <Card className="mb-4 space-y-1.5 bg-stone-50 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{rupiah(total)}</span></div>
          {discLines.map((d, i) => (
            <div key={i} className="flex justify-between text-red-700">
              <span className="truncate">{d.label}</span>
              <span className="shrink-0 tabular-nums">−{rupiah(d.amount)}</span>
            </div>
          ))}
          {isPlatform && fee > 0 && (
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold">
              <span>Pendapatan bersih</span>
              <span className="tabular-nums">{rupiah(total - discountTotal)}</span>
            </div>
          )}
          {isPlatform && fee > 0 && (
            <div className="flex justify-between text-red-700">
              <span>Komisi {CHANNEL_LABEL[channel]} <span className="text-xs text-stone-500">({feeKept !== null ? "tersimpan" : feeLabel(feeRules[channel as keyof FeeRules])})</span></span>
              <span className="tabular-nums">−{rupiah(fee)}</span>
            </div>
          )}
          {isPlatform && feeKept !== null && feeKept !== feeAuto && (
            <button type="button" className="text-left text-xs font-medium text-brand-800 underline" onClick={() => setFeeKept(null)}>
              Hitung ulang komisi sesuai aturan ({rupiah(feeAuto)})
            </button>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-1.5 text-lg font-bold">
            <span>{isPlatform && fee > 0 ? "Diterima setelah komisi" : "Pendapatan bersih"}</span>
            <span className="tabular-nums">{rupiah(net)}</span>
          </div>
        </Card>

        {needDisc && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Isi diskon, atau centang bahwa memang tidak ada diskon.
          </p>
        )}
        <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-3 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">
          <button className={btnGhostCls} onClick={() => setStep("pilih")} disabled={busy}>‹ Kembali</button>
          <button className={btnCls} onClick={submit} disabled={busy || portions === 0 || needDisc}>
            {busy ? "Menyimpan…" : editingId ? "Perbarui" : "Simpan penjualan"}
          </button>
        </div>
      </div>
    );
  }

  if (custom) {
    return (
      <div>
        <PageTitle sub="Pesanan di luar menu: harga per pcs × jumlah, produk dan kemasan yang keluar diisi bebas.">
          {custom.editId ? "Ubah pesanan khusus" : "Pesanan khusus"}
        </PageTitle>
        <CustomOrderForm
          editId={custom.editId}
          defaultChannel={channel}
          defaultDate={date}
          onCancel={() => setCustom(null)}
          onDone={(m, id) => {
            setCustom(null);
            setMsg(m);
            setLastSavedId(id);
            load();
            loadHistory();
          }}
        />
      </div>
    );
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
      {lastSavedId && (
        <Link
          href={`/sales/receipt?sale=${lastSavedId}`}
          className={`${btnGhostCls} mb-4 flex items-center justify-center gap-2`}
        >
          🖨️ Cetak struk penjualan ini
        </Link>
      )}

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

      {!editingId && (
        <button type="button" className={`${btnGhostCls} mb-4 w-full`} onClick={() => setCustom({ editId: null })}>
          + Pesanan khusus (di luar menu)
        </button>
      )}

      {online && (
        <Card className="mb-4 space-y-3">
          <div>
            <Label>Platform</Label>
            <div className="grid grid-cols-2 gap-2">
              {RECAP_CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => switchChannel(c)}
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

      {cats.map((cat) => (
        <section key={cat.name} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-stone-500">{cat.name}</h2>
          <div className="space-y-2">
            {cat.units.map((u) =>
              u.groupId === null ? (
                <Card key={u.key} className={cart[u.menus[0].id] ? "border-brand-600" : ""}>
                  <ProductRow
                    m={u.menus[0]}
                    label={u.menus[0].name}
                    cart={cart}
                    stock={stock}
                    online={online}
                    channel={channel}
                    prices={prices}
                    change={change}
                    setPrice={setPrice}
                    parts={partsOf(u.menus[0])}
                  />
                </Card>
              ) : (
                <Card key={u.key} className={u.menus.some((m) => cart[m.id]) ? "border-brand-600" : ""}>
                  <h3 className="mb-2 text-sm font-semibold">{u.label}</h3>
                  <div className="divide-y divide-stone-100">
                    {u.menus.map((m) => (
                      <div key={m.id} className="py-2 first:pt-0 last:pb-0">
                        <ProductRow
                          m={m}
                          label={m.variant_name || m.name}
                          cart={cart}
                          stock={stock}
                          online={online}
                          channel={channel}
                          prices={prices}
                          change={change}
                          setPrice={setPrice}
                          parts={partsOf(m)}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )
            )}
          </div>
        </section>
      ))}

      <Card className="sticky bottom-20 z-10 space-y-2 border-stone-300 shadow-lg">
        {overStockItems.length > 0 && (
          <p className="text-xs font-medium text-red-700">
            Melebihi stok produk: {overStockItems.join(", ")}. Tetap bisa disimpan, tapi produksi lagi dulu kalau bisa.
          </p>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm text-stone-500">
            {portions} item
            <div className="text-lg font-bold text-stone-900">{rupiah(total)}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            {editingId && (
              <button className={btnGhostCls} onClick={resetForm} disabled={busy}>
                Batal
              </button>
            )}
            <button className={btnCls} onClick={() => setStep("ringkas")} disabled={busy || portions === 0}>
              Lanjut ›
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
                      <div className="break-words text-sm font-medium">
                        {customNames[s.id] ? `Pesanan khusus: ${customNames[s.id]} ×${s.sale_items.reduce((n, i) => n + i.qty, 0)}` : summarize(s)}
                      </div>
                      <div className="text-xs text-stone-500">
                        {timeWib(s.sold_at)}
                        {custNames[s.id] ? ` · ${custNames[s.id]}` : ""}
                        {discountLinesFor(s.discount, discDetails[s.id]).map((d) => `, ${d.label} ${rupiah(d.amount)}`).join("")}
                        {s.platform_fee > 0 ? `, komisi ${rupiah(s.platform_fee)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums">{rupiah(grossOf(s))}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link href={`/sales/receipt?sale=${s.id}`} className={`${btnGhostCls} h-9 flex-1 px-2 text-sm`}>
                      Cetak
                    </Link>
                    <button
                      className={`${btnGhostCls} h-9 flex-1 px-2 text-sm`}
                      onClick={() => (isCustomSale(s) ? setCustom({ editId: s.id }) : editSale(s))}
                      disabled={busy}
                    >
                      Ubah
                    </button>
                    <button
                      className={`${btnGhostCls} h-9 flex-1 px-2 text-sm text-red-700`}
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

// Isi satu baris produk (foto, nama, harga, stok, tombol +/−, dan kolom harga
// saat dipilih). Dipakai bersama oleh menu berdiri sendiri (dibungkus Card
// sendiri) dan oleh varian dalam satu produk dasar (beberapa baris dalam
// satu Card), supaya tampilan dan perilakunya selalu sama.
function ProductRow({
  m,
  label,
  cart,
  stock,
  online,
  channel,
  prices,
  change,
  setPrice,
  parts,
}: {
  parts?: PartInfo[];
  m: MenuItem;
  label: string;
  cart: Record<string, Line>;
  stock: Record<string, ProductStockRow>;
  online: boolean;
  channel: Channel;
  prices: PriceMap;
  change: (m: MenuItem, delta: number) => void;
  setPrice: (id: string, price: number) => void;
}) {
  const l = cart[m.id];
  const st = stock[m.id];
  const tracked = st?.track_stock ?? false;
  const pack = m.pack_qty ?? 1;
  const overStock = tracked && l && l.qty * pack > st.stock_on_hand;
  return (
    <>
      <div className="flex items-center gap-3">
        <Thumb url={m.photo_url} name={m.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="break-words font-semibold leading-snug">{label}</div>
          <div className="text-sm text-stone-500">{rupiah(priceFor(m, channel, prices))}</div>
          {parts && parts.length > 0 && (
            <div className={`text-xs font-medium ${parts.some((p) => p.short) ? "text-red-700" : "text-stone-400"}`}>
              Paket: {parts.map((p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.name}`).join(" + ")}
              {parts.some((p) => p.canSell !== null) && `. Stok cukup untuk ${Math.min(...parts.flatMap((p) => (p.canSell === null ? [] : [p.canSell])))} paket`}
            </div>
          )}
          {tracked && !(parts && parts.length > 0) && (
            <div className={`text-xs font-medium ${overStock ? "text-red-700" : "text-stone-400"}`}>
              Stok: {st.stock_on_hand} {st.stock_unit}
              {pack !== 1 && `, isi ${pack} ${st.stock_unit} per jual`}
            </div>
          )}
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
              <span className="w-7 text-center text-lg font-bold tabular-nums">{l.qty}</span>
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
          <Label>{`Harga jual${channel === "offline" ? "" : " di aplikasi"} (per ${tracked ? st.stock_unit : "porsi"})`}</Label>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={l.price}
            onChange={(e) => setPrice(m.id, Number(e.target.value) || 0)}
          />
        </div>
      )}
    </>
  );
}
