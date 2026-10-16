"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, rupiah } from "@/lib/format";
import { DEFAULT_FEE_RULES, calcFee, fetchFeeRules, type FeeRules } from "@/lib/feerules";
import { ONLINE_CHANNELS } from "@/lib/platformprice";
import { Card, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

type Draft = Record<string, { percent: string; flat: string }>;
const toDraft = (r: FeeRules): Draft =>
  Object.fromEntries(ONLINE_CHANNELS.map((c) => [c, { percent: String(r[c as keyof FeeRules].percent), flat: String(r[c as keyof FeeRules].flat) }]));

export default function FeesPage() {
  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_FEE_RULES));
  const [example, setExample] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => { fetchFeeRules().then((r) => setDraft(toDraft(r))); }, []);

  const rules = Object.fromEntries(
    ONLINE_CHANNELS.map((c) => [c, { percent: Number(draft[c]?.percent) || 0, flat: Number(draft[c]?.flat) || 0 }])
  ) as FeeRules;
  const set = (c: string, k: "percent" | "flat", v: string) => setDraft({ ...draft, [c]: { ...draft[c], [k]: v } });

  async function save() {
    for (const c of ONLINE_CHANNELS) {
      const r = rules[c as keyof FeeRules];
      if (r.percent < 0 || r.percent > 100 || r.flat < 0) return setMsg({ type: "err", text: `Angka ${CHANNEL_LABEL[c]} tidak valid (persen 0-100).` });
    }
    setBusy(true);
    const { error } = await supabase
      .from("platform_fee_rules")
      .upsert(ONLINE_CHANNELS.map((c) => ({ channel: c, ...rules[c as keyof FeeRules], updated_at: new Date().toISOString() })));
    setBusy(false);
    setMsg(
      error
        ? {
            type: "err",
            text: /platform_fee_rules|schema cache/i.test(error.message)
              ? "Aturan komisi belum bisa disimpan. Jalankan supabase/25-aturan-komisi-platform.sql di Supabase (SQL Editor), lalu coba lagi."
              : error.message,
          }
        : { type: "ok", text: "Aturan komisi tersimpan. Berlaku untuk penjualan berikutnya." }
    );
  }

  const ex = Number(example) || 0;

  return (
    <div>
      <PageTitle sub="Komisi dihitung otomatis dari pendapatan bersih (subtotal dikurangi diskon) saat mencatat penjualan online.">
        Komisi platform
      </PageTitle>
      <Notice msg={msg} />
      <OwnerOnly feature="pengaturan komisi">
        <div className="space-y-4 pb-24">
          {ONLINE_CHANNELS.map((c) => (
            <Card key={c} className="space-y-3">
              <h2 className="font-bold">{CHANNEL_LABEL[c]}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Persen dari pendapatan bersih (%)</Label>
                  <input type="number" inputMode="decimal" className={inputCls} value={draft[c]?.percent ?? ""} onChange={(e) => set(c, "percent", e.target.value)} />
                </div>
                <div>
                  <Label>Tambah per transaksi (Rp)</Label>
                  <input type="number" inputMode="numeric" className={inputCls} value={draft[c]?.flat ?? ""} onChange={(e) => set(c, "flat", e.target.value)} />
                </div>
              </div>
              <p className="text-sm text-stone-600">
                Contoh pendapatan bersih {rupiah(ex)} → komisi <b>{rupiah(calcFee(rules, c, ex))}</b>, diterima {rupiah(ex - calcFee(rules, c, ex))}
              </p>
            </Card>
          ))}
          <Card className="space-y-2 bg-stone-50">
            <Label>Contoh pendapatan bersih (Rp)</Label>
            <input type="number" inputMode="numeric" className={inputCls} value={example} onChange={(e) => setExample(e.target.value)} />
            <p className="text-xs text-stone-500">
              Rumus: komisi = pendapatan bersih × persen + biaya tetap per transaksi. Bawaan: GrabFood 20%, GoFood 20% + Rp1.000,
              ShopeeFood 25%. Penjualan lama tidak berubah.
            </p>
          </Card>
          <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-3 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">
            <button className={btnGhostCls} onClick={() => setDraft(toDraft(DEFAULT_FEE_RULES))} disabled={busy}>Kembalikan bawaan</button>
            <button className={btnCls} onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan aturan"}</button>
          </div>
        </div>
      </OwnerOnly>
    </div>
  );
}
