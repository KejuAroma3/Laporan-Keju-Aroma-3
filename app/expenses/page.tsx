"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pct, rupiah, todayJkt } from "@/lib/format";
import { Bar, Card, Empty, Label, Notice, PageTitle, btnCls, inputCls, type Msg } from "@/components/ui";

const CATEGORIES = ["Sewa", "Gaji", "Listrik", "Gas", "Air", "Internet", "Kemasan", "Marketing", "Perawatan dan perbaikan", "Lainnya"];

type Expense = { id: string; spent_on: string; category: string; amount: number; note: string | null };

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export default function ExpensesPage() {
  const [month, setMonth] = useState(todayJkt().slice(0, 7));
  const [rows, setRows] = useState<Expense[]>([]);
  const [date, setDate] = useState(todayJkt());
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const { from, to } = monthRange(month);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("spent_on", from)
      .lte("spent_on", to)
      .order("spent_on", { ascending: false });
    if (error) setMsg({ type: "err", text: error.message });
    else setRows((data ?? []) as Expense[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [month]);

  async function add() {
    if (!(Number(amount) > 0)) {
      setMsg({ type: "err", text: "Isi jumlah biaya." });
      return;
    }
    const { error } = await supabase.from("expenses").insert({
      spent_on: date,
      category,
      amount: Number(amount),
      note: note.trim() || null,
    });
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setAmount(""); setNote("");
    setMsg({ type: "ok", text: "Biaya tercatat." });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Hapus catatan biaya ini?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) setMsg({ type: "err", text: error.message });
    else load();
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = Object.entries(
    rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.category]: (m[r.category] ?? 0) + r.amount }), {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageTitle sub="Semua biaya di luar pembelian bahan baku.">Biaya operasional</PageTitle>
      <Notice msg={msg} />

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Catat biaya</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tanggal</Label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Kategori</Label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Jumlah (Rp)</Label>
          <input type="number" inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Catatan (opsional)</Label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className={`${btnCls} w-full`} onClick={add}>Simpan biaya</button>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Rincian bulanan</h2>
        <input type="month" className="h-11 rounded-xl border border-stone-300 bg-white px-3" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      <Card className="mb-4">
        <div className="text-sm text-stone-500">Total biaya bulan ini</div>
        <div className="mb-3 text-xl font-bold tabular-nums">{rupiah(total)}</div>
        {byCat.length === 0 ? (
          <Empty>Belum ada biaya di bulan ini.</Empty>
        ) : (
          <div className="space-y-3">
            {byCat.map(([c, v]) => (
              <div key={c}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{c}</span>
                  <span className="tabular-nums text-stone-500">{rupiah(v)} ({pct(v, total)})</span>
                </div>
                <Bar value={v} max={byCat[0][1]} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {rows.length > 0 && (
        <Card>
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{r.category}</div>
                  <div className="truncate text-stone-500">
                    {r.spent_on}{r.note ? `, ${r.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold tabular-nums">{rupiah(r.amount)}</span>
                  <button className="h-10 px-2 text-red-700" onClick={() => remove(r.id)} aria-label="Hapus biaya">
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
