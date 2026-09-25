"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Thumb } from "@/components/BestSellerList";
import { btnGhostCls } from "@/components/ui";

const MAX_DIM = 1000; // px, agar hemat data dan ruang penyimpanan
const QUALITY = 0.82;
const BUCKET = "produk";

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Perangkat tidak mendukung pemrosesan gambar."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("Gagal memproses gambar."));
        },
        "image/jpeg",
        QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("File bukan gambar yang valid."));
    };
    img.src = url;
  });
}

export default function PhotoUpload({
  value,
  onChange,
  pathPrefix,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  pathPrefix: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setErr("File harus berupa gambar (JPG atau PNG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("Ukuran file maksimum 10 MB.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const blob = await compress(file);
      const path = `products/${pathPrefix}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengunggah foto. Periksa koneksi internet.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Thumb url={value} name="Foto produk" size={64} />
      <div className="flex-1 space-y-1">
        <div className="flex gap-2">
          <button
            type="button"
            className={`${btnGhostCls} h-10 px-3 text-sm`}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Mengunggah…" : value ? "Ganti foto" : "Unggah foto"}
          </button>
          {value && !busy && (
            <button
              type="button"
              className={`${btnGhostCls} h-10 px-3 text-sm text-red-700`}
              onClick={() => onChange(null)}
            >
              Hapus
            </button>
          )}
        </div>
        {err ? (
          <p className="text-xs text-red-700">{err}</p>
        ) : (
          <p className="text-xs text-stone-500">JPG/PNG, otomatis dikecilkan agar hemat data.</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
