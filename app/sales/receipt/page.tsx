"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL } from "@/lib/format";
import { getSettings, type AppSettings } from "@/lib/settings";
import { buildReceiptLines, type ReceiptData } from "@/lib/receipt";
import type { Channel } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, btnCls, btnGhostCls, type Msg } from "@/components/ui";
import BluetoothPrint from "@/components/BluetoothPrint";

type SaleItemRow = { qty: number; unit_price: number; menu_items: { name: string } | null };
type SaleRow = {
  id: string;
  sold_at: string;
  channel: Channel;
  discount: number;
  platform_fee: number;
  sale_items: SaleItemRow[];
};

export default function ReceiptPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-stone-500">Memuat…</p>}>
      <ReceiptContent />
    </Suspense>
  );
}

function ReceiptContent() {
  const params = useSearchParams();
  const saleId = params.get("sale");
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [width, setWidth] = useState(58);
  const [msg, setMsg] = useState<Msg>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setWidth(s.receipt_width_mm);
    });
  }, []);

  useEffect(() => {
    if (!saleId) {
      setLoading(false);
      return;
    }
    supabase
      .from("sales")
      .select("id, sold_at, channel, discount, platform_fee, sale_items(qty, unit_price, menu_items(name))")
      .eq("id", saleId)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setMsg({ type: "err", text: error.message });
        else if (!data) setMsg({ type: "err", text: "Penjualan tidak ditemukan. Mungkin sudah dihapus." });
        else setSale(data as unknown as SaleRow);
      });
  }, [saleId]);

  const receiptData: ReceiptData | null = useMemo(() => {
    if (!sale || !settings) return null;
    return {
      business_name: settings.business_name,
      tagline: settings.tagline,
      sold_at: sale.sold_at,
      channel_label: CHANNEL_LABEL[sale.channel],
      items: sale.sale_items.map((i) => ({ name: i.menu_items?.name ?? "Menu dihapus", qty: i.qty, unit_price: i.unit_price })),
      discount: sale.discount,
      platform_fee: sale.platform_fee,
      footer: settings.receipt_footer,
    };
  }, [sale, settings]);

  const lines = receiptData ? buildReceiptLines(receiptData, width) : [];

  return (
    <div>
      <PageTitle sub="Pratinjau struk sebelum dicetak.">Cetak struk</PageTitle>
      <Notice msg={msg} />

      {!saleId ? (
        <Empty>Buka halaman ini dari tombol &quot;Cetak&quot; pada riwayat penjualan.</Empty>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-stone-500">Memuat…</p>
      ) : !receiptData ? null : (
        <>
          <Card className="mb-4 print:hidden">
            <div className="mb-1 text-sm font-medium">Ukuran kertas</div>
            <div className="grid grid-cols-2 gap-2">
              {[58, 80].map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`h-11 rounded-xl border text-sm font-semibold ${
                    width === w ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </Card>

          <div className="mb-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-4">
            <pre id="receipt-print-area" className="font-mono text-xs leading-tight">
              {lines.join("\n")}
            </pre>
          </div>

          <div className="space-y-2 print:hidden">
            <button className={`${btnCls} w-full`} onClick={() => window.print()}>
              Cetak
            </button>
            <BluetoothPrint data={receiptData} widthMm={width} />
            <a href="/sales/online-recap" className={`${btnGhostCls} block w-full text-center`}>
              Kembali ke Rekap penjualan
            </a>
          </div>
        </>
      )}

      <style>{`
        @media print {
          @page { size: ${width}mm auto; margin: 0; }
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area {
            position: fixed; top: 0; left: 0; width: ${width}mm;
            font-size: 11px; line-height: 1.3;
          }
        }
      `}</style>
    </div>
  );
}
