"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

const LINKS = [
  { href: "/sales/new", title: "Penjualan offline", desc: "Catat transaksi tunai atau QRIS di tempat" },
  { href: "/sales/online-recap", title: "Rekap penjualan", desc: "Offline, GoFood, GrabFood, ShopeeFood — bisa untuk tanggal yang sudah lewat" },
  { href: "/menu", title: "Menu dan resep", desc: "Harga jual, resep, foto produk, dan estimasi margin" },
  { href: "/ingredients", title: "Bahan baku", desc: "Daftar bahan, satuan, batas stok minimum" },
  { href: "/expenses", title: "Biaya operasional", desc: "Sewa, gaji, listrik, gas, dan lainnya" },
  { href: "/staff", title: "Karyawan", desc: "Tambah akun staf, ubah email dan kata sandi" },
];

export default function MorePage() {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div>
      <PageTitle>Lainnya</PageTitle>
      <div className="space-y-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="block">
            <Card className="active:bg-stone-50">
              <div className="font-semibold">{l.title}</div>
              <div className="text-sm text-stone-500">{l.desc}</div>
            </Card>
          </Link>
        ))}
      </div>

      <ChangePassword />

      <button className={`${btnGhostCls} mt-6 w-full`} onClick={logout}>
        Keluar
      </button>
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit() {
    if (password.length < 6) { setMsg({ type: "err", text: "Kata sandi minimal 6 karakter." }); return; }
    if (password !== confirmPw) { setMsg({ type: "err", text: "Konfirmasi kata sandi tidak sama." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setPassword(""); setConfirmPw(""); setOpen(false);
    setMsg({ type: "ok", text: "Kata sandi Anda berhasil diganti." });
  }

  return (
    <Card className="mt-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <div>
          <div className="font-semibold">Ubah kata sandi saya</div>
          <div className="text-sm text-stone-500">Untuk akun yang sedang Anda pakai</div>
        </div>
        <span className="text-sm text-teal-800">{open ? "Tutup" : "Ubah"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <Notice msg={msg} />
          <div>
            <Label>Kata sandi baru</Label>
            <input type="text" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
          </div>
          <div>
            <Label>Ulangi kata sandi baru</Label>
            <input type="text" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </div>
          <button className={`${btnCls} w-full`} onClick={submit} disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan kata sandi baru"}
          </button>
        </div>
      )}
    </Card>
  );
}
