"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDaysIso, addMonthsIso, addYearsIso, dayJkt, fmt, labelDay, labelDayShort, labelMonth,
  labelMonthShort, labelYear, monthEndIso, monthStartIso, rangeIso, rupiah, todayJkt,
  yearEndIso, yearStartIso,
} from "@/lib/format";
import { Card, Empty, Label, ScrollList, Tabs, btnCls, btnDangerCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

type Mode = "harian" | "bulanan" | "tahunan";

type PurchaseRow = {
  id: string;
  qty: number;
  unit_cost: number | null;
  note: string | null;
  created_at: string;
  ingredients: { name: string; unit: string } | null;
};

const PAGE = 1000;
const amount = (r: PurchaseRow) => r.qty * (r.unit_cost ?? 0);

async function fetchPurchases(from: string, to: string): Promise<{ rows: PurchaseRow[]; error: string | null }> {
  const { start, end } = rangeIso(from, to);
  const all: PurchaseRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("id, qty, unit_cost, note, created_at, ingredients(name, unit)")
      .eq("type", "purchase")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) return { rows: all, error: error.message };
    const chunk = (data ?? []) as unknown as PurchaseRow[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { rows: all, error: null };
}

export default function PurchaseLog({ refreshKey, onChanged }: { refreshKey: number; onChanged: (m: Msg) => void }) {
  const [mode, setMode] = useState<Mode>("harian");
  const [anchor, setAnchor] = useState(todayJkt());
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const today = todayJkt();
  const range = useMemo(() => {
    if (mode === "harian") return { from: anchor, to: anchor };
    if (mode === "bulanan") return { from: monthStartIso(anchor), to: monthEndIso(anchor) };
    return { from: yearStartIso(anchor), to: yearEndIso(anchor) };
  }, [mode, anchor]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPurchases(range.from, range.to).then((r) => {
      if (!active) return;
      setRows(r.rows);
      setErr(r.error);
      setLoading(false);
    });
    return () => { active = false; };
  }, [range.from, range.to, refreshKey, reload]);

  const step = (n: number) => {
    setOpenDay(null);
    setAnchor((a) =>
      mode === "harian" ? addDaysIso(a, n) : mode === "bulanan" ? addMonthsIso(a, n) : addYearsIso(a, n)
    );
  };
  const nextDisabled =
    mode === "harian" ? anchor >= today : mode === "bulanan" ? monthStartIso(anchor) >= monthStartIso(today) : yearStartIso(anchor) >= yearStartIso(today);

  const title = mode === "harian" ? labelDay(anchor) : mode === "bulanan" ? labelMonth(anchor) : labelYear(anchor);
  const total = rows.reduce((s, r) => s + amount(r), 0);

  const byDay = useMemo(() => {
    const m = new Map<string, PurchaseRow[]>();
    for (const r of rows) {
      const k = dayJkt(r.created_at);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { total: number; count: number; days: Set<string> }>();
    for (const r of rows) {
      const d = dayJkt(r.created_at);
      const k = d.slice(0, 7);
      const e = m.get(k) ?? { total: 0, count: 0, days: new Set<string>() };
      e.total += amount(r); e.count += 1; e.days.add(d);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const changed = useCallback((m: Msg) => {
    onChanged(m);
    if (m?.type === "ok") setReload((k) => k + 1);
  }, [onChanged]);

  return (
    <Card className="mt-4">
      <h2 className="mb-3 font-semibold">Riwayat belanja</h2>
      <Tabs
        value={mode}
        onChange={(m) => { setMode(m); setOpenDay(null); }}
        tabs={[
          { id: "harian", label: "Harian" },
          { id: "bulanan", label: "Bulanan" },
          { id: "tahunan", label: "Tahunan" },
        ]}
      />
      <div className="mb-3 flex items-center justify-between gap-2">
        <button className={btnGhostCls} onClick={() => step(-1)} aria-label="Periode sebelumnya">‹</button>
        <div className="text-center">
          <div className="text-sm font-semibold">{title}</div>
          {!loading && <div className="text-lg font-bold tabular-nums">{rupiah(total)}</div>}
          {!loading && <div className="text-xs text-stone-500">{rows.length} catatan belanja</div>}
        </div>
        <button className={btnGhostCls} onClick={() => step(1)} disabled={nextDisabled} aria-label="Periode berikutnya">›</button>
      </div>

      {err && <p className="mb-2 text-sm text-red-700">{err}</p>}
      {loading ? (
        <p className="py-4 text-center text-sm text-stone-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <Empty>Belum ada belanja tercatat di periode ini.</Empty>
      ) : mode === "harian" ? (
        <ScrollList className="divide-y divide-stone-100" maxHeight="24rem">
          {rows.map((r) => <PurchaseItem key={r.id} r={r} onChanged={changed} />)}
        </ScrollList>
      ) : mode === "bulanan" ? (
        <ScrollList className="space-y-2" maxHeight="28rem">
          {byDay.map(([day, items]) => (
            <div key={day} className="rounded-lg border border-stone-200">
              <button
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                onClick={() => setOpenDay(openDay === day ? null : day)}
              >
                <div>
                  <div className="text-sm font-semibold">{labelDayShort(day)}</div>
                  <div className="text-xs text-stone-500">{items.length} catatan</div>
                </div>
                <div className="font-bold tabular-nums">{rupiah(items.reduce((s, r) => s + amount(r), 0))}</div>
              </button>
              {openDay === day && (
                <div className="divide-y divide-stone-100 border-t border-stone-100 px-3">
                  {items.map((r) => <PurchaseItem key={r.id} r={r} onChanged={changed} />)}
                </div>
              )}
            </div>
          ))}
        </ScrollList>
      ) : (
        <ScrollList className="space-y-2" maxHeight="28rem">
          {byMonth.map(([ym, e]) => (
            <button
              key={ym}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 text-left"
              onClick={() => { setAnchor(`${ym}-01`); setMode("bulanan"); }}
            >
              <div>
                <div className="text-sm font-semibold">{labelMonthShort(`${ym}-01`)} {ym.slice(0, 4)}</div>
                <div className="text-xs text-stone-500">{e.days.size} hari belanja, {e.count} catatan</div>
              </div>
              <div className="font-bold tabular-nums">{rupiah(e.total)}</div>
            </button>
          ))}
        </ScrollList>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Mengubah atau menghapus catatan belanja hanya mengubah riwayat dan jumlah stok. Harga rata-rata bahan tidak dihitung ulang.
      </p>
    </Card>
  );
}

function PurchaseItem({ r, onChanged }: { r: PurchaseRow; onChanged: (m: Msg) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(String(r.qty));
  const [total, setTotal] = useState(String(Math.round(amount(r))));
  const [note, setNote] = useState(r.note ?? "");
  const origDay = dayJkt(r.created_at);
  const [date, setDate] = useState(origDay);

  async function save() {
    if (!(Number(qty) > 0) || !(Number(total) > 0)) {
      onChanged({ type: "err", text: "Jumlah dan total harga harus lebih dari 0." });
      return;
    }
    if (!date || date > todayJkt()) {
      onChanged({ type: "err", text: "Tanggal belanja tidak boleh kosong atau di masa depan." });
      return;
    }
    setBusy(true);
    const patch: Record<string, unknown> = {
      qty: Number(qty),
      unit_cost: Number(total) / Number(qty),
      note: note.trim() || null,
    };
    if (date !== origDay) patch.created_at = new Date(`${date}T12:00:00+07:00`).toISOString();
    const { error } = await supabase.from("stock_movements").update(patch).eq("id", r.id).eq("type", "purchase");
    setBusy(false);
    if (error) return onChanged({ type: "err", text: error.message });
    setEditing(false);
    onChanged({ type: "ok", text: "Catatan belanja diperbarui." });
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("stock_movements").delete().eq("id", r.id).eq("type", "purchase");
    setBusy(false);
    if (error) return onChanged({ type: "err", text: error.message });
    onChanged({ type: "ok", text: "Catatan belanja dihapus. Stok bahan ikut berkurang." });
  }

  return (
    <div className="py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{r.ingredients?.name ?? "Bahan dihapus"}</div>
          <div className="text-xs text-stone-500">
            {fmt(r.qty)} {r.ingredients?.unit ?? ""} @ {rupiah(r.unit_cost ?? 0)}
            {r.note ? `, ${r.note}` : ""}
          </div>
        </div>
        <div className="shrink-0 font-semibold tabular-nums">{rupiah(amount(r))}</div>
      </div>
      {!editing && !confirmDel && (
        <div className="mt-2 flex gap-2">
          <button className={btnGhostCls} onClick={() => setEditing(true)}>Ubah</button>
          <button className={btnGhostCls} onClick={() => setConfirmDel(true)}>Hapus</button>
        </div>
      )}
      {confirmDel && (
        <div className="mt-2 rounded-lg bg-red-50 p-3">
          <p className="mb-2 text-sm text-red-800">Hapus catatan belanja ini? Stok bahan akan berkurang {fmt(r.qty)} {r.ingredients?.unit ?? ""}.</p>
          <div className="flex gap-2">
            <button className={btnDangerCls} onClick={remove} disabled={busy}>{busy ? "Menghapus…" : "Ya, hapus"}</button>
            <button className={btnGhostCls} onClick={() => setConfirmDel(false)} disabled={busy}>Batal</button>
          </div>
        </div>
      )}
      {editing && (
        <div className="mt-2 space-y-3 rounded-lg bg-stone-50 p-3">
          <div>
            <Label>Jumlah{r.ingredients ? ` (${r.ingredients.unit})` : ""}</Label>
            <input type="number" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Total harga beli (Rp)</Label>
            <input type="number" inputMode="numeric" className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div>
            <Label>Tanggal belanja</Label>
            <input type="date" className={inputCls} value={date} max={todayJkt()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Catatan</Label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className={btnCls} onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
            <button className={btnGhostCls} onClick={() => setEditing(false)} disabled={busy}>Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}
