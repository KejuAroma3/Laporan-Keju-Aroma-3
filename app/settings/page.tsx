"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadRole, type RoleState } from "@/lib/authClient";
import { DEFAULT_SETTINGS, getSettings, type AppSettings } from "@/lib/settings";
import { isValidHexColor } from "@/lib/theme";
import { Card, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";
import PhotoUpload from "@/components/PhotoUpload";

const PRESET_COLORS = [
  { name: "Teal (bawaan)", value: "#0f766e" },
  { name: "Merah bata", value: "#b91c1c" },
  { name: "Biru", value: "#1d4ed8" },
  { name: "Ungu", value: "#7e22ce" },
  { name: "Oranye", value: "#c2410c" },
  { name: "Hijau daun", value: "#15803d" },
];

export default function SettingsPage() {
  const [roleState, setRoleState] = useState<RoleState>({ status: "loading" });
  const [tableReady, setTableReady] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [color, setColor] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [receiptWidth, setReceiptWidth] = useState(58);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadRole().then(setRoleState);
    supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .then(({ error }) => setTableReady(!error));
    getSettings().then((s) => {
      setSettings(s);
      setName(s.business_name);
      setTagline(s.tagline);
      setColor(s.theme_color);
      setLogoUrl(s.logo_url);
      setReceiptWidth(s.receipt_width_mm);
      setReceiptFooter(s.receipt_footer);
    });
  }, []);

  async function save() {
    if (!name.trim()) {
      setMsg({ type: "err", text: "Nama usaha tidak boleh kosong." });
      return;
    }
    if (!isValidHexColor(color)) {
      setMsg({ type: "err", text: "Warna tidak valid. Gunakan format seperti #0f766e." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("app_settings")
      .update({
        business_name: name.trim(),
        tagline: tagline.trim() || DEFAULT_SETTINGS.tagline,
        theme_color: color,
        logo_url: logoUrl,
        receipt_width_mm: receiptWidth,
        receipt_footer: receiptFooter.trim() || DEFAULT_SETTINGS.receipt_footer,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setSaved(true);
    setMsg({ type: "ok", text: "Pengaturan tersimpan." });
  }

  if (roleState.status === "loading" || tableReady === null) {
    return <p className="py-8 text-center text-sm text-stone-500">Memuat…</p>;
  }

  if (roleState.status === "not-configured" || roleState.status === "no-profile") {
    return (
      <div>
        <PageTitle>Pengaturan</PageTitle>
        <Card className="space-y-2">
          <p className="text-sm font-medium text-amber-700">Fitur ini butuh menu Karyawan aktif dulu.</p>
          <p className="text-sm text-stone-600">
            Jalankan <code className="rounded bg-stone-100 px-1">supabase/4-karyawan.sql</code> lalu{" "}
            <code className="rounded bg-stone-100 px-1">supabase/6-pengaturan-aplikasi.sql</code> di Supabase,
            lalu muat ulang halaman ini.
          </p>
        </Card>
      </div>
    );
  }

  if (roleState.role !== "owner") {
    return (
      <div>
        <PageTitle>Pengaturan</PageTitle>
        <Card>
          <p className="text-sm text-stone-600">
            Hanya akun pemilik yang bisa mengubah nama usaha, logo, dan warna tema aplikasi.
          </p>
        </Card>
      </div>
    );
  }

  if (!tableReady) {
    return (
      <div>
        <PageTitle>Pengaturan</PageTitle>
        <Card className="space-y-2">
          <p className="text-sm font-medium text-amber-700">Fitur ini belum diaktifkan.</p>
          <p className="text-sm text-stone-600">
            Jalankan <code className="rounded bg-stone-100 px-1">supabase/6-pengaturan-aplikasi.sql</code> di
            Supabase → SQL Editor, lalu muat ulang halaman ini.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle sub="Nama, logo, dan warna tema ini berlaku untuk seluruh aplikasi.">Pengaturan</PageTitle>
      <Notice msg={msg} />

      {saved && (
        <Card className="mb-4 border-brand-700 bg-brand-50">
          <p className="mb-2 text-sm text-brand-900">
            Perubahan sudah tersimpan. Muat ulang aplikasi supaya warna dan nama baru tampil di semua halaman.
          </p>
          <button className={`${btnCls} w-full`} onClick={() => window.location.reload()}>
            Muat ulang sekarang
          </button>
        </Card>
      )}

      <Card className="mb-4 space-y-4">
        <h2 className="font-semibold">Nama usaha</h2>
        <div>
          <Label>Nama usaha</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Keju Aroma Tiga" />
        </div>
        <div>
          <Label>Tagline (tampil di layar masuk)</Label>
          <input className={inputCls} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Contoh: Aplikasi Stok dan Penjualan" />
        </div>
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Logo</h2>
        <PhotoUpload value={logoUrl} onChange={setLogoUrl} pathPrefix="branding-logo" />
        <p className="text-xs text-stone-500">
          Gunakan gambar persegi (contoh 512×512 px) untuk hasil terbaik. Logo tampil di layar masuk dan ikon
          aplikasi di layar utama HP (butuh muat ulang atau pasang ulang aplikasi untuk terlihat di ikon HP).
        </p>
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Warna tema</h2>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={isValidHexColor(color) ? color : "#0f766e"}
            onChange={(e) => setColor(e.target.value)}
            className="h-12 w-16 shrink-0 cursor-pointer rounded-lg border border-stone-300 bg-white p-1"
            aria-label="Pilih warna tema"
          />
          <input
            className={inputCls}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#0f766e"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_COLORS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setColor(p.value)}
              className={`flex h-11 items-center gap-2 rounded-xl border px-2 text-xs font-medium ${
                color.toLowerCase() === p.value ? "border-stone-800" : "border-stone-300"
              }`}
            >
              <span className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: p.value }} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          Dipakai untuk warna tombol utama, tab aktif, dan status di seluruh aplikasi.
        </p>
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Format struk</h2>
        <div>
          <Label>Ukuran kertas bawaan</Label>
          <div className="grid grid-cols-2 gap-2">
            {[58, 80].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setReceiptWidth(w)}
                className={`h-11 rounded-xl border text-sm font-semibold ${
                  receiptWidth === w ? "border-brand-700 bg-brand-700 text-brand-fg" : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                {w}mm
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">Masih bisa diganti per struk saat mencetak.</p>
        </div>
        <div>
          <Label>Teks penutup struk</Label>
          <input className={inputCls} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="Terima kasih!" />
        </div>
      </Card>

      <button className={`${btnCls} w-full`} onClick={save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan pengaturan"}
      </button>
      {settings.logo_url !== logoUrl || settings.business_name !== name ? (
        <p className="mt-2 text-center text-xs text-stone-400">Ada perubahan yang belum disimpan.</p>
      ) : null}
    </div>
  );
}
