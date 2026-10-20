"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_LABEL, fmt } from "@/lib/format";
import { isSupplyCategory } from "@/lib/group";
import { NEED_TXPACK_SQL, fetchTxRules, type TxRule } from "@/lib/txpack";
import { NEED_BOX_SQL, fetchBoxConfig, type BoxSize } from "@/lib/boxes";
import type { Channel, StockRow } from "@/lib/types";
import { Card, Empty, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import OwnerOnly from "@/components/OwnerOnly";

const ALL: Channel[] = ["offline", "gofood", "grabfood", "shopeefood"];

type Draft = { id: string | null; ingredient_id: string; qty: string; channels: Channel[]; follow_of: string[]; per_trigger: boolean };

export default function TxPackPage() {
  const [rules, setRules] = useState<TxRule[]>([]);
  const [ings, setIngs] = useState<StockRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftFollow, setDraftFollow] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [sizes, setSizes] = useState<BoxSize[]>([]);
  const [exclude, setExclude] = useState("frozen");
  const [sizeDraft, setSizeDraft] = useState<{ id: string | null; ingredient_id: string; capacity: string } | null>(null);

  const load = useCallback(async () => {
    const [r, i, b] = await Promise.all([fetchTxRules(), supabase.from("v_stock").select("*").order("name"), fetchBoxConfig()]);
    setRules(r);
    setSizes(b.sizes);
    setExclude(b.exclude.join(", "));
    setIngs((i.data ?? []) as StockRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const options = [...ings].sort(
    (a, b) => Number(isSupplyCategory(b.category)) - Number(isSupplyCategory(a.category)) || a.name.localeCompare(b.name, "id")
  );
  const nameOf = (id: string) => ings.find((x) => x.id === id)?.name ?? "Bahan";
  const unitOf = (id: string) => ings.find((x) => x.id === id)?.unit ?? "";

  async function save() {
    if (!draft) return;
    if (!draft.ingredient_id) return setMsg({ type: "err", text: "Pilih bahan kemasannya." });
    if (!(Number(draft.qty) > 0)) return setMsg({ type: "err", text: "Isi jumlah per transaksi (lebih dari 0)." });
    if (draftFollow && draft.follow_of.length === 0) return setMsg({ type: "err", text: "Pilih kemasan pemicu (mis. Plastik PE UK 24)." });
    if (draft.channels.length === 0) return setMsg({ type: "err", text: "Pilih minimal satu platform." });
    setBusy(true);
    const row = {
      ingredient_id: draft.ingredient_id,
      qty: Number(draft.qty),
      channels: draft.channels,
      ...(draft.follow_of.length > 0 || draft.id ? { follow_of: draft.follow_of, per_trigger: draft.per_trigger } : {}),
    };
    const { error } = draft.id
      ? await supabase.from("transaction_packaging_rules").update(row).eq("id", draft.id)
      : await supabase.from("transaction_packaging_rules").insert(row);
    setBusy(false);
    if (error) {
      return setMsg({
        type: "err",
        text: /follow_of|per_trigger/.test(error.message)
          ? "Kemasan ikutan belum aktif. Jalankan supabase/28-kemasan-ikutan.sql di Supabase (SQL Editor), lalu coba lagi."
          : /transaction_packaging_rules|schema cache/i.test(error.message) ? NEED_TXPACK_SQL : error.message,
      });
    }
    setDraft(null);
    setMsg({ type: "ok", text: "Aturan tersimpan. Berlaku untuk penjualan berikutnya." });
    load();
  }

  async function remove(r: TxRule) {
    if (!confirm(`Hapus aturan ${nameOf(r.ingredient_id)}?`)) return;
    const { error } = await supabase.from("transaction_packaging_rules").delete().eq("id", r.id);
    if (error) return setMsg({ type: "err", text: error.message });
    load();
  }

  async function saveSize() {
    if (!sizeDraft) return;
    if (!sizeDraft.ingredient_id) return setMsg({ type: "err", text: "Pilih bahan box-nya." });
    if (!(Number(sizeDraft.capacity) > 0)) return setMsg({ type: "err", text: "Isi kapasitas box (pcs)." });
    setBusy(true);
    const row = { ingredient_id: sizeDraft.ingredient_id, capacity: Number(sizeDraft.capacity) };
    const { error } = sizeDraft.id
      ? await supabase.from("box_sizes").update(row).eq("id", sizeDraft.id)
      : await supabase.from("box_sizes").upsert(row, { onConflict: "ingredient_id" });
    setBusy(false);
    if (error) return setMsg({ type: "err", text: /box_sizes|schema cache/i.test(error.message) ? NEED_BOX_SQL : error.message });
    setSizeDraft(null);
    setMsg({ type: "ok", text: "Ukuran box tersimpan." });
    load();
  }

  async function removeSize(s: BoxSize) {
    if (!confirm(`Hapus ukuran box ${nameOf(s.ingredient_id)}?`)) return;
    const { error } = await supabase.from("box_sizes").delete().eq("id", s.id);
    if (error) return setMsg({ type: "err", text: error.message });
    load();
  }

  async function saveExclude() {
    const { error } = await supabase.from("box_settings").upsert({ id: true, exclude_keywords: exclude.trim(), updated_at: new Date().toISOString() });
    setMsg(error
      ? { type: "err", text: /box_settings|schema cache/i.test(error.message) ? NEED_BOX_SQL : error.message }
      : { type: "ok", text: "Pengecualian menu tersimpan." });
  }

  const toggle = (c: Channel) =>
    draft && setDraft({ ...draft, channels: draft.channels.includes(c) ? draft.channels.filter((x) => x !== c) : [...draft.channels, c] });

  return (
    <div>
      <PageTitle sub="Kemasan yang dipakai sekali per transaksi (misalnya satu plastik untuk semua porsi dalam satu pesanan).">
        Kemasan per transaksi
      </PageTitle>
      <Notice msg={msg} />
      <OwnerOnly feature="pengaturan kemasan">
        <div className="space-y-3 pb-24">
          {rules.length === 0 && !draft && <Empty>Belum ada aturan. Tambahkan, misalnya Plastik × 1 untuk semua platform.</Empty>}
          {rules.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{nameOf(r.ingredient_id)} × {fmt(r.qty)} {unitOf(r.ingredient_id)}</div>
                <div className="text-xs text-stone-500">
                  {r.follow_of.length > 0 ? `Ikut jika ada ${r.follow_of.map(nameOf).join(" / ")}${r.per_trigger ? " (sebanyak pemicu)" : " (sekali)"}` : "Per transaksi"} · {r.channels.length === ALL.length ? "semua platform" : r.channels.map((c) => CHANNEL_LABEL[c as Channel]).join(", ")}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className={`${btnGhostCls} h-9 px-3 text-sm`} onClick={() => { setDraftFollow(r.follow_of.length > 0); setDraft({ id: r.id, ingredient_id: r.ingredient_id, qty: String(r.qty), channels: r.channels as Channel[], follow_of: r.follow_of, per_trigger: r.per_trigger }); }}>Ubah</button>
                <button className={`${btnGhostCls} h-9 px-3 text-sm text-red-700`} onClick={() => remove(r)}>Hapus</button>
              </div>
            </Card>
          ))}

          {draft ? (
            <Card className="space-y-3">
              <div>
                <Label>Bahan kemasan</Label>
                <select className={inputCls} value={draft.ingredient_id} onChange={(e) => setDraft({ ...draft, ingredient_id: e.target.value })}>
                  <option value="">Pilih bahan…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>)}
                </select>
              </div>
              <div>
                <Label>Jumlah per transaksi</Label>
                <input type="number" inputMode="decimal" className={inputCls} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
              </div>
              <div>
                <Label>Kapan muncul</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([["Selalu", false], ["Ikut kemasan lain", true]] as const).map(([label, follow]) => (
                    <button key={label} type="button"
                      onClick={() => { setDraftFollow(follow); if (!follow) setDraft({ ...draft, follow_of: [], per_trigger: false }); }}
                      className={`rounded-xl border px-3 py-2 text-sm ${draftFollow === follow ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {draftFollow && (
                  <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-2.5">
                    <div className="text-xs text-stone-600">Muncul kalau ada salah satu kemasan ini:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {options.filter((o) => isSupplyCategory(o.category) && o.id !== draft.ingredient_id).map((o) => (
                        <button key={o.id} type="button"
                          onClick={() => setDraft({ ...draft, follow_of: draft.follow_of.includes(o.id) ? draft.follow_of.filter((x) => x !== o.id) : [...draft.follow_of, o.id] })}
                          className={`rounded-full border px-3 py-1 text-sm ${draft.follow_of.includes(o.id) ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"}`}>
                          {o.name}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={draft.per_trigger} onChange={(e) => setDraft({ ...draft, per_trigger: e.target.checked })} />
                      Jumlah mengikuti jumlah kemasan pemicu (1 per plastik)
                    </label>
                  </div>
                )}
              </div>
              <div>
                <Label>Berlaku di platform</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL.map((c) => (
                    <button key={c} type="button" onClick={() => toggle(c)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${draft.channels.includes(c) ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"}`}>
                      {CHANNEL_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button className={btnGhostCls} onClick={() => setDraft(null)} disabled={busy}>Batal</button>
                <button className={btnCls} onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan aturan"}</button>
              </div>
            </Card>
          ) : (
            <button className={`${btnCls} w-full`} onClick={() => { setDraftFollow(false); setDraft({ id: null, ingredient_id: "", qty: "1", channels: [...ALL], follow_of: [], per_trigger: false }); }}>+ Tambah aturan</button>
          )}

          <div className="pt-2">
            <h2 className="text-lg font-bold">Ukuran box otomatis</h2>
            <p className="text-sm text-stone-500">Box dipilih dari jumlah pcs transaksi (porsi × isi). Ukuran terkecil yang muat; kalau stoknya habis diganti ukuran lebih besar.</p>
          </div>
          {sizes.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{nameOf(s.ingredient_id)}</div>
                <div className="text-xs text-stone-500">Maksimal {fmt(s.capacity)} pcs per box</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className={`${btnGhostCls} h-9 px-3 text-sm`} onClick={() => setSizeDraft({ id: s.id, ingredient_id: s.ingredient_id, capacity: String(s.capacity) })}>Ubah</button>
                <button className={`${btnGhostCls} h-9 px-3 text-sm text-red-700`} onClick={() => removeSize(s)}>Hapus</button>
              </div>
            </Card>
          ))}
          {sizeDraft ? (
            <Card className="space-y-3">
              <div>
                <Label>Bahan box</Label>
                <select className={inputCls} value={sizeDraft.ingredient_id} onChange={(e) => setSizeDraft({ ...sizeDraft, ingredient_id: e.target.value })}>
                  <option value="">Pilih bahan…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Maksimal pcs per box</Label>
                <input type="number" inputMode="numeric" className={inputCls} value={sizeDraft.capacity} onChange={(e) => setSizeDraft({ ...sizeDraft, capacity: e.target.value })} placeholder="Contoh: 10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button className={btnGhostCls} onClick={() => setSizeDraft(null)} disabled={busy}>Batal</button>
                <button className={btnCls} onClick={saveSize} disabled={busy}>Simpan ukuran</button>
              </div>
            </Card>
          ) : (
            <button className={`${btnGhostCls} w-full`} onClick={() => setSizeDraft({ id: null, ingredient_id: "", capacity: "" })}>+ Tambah ukuran box</button>
          )}
          <Card className="space-y-2">
            <Label>Menu tanpa box (kata kunci nama/kategori, pisahkan koma)</Label>
            <input className={inputCls} value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="frozen, hampers" />
            <button className={`${btnGhostCls} w-full`} onClick={saveExclude}>Simpan pengecualian</button>
            <p className="text-xs text-stone-500">Menu yang nama atau kategorinya mengandung kata ini tidak dihitung untuk box. Kemasannya diatur di resep menu itu (mis. hampers: Plastik PE UK 35, dicentang "Dipakai sekali per penjualan").</p>
          </Card>

          <Card className="bg-stone-50 text-xs text-stone-600">
            Di layar Cek pesanan, kemasan ini muncul otomatis dan jumlahnya bisa diubah per transaksi. Stok berkurang dan biayanya
            masuk HPP penjualan itu. Jangan masukkan bahan yang sama juga di resep sebagai &quot;Dipakai sekali per penjualan&quot;,
            supaya tidak terpotong dua kali. Pesanan Khusus tidak memakai aturan ini.
          </Card>
        </div>
      </OwnerOnly>
    </div>
  );
}
