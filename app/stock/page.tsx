"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { roundStock } from "@/lib/stockround";
import { fmt, rupiah } from "@/lib/format";
import type { StockRow } from "@/lib/types";
import { Card, Empty, Notice, PageTitle, Tabs, btnDangerCls, inputCls, type Msg } from "@/components/ui";
import { IngredientSelect, OpnameForm, PurchaseForm, WasteForm } from "@/components/StockForms";
import OwnerOnly from "@/components/OwnerOnly";
import { loadRole, type RoleState } from "@/lib/authClient";

type Tab = "masuk" | "keluar" | "opname" | "reset";
type Done = (m: Msg) => void;

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("masuk");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [role, setRole] = useState<RoleState>({ status: "loading" });

  async function load() {
    const i = await supabase.from("v_stock").select("*").order("name");
    if (i.error) setMsg({ type: "err", text: i.error.message });
    setRows(roundStock((i.data ?? []) as StockRow[]));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); loadRole().then(setRole); }, []);

  const done: Done = (m) => {
    setMsg(m);
    if (m?.type === "ok") load();
  };

  return (
    <div>
      <PageTitle>Stok bahan</PageTitle>
      <OwnerOnly feature="stok bahan">
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setMsg(null); }}
        tabs={[
          { id: "masuk", label: "Belanja" },
          { id: "keluar", label: "Keluar" },
          { id: "opname", label: "Opname" },
          { id: "reset", label: "Reset" },
        ]}
      />
      <Notice msg={msg} />
      {tab === "masuk" && <PurchaseForm rows={rows} onDone={done} />}
      {tab === "keluar" && <WasteForm rows={rows} onDone={done} />}
      {tab === "opname" && <OpnameForm rows={rows} onDone={done} />}
      {tab === "reset" && (
        <ResetForm rows={rows} blocked={role.status === "ready" && role.role === "staff"} onDone={done} />
      )}
      </OwnerOnly>
    </div>
  );
}

function ResetForm({ rows, blocked, onDone }: { rows: StockRow[]; blocked: boolean; onDone: Done }) {
  const [ing, setIng] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = rows.find((r) => r.id === ing);

  if (blocked) {
    return (
      <Card>
        <p className="text-sm text-stone-600">
          Hanya akun pemilik yang bisa mereset stok bahan. Hubungi pemilik jika ada data stok yang perlu diulang.
        </p>
      </Card>
    );
  }

  async function resetOne() {
    if (!sel) {
      onDone({ type: "err", text: "Pilih bahan yang akan direset." });
      return;
    }
    const ok = confirm(
      `Apakah Anda yakin ingin mereset "${sel.name}"?\n\nStok jadi 0, harga rata-rata jadi Rp0, dan seluruh riwayat stok masuk, keluar, dan opname bahan ini dihapus. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusy(true);
    const { error: mErr } = await supabase.from("stock_movements").delete().eq("ingredient_id", sel.id);
    if (mErr) {
      setBusy(false);
      onDone({ type: "err", text: mErr.message });
      return;
    }
    const { error: iErr } = await supabase.from("ingredients").update({ avg_cost: 0 }).eq("id", sel.id);
    setBusy(false);
    if (iErr) {
      onDone({ type: "err", text: iErr.message });
      return;
    }
    setIng("");
    onDone({ type: "ok", text: `Bahan "${sel.name}" sudah direset. Silakan input stok awal lagi lewat tab Masuk.` });
  }

  async function resetAll() {
    if (confirmText.trim().toUpperCase() !== "RESET") return;
    const ok = confirm(
      `Apakah Anda yakin ingin mereset SEMUA ${rows.length} bahan?\n\nStok semua bahan jadi 0, harga rata-rata jadi Rp0, dan seluruh riwayat stok dihapus. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusy(true);
    const { error: mErr } = await supabase.from("stock_movements").delete().not("id", "is", null);
    if (mErr) {
      setBusy(false);
      onDone({ type: "err", text: mErr.message });
      return;
    }
    const { error: iErr } = await supabase.from("ingredients").update({ avg_cost: 0 }).not("id", "is", null);
    setBusy(false);
    if (iErr) {
      onDone({ type: "err", text: iErr.message });
      return;
    }
    setConfirmText("");
    onDone({ type: "ok", text: "Semua stok bahan sudah direset. Silakan input stok awal lagi lewat tab Masuk." });
  }

  if (rows.length === 0) return <Empty>Belum ada bahan yang bisa direset.</Empty>;

  return (
    <div className="space-y-4">
      <Card className="space-y-2 border-amber-300 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">Reset dipakai untuk mengulang input stok dari awal.</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">
          <li>Yang dihapus: riwayat stok masuk, keluar, opname, dan pemakaian dari penjualan untuk bahan yang direset.</li>
          <li>Yang tetap ada: daftar bahan, resep, menu, data penjualan, dan biaya operasional.</li>
          <li>Angka &quot;belanja bahan baku&quot; di Laporan ikut berkurang karena riwayat pembeliannya dihapus.</li>
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Reset satu bahan</h2>
        <IngredientSelect rows={rows} value={ing} onChange={setIng} />
        {sel && (
          <p className="text-sm text-stone-500">
            Sekarang: stok {fmt(sel.on_hand)} {sel.unit}, harga {rupiah(sel.avg_cost)} per {sel.unit}.
          </p>
        )}
        <button className={`${btnDangerCls} w-full`} onClick={resetOne} disabled={busy || !sel}>
          {busy ? "Memproses…" : "Reset bahan ini"}
        </button>
      </Card>

      <Card className="space-y-3 border-red-300">
        <h2 className="font-semibold text-red-800">Reset semua bahan</h2>
        <p className="text-sm text-stone-600">
          Mengosongkan stok dan riwayat {rows.length} bahan sekaligus. Ketik <b>RESET</b> untuk mengaktifkan tombol.
        </p>
        <input
          className={inputCls}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Ketik RESET"
          autoComplete="off"
        />
        <button
          className={`${btnDangerCls} w-full`}
          onClick={resetAll}
          disabled={busy || confirmText.trim().toUpperCase() !== "RESET"}
        >
          {busy ? "Memproses…" : "Reset semua bahan"}
        </button>
      </Card>
    </div>
  );
}
