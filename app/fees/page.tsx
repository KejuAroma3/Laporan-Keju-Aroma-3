"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, daysAgoJkt, fmt, monthStartJkt, rupiah, todayJkt } from "@/lib/format";
import { DEFAULT_FEE_RULES, calcFee, fetchFeeRules, type FeeRules } from "@/lib/feerules";
import { ONLINE_CHANNELS } from "@/lib/platformprice";
import { Card, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

type Draft = Record<string, { percent: string; flat: string }>;
type Preview = { channel: string; trx: number; changed: number; old_fee: number; new_fee: number };
const toDraft = (r: FeeRules): Draft =>
  Object.fromEntries(ONLINE_CHANNELS.map((c) => [c, { percent: String(r[c as keyof FeeRules].percent), flat: String(r[c as keyof FeeRules].flat) }]));

export default function FeesPage() {
  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_FEE_RULES));
  const [example, setExample] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [saved, setSaved] = useState<Draft>(toDraft(DEFAULT_FEE_RULES)); // aturan yang tersimpan di database
  const [from, setFrom] = useState(monthStartJkt());
  const [to, setTo] = useState(todayJkt());
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [rbusy, setRbusy] = useState(false);

  useEffect(() => { fetchFeeRules().then((r) => { setDraft(toDraft(r)); setSaved(toDraft(r)); }); }, []);

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
    if (!error) setSaved(JSON.parse(JSON.stringify(draft)) as Draft);
    setPreview(null);
  }

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  async function runRecalc(apply: boolean) {
    if (dirty) return setMsg({ type: "err", text: "Simpan aturan dulu, baru hitung ulang penjualan lama." });
    if (!from || !to || from > to) return setMsg({ type: "err", text: "Rentang tanggal tidak valid." });
    if (apply && !confirm(`Perbarui komisi penjualan online dari ${from} sampai ${to}?\n\nKomisi lama diganti hasil perhitungan aturan ini, dan laporan laba periode itu ikut berubah. Pesanan Khusus dan offline tidak diubah.`)) return;
    setRbusy(true);
    const { data, error } = await supabase.rpc("recalc_platform_fees", { p_from: from, p_to: to, p_apply: apply });
    setRbusy(false);
    if (error) {
      const missing = error.code === "PGRST202" || /recalc_platform_fees|platform_fee_rules|could not find/i.test(error.message);
      return setMsg({ type: "err", text: missing ? "Hitung ulang komisi belum aktif. Jalankan supabase/25-aturan-komisi-platform.sql lalu supabase/29-hitung-ulang-komisi.sql di Supabase (SQL Editor)." : error.message });
    }
    const rows = ((data ?? []) as unknown as Preview[]).map((r) => ({ ...r, trx: Number(r.trx), changed: Number(r.changed), old_fee: Number(r.old_fee), new_fee: Number(r.new_fee) }));
    if (apply) {
      setPreview(null);
      const n = rows.reduce((t, r) => t + r.changed, 0);
      setMsg({ type: "ok", text: n > 0 ? `Komisi ${n} penjualan diperbarui.` : "Tidak ada komisi yang berubah." });
    } else {
      setPreview(rows);
      setMsg(null);
    }
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
          <Card className="space-y-3">
            <div>
              <h2 className="font-bold">Terapkan ke penjualan lama</h2>
              <p className="text-xs text-stone-500">Hitung ulang komisi GoFood, GrabFood, dan ShopeeFood sekaligus untuk rentang tanggal, memakai aturan yang tersimpan di atas.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dari tanggal</Label>
                <input type="date" className={inputCls} value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} />
              </div>
              <div>
                <Label>Sampai tanggal</Label>
                <input type="date" className={inputCls} value={to} min={from} max={todayJkt()} onChange={(e) => { setTo(e.target.value); setPreview(null); }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => { setFrom(todayJkt()); setTo(todayJkt()); setPreview(null); }}>Hari ini</button>
              <button type="button" className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => { setFrom(daysAgoJkt(6)); setTo(todayJkt()); setPreview(null); }}>7 hari</button>
              <button type="button" className={`${btnGhostCls} h-10 px-2 text-sm`} onClick={() => { setFrom(monthStartJkt()); setTo(todayJkt()); setPreview(null); }}>Bulan ini</button>
            </div>
            {dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Aturan di atas belum disimpan. Simpan dulu supaya dipakai untuk hitung ulang.</p>}
            <button type="button" className={`${btnGhostCls} w-full`} onClick={() => runRecalc(false)} disabled={rbusy || dirty}>
              {rbusy ? "Menghitung…" : "Lihat pratinjau perubahan"}
            </button>
            {preview && (
              preview.length === 0 ? (
                <p className="text-sm text-stone-500">Tidak ada penjualan online di rentang ini.</p>
              ) : (
                <div className="space-y-2">
                  {preview.map((r) => (
                    <div key={r.channel} className="rounded-xl bg-stone-50 p-2.5 text-sm">
                      <div className="flex justify-between font-semibold">
                        <span>{(CHANNEL_LABEL as Record<string, string>)[r.channel] ?? r.channel}</span>
                        <span className="text-xs font-normal text-stone-500">{fmt(r.trx)} transaksi · {fmt(r.changed)} berubah</span>
                      </div>
                      <div className="mt-0.5 flex justify-between text-xs text-stone-600">
                        <span>Komisi {rupiah(r.old_fee)} → {rupiah(r.new_fee)}</span>
                        <span className={r.new_fee - r.old_fee > 0 ? "text-red-700" : "text-brand-800"}>
                          {r.new_fee - r.old_fee > 0 ? "+" : ""}{rupiah(r.new_fee - r.old_fee)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <button type="button" className={`${btnCls} w-full`} onClick={() => runRecalc(true)} disabled={rbusy || preview.every((r) => r.changed === 0)}>
                    Terapkan perubahan komisi
                  </button>
                </div>
              )
            )}
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
