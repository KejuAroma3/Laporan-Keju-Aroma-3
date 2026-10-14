"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, fmt, rupiah, todayJkt } from "@/lib/format";
import { isSupplyCategory } from "@/lib/group";
import { buildProductionEntries } from "@/lib/production";
import { customTotals, type CustomLine } from "@/lib/customorder";
import type { Channel, ProductGroup, ProductStockRow, StockRow } from "@/lib/types";
import CustomerField from "@/components/CustomerField";
import { custKey, fetchCustomerIndex, saveCustomerName, type CustomerStat } from "@/lib/customers";
import { Card, Label, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

const CHANNELS: Channel[] = ["offline", "gofood", "grabfood", "shopeefood"];
const NEED_SQL = "Pesanan khusus belum aktif. Jalankan supabase/21-pesanan-khusus.sql di Supabase (SQL Editor), lalu coba lagi.";

// Form Pesanan Khusus: pesanan di luar menu. Pendapatan = harga per pcs x jumlah; produk jadi dan
// kemasan/bahan yang keluar diisi bebas per pesanan, HPP dihitung otomatis dari stok.
export default function CustomOrderForm({
  editId,
  defaultChannel,
  defaultDate,
  onDone,
  onCancel,
}: {
  editId: string | null;
  defaultChannel: Channel;
  defaultDate: string;
  onDone: (msg: Msg, saleId: string | null) => void;
  onCancel: () => void;
}) {
  const [prod, setProd] = useState<ProductStockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [ings, setIngs] = useState<StockRow[]>([]);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [origCustomer, setOrigCustomer] = useState("");
  const [custIndex, setCustIndex] = useState<Map<string, CustomerStat>>(new Map());
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [date, setDate] = useState(defaultDate || todayJkt());
  const [unitPrice, setUnitPrice] = useState("");
  const [qty, setQty] = useState("");
  const [qtyTouched, setQtyTouched] = useState(false);
  const [discount, setDiscount] = useState("");
  const [fee, setFee] = useState("");
  const [products, setProducts] = useState<CustomLine[]>([{ key: 1, id: "", qty: "" }]);
  const [supplies, setSupplies] = useState<CustomLine[]>([]);
  const [orig, setOrig] = useState<Record<string, number>>({}); // pemakaian pesanan lama (saat ubah), untuk peringatan stok
  const [nextKey, setNextKey] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerIndex().then(setCustIndex);
    (async () => {
      const [p, g, i] = await Promise.all([
        supabase.from("v_product_stock").select("*"),
        supabase.from("product_groups").select("*"),
        supabase.from("v_stock").select("*").order("name"),
      ]);
      setProd((p.data ?? []) as ProductStockRow[]);
      setGroups((g.data ?? []) as ProductGroup[]);
      setIngs((i.data ?? []) as StockRow[]);
    })();
  }, []);

  // memuat pesanan yang diubah
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const [s, c, l] = await Promise.all([
        supabase.from("sales").select("channel, sold_at, discount, platform_fee").eq("id", editId).single(),
        supabase.from("custom_orders").select("name, unit_price, qty").eq("sale_id", editId).single(),
        supabase.from("custom_order_lines").select("kind, ref_id, qty").eq("sale_id", editId),
      ]);
      if (s.error || c.error) {
        setErr(c.error && /custom_orders/.test(c.error.message) ? NEED_SQL : (s.error ?? c.error)!.message);
        return;
      }
      const sale = s.data as { channel: Channel; sold_at: string; discount: number; platform_fee: number };
      const co = c.data as { name: string; unit_price: number; qty: number };
      const lines = (l.data ?? []) as { kind: "produk" | "bahan"; ref_id: string; qty: number }[];
      setName(co.name);
      // nama pelanggan (boleh gagal jika supabase/22-nama-pelanggan.sql belum dijalankan)
      const cu = await supabase.from("sales").select("customer_name").eq("id", editId).single();
      if (!cu.error) {
        const cn = (cu.data as { customer_name: string | null }).customer_name ?? "";
        setCustomer(cn);
        setOrigCustomer(cn);
      }
      setChannel(sale.channel);
      setDate(new Date(sale.sold_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }));
      setUnitPrice(String(co.unit_price));
      setQty(String(co.qty));
      setQtyTouched(true);
      setDiscount(sale.discount ? String(sale.discount) : "");
      setFee(sale.platform_fee ? String(sale.platform_fee) : "");
      let k = 100;
      const used: Record<string, number> = {};
      for (const x of lines) used[`${x.kind}:${x.ref_id}`] = (used[`${x.kind}:${x.ref_id}`] ?? 0) + Number(x.qty);
      setOrig(used);
      setProducts(lines.filter((x) => x.kind === "produk").map((x) => ({ key: k++, id: x.ref_id, qty: String(x.qty) })));
      setSupplies(lines.filter((x) => x.kind === "bahan").map((x) => ({ key: k++, id: x.ref_id, qty: String(x.qty) })));
      setNextKey(k + 1);
    })();
  }, [editId]);

  // Produk yang bisa dipilih: yang sudah punya stok produksi (varian disatukan = satu pilihan pemegang stok).
  const productOptions = useMemo(() => {
    const out: { id: string; label: string; row: ProductStockRow }[] = [];
    for (const e of buildProductionEntries(prod, groups)) {
      for (const r of e.rows) {
        if (!r.track_stock) continue;
        out.push({ id: r.id, label: e.kind === "group" ? r.variant_name || r.name : e.label, row: r });
      }
    }
    return out;
  }, [prod, groups]);

  const supplyOptions = useMemo(
    () =>
      [...ings].sort(
        (a, b) =>
          Number(isSupplyCategory(b.category)) - Number(isSupplyCategory(a.category)) || a.name.localeCompare(b.name, "id")
      ),
    [ings]
  );

  const prodSum = products.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const effQty = qtyTouched ? Number(qty) || 0 : prodSum;
  const costOfProd = (l: CustomLine) => (productOptions.find((o) => o.id === l.id)?.row.avg_product_cost ?? 0) * (Number(l.qty) || 0);
  const costOfSupply = (l: CustomLine) => (ings.find((i) => i.id === l.id)?.avg_cost ?? 0) * (Number(l.qty) || 0);
  const t = customTotals({
    unitPrice: Number(unitPrice) || 0,
    qty: effQty,
    discount: Number(discount) || 0,
    fee: channel === "offline" ? 0 : Number(fee) || 0,
    productCost: products.reduce((s, l) => s + costOfProd(l), 0),
    supplyCost: supplies.reduce((s, l) => s + costOfSupply(l), 0),
  });

  const over: string[] = [];
  for (const l of products) {
    const o = productOptions.find((x) => x.id === l.id);
    if (o && (Number(l.qty) || 0) > o.row.stock_on_hand + (orig[`produk:${l.id}`] ?? 0)) over.push(o.label);
  }
  for (const l of supplies) {
    const i = ings.find((x) => x.id === l.id);
    if (i && (Number(l.qty) || 0) > i.on_hand + (orig[`bahan:${l.id}`] ?? 0)) over.push(i.name);
  }

  const setLine = (list: CustomLine[], set: (v: CustomLine[]) => void, key: number, patch: Partial<CustomLine>) =>
    set(list.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("Isi nama pesanan atau pelanggan.");
    if (!(Number(unitPrice) >= 0) || unitPrice === "") return setErr("Isi harga per pcs.");
    if (!(effQty > 0) || effQty !== Math.floor(effQty)) return setErr("Jumlah terjual harus bilangan bulat lebih dari 0.");
    const pl = products.filter((l) => l.id && Number(l.qty) > 0).map((l) => ({ menu_item_id: l.id, qty: Number(l.qty) }));
    const sl = supplies.filter((l) => l.id && Number(l.qty) > 0).map((l) => ({ ingredient_id: l.id, qty: Number(l.qty) }));
    if (pl.length === 0 && sl.length === 0) return setErr("Isi minimal satu produk atau kemasan yang keluar.");
    // gabungkan baris yang memilih barang sama supaya tidak terhitung dobel di rincian
    const merge = <T extends { qty: number }>(rows: T[], idOf: (r: T) => string) => {
      const m = new Map<string, T>();
      for (const r of rows) {
        const cur = m.get(idOf(r));
        m.set(idOf(r), cur ? { ...cur, qty: cur.qty + r.qty } : r);
      }
      return [...m.values()];
    };
    const args = {
      p_name: name.trim(),
      p_channel: channel,
      p_discount: Number(discount) || 0,
      p_fee: channel === "offline" ? 0 : Number(fee) || 0,
      p_sold_at: new Date(`${date}T12:00:00+07:00`).toISOString(),
      p_unit_price: Number(unitPrice),
      p_qty: effQty,
      p_products: merge(pl, (r) => r.menu_item_id),
      p_supplies: merge(sl, (r) => r.ingredient_id),
    };
    setBusy(true);
    const { data: id, error } = editId
      ? await supabase.rpc("update_custom_order", { p_sale: editId, ...args })
      : await supabase.rpc("record_custom_order", args);
    setBusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /could not find the function|custom_order/i.test(error.message);
      return setErr(missing ? NEED_SQL : error.message);
    }
    const saleId = typeof id === "string" ? id : null;
    const custWarn = saleId ? (await saveCustomerName(saleId, customer, custIndex)) ?? "" : "";
    if (saleId && Number(discount) > 0) {
      // rincian diskon boleh gagal (SQL 16 belum dijalankan); total diskon sudah tersimpan di penjualan
      await supabase.from("sale_discounts").insert({ sale_id: saleId, label: "Diskon", amount: Number(discount) });
    }
    onDone(
      {
        type: custWarn ? "err" : "ok",
        text: `${editId ? "Perubahan disimpan" : "Pesanan khusus tersimpan"}. Pendapatan bersih ${rupiah(t.revenue)}, HPP ${rupiah(t.cost)}, laba ${rupiah(t.profit)}.${custWarn ? ` ${custWarn}` : ""}`,
      },
      saleId
    );
  }

  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}

      <Card className="space-y-3">
        <div>
          <Label>Nama pesanan / pelanggan</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Hampers Bu Rina, Acara kantor" />
        </div>
        <CustomerField value={customer} onChange={setCustomer} index={custIndex} listId="daftar-pelanggan-khusus" ownCount={editId && origCustomer && custKey(origCustomer) === custKey(customer) ? 1 : 0} />
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`h-11 rounded-xl border text-sm font-semibold ${
                channel === c ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
        <div>
          <Label>Tanggal</Label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Produk jadi yang keluar</h2>
        {productOptions.length === 0 && (
          <p className="text-xs text-amber-700">Belum ada produk dengan stok produksi. Catat produksi dulu di Stok › Produksi.</p>
        )}
        {products.map((l) => (
          <div key={l.key} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <select className={inputCls} value={l.id} onChange={(e) => setLine(products, setProducts, l.key, { id: e.target.value })}>
                  <option value="">Pilih produk…</option>
                  {productOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} (stok {fmt(o.row.stock_on_hand)} {o.row.stock_unit})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700"
                onClick={() => setProducts(products.filter((x) => x.key !== l.key))}
                aria-label="Hapus baris"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-stone-600">Jumlah keluar (pcs)</span>
              <div className="min-w-0 flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  className={`${inputCls} text-right font-semibold`}
                  value={l.qty}
                  onChange={(e) => setLine(products, setProducts, l.key, { qty: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className={`${btnGhostCls} w-full`} onClick={() => { setProducts([...products, { key: nextKey, id: "", qty: "" }]); setNextKey(nextKey + 1); }}>
          + Tambah produk
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Kemasan / bahan yang keluar</h2>
        <p className="text-xs text-stone-500">Jumlahnya bebas tiap pesanan: box, plastik, label, handgloves, dan sebagainya.</p>
        {supplies.map((l) => {
          const ing = ings.find((x) => x.id === l.id);
          return (
            <div key={l.key} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <select className={inputCls} value={l.id} onChange={(e) => setLine(supplies, setSupplies, l.key, { id: e.target.value })}>
                    <option value="">Pilih barang…</option>
                    {supplyOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} (stok {fmt(o.on_hand)} {o.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 bg-white text-red-700"
                  onClick={() => setSupplies(supplies.filter((x) => x.key !== l.key))}
                  aria-label="Hapus baris"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-stone-600">Jumlah keluar{ing ? ` (${ing.unit})` : ""}</span>
                <div className="min-w-0 flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    className={`${inputCls} text-right font-semibold`}
                    value={l.qty}
                    onChange={(e) => setLine(supplies, setSupplies, l.key, { qty: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" className={`${btnGhostCls} w-full`} onClick={() => { setSupplies([...supplies, { key: nextKey, id: "", qty: "" }]); setNextKey(nextKey + 1); }}>
          + Tambah kemasan / bahan
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Harga</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Harga per pcs (Rp)</Label>
            <input type="number" inputMode="numeric" className={inputCls} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="9000" />
          </div>
          <div>
            <Label>Jumlah terjual (pcs)</Label>
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={qtyTouched ? qty : prodSum > 0 ? String(prodSum) : ""}
              onChange={(e) => { setQty(e.target.value); setQtyTouched(true); }}
              placeholder="228"
            />
          </div>
        </div>
        <p className="text-xs text-stone-500">Jumlah terjual otomatis mengikuti total produk di atas; ubah kalau berbeda.</p>
        <div className={`grid gap-3 ${channel === "offline" ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <Label>Diskon (Rp)</Label>
            <input type="number" inputMode="numeric" className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
          </div>
          {channel !== "offline" && (
            <div>
              <Label>Komisi + promo platform (Rp)</Label>
              <input type="number" inputMode="numeric" className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-1.5 border-stone-300 bg-stone-50 text-sm">
        <div className="flex justify-between"><span>{fmt(effQty)} pcs × {rupiah(Number(unitPrice) || 0)}</span><span className="tabular-nums">{rupiah(t.gross)}</span></div>
        {(Number(discount) || 0) > 0 && <div className="flex justify-between text-red-700"><span>Diskon</span><span className="tabular-nums">−{rupiah(Number(discount))}</span></div>}
        {channel !== "offline" && (Number(fee) || 0) > 0 && <div className="flex justify-between text-red-700"><span>Komisi + promo</span><span className="tabular-nums">−{rupiah(Number(fee))}</span></div>}
        <div className="flex justify-between font-semibold"><span>Pendapatan bersih</span><span className="tabular-nums">{rupiah(t.revenue)}</span></div>
        <div className="flex justify-between text-stone-600"><span>HPP total (HPP {rupiah(t.costPerPcs)} per pcs)</span><span className="tabular-nums">{rupiah(t.cost)}</span></div>
        <div className={`flex justify-between text-base font-bold ${t.profit < 0 ? "text-red-700" : "text-brand-800"}`}>
          <span>Laba · margin {t.revenue > 0 ? `${t.margin.toFixed(1)}%` : "-"}</span>
          <span className="tabular-nums">{rupiah(t.profit)}</span>
        </div>
        {over.length > 0 && (
          <p className="pt-1 text-xs font-medium text-red-700">
            Melebihi stok: {[...new Set(over)].join(", ")}. Tetap bisa disimpan, tapi cek stoknya.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={btnGhostCls} onClick={onCancel} disabled={busy}>Batal</button>
        <button type="button" className={btnCls} onClick={save} disabled={busy}>
          {busy ? "Menyimpan…" : editId ? "Simpan perubahan" : "Simpan pesanan"}
        </button>
      </div>
    </div>
  );
}
