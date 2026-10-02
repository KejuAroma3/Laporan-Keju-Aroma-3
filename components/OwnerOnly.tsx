"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadRole, type RoleState } from "@/lib/authClient";
import { Card } from "@/components/ui";

// Membungkus isi halaman yang hanya boleh diakses pemilik. Staf tetap
// melihat judul halaman (di luar komponen ini) tapi bukan isinya.
// Catatan: ini pembatasan TAMPILAN saja, bukan di database (RLS).
export default function OwnerOnly({ children, feature }: { children: ReactNode; feature?: string }) {
  const [state, setState] = useState<RoleState>({ status: "loading" });

  useEffect(() => {
    loadRole().then(setState);
  }, []);

  if (state.status === "loading") {
    return <p className="py-8 text-center text-sm text-stone-500">Memuat…</p>;
  }

  if (state.status === "not-configured") {
    return (
      <Card className="space-y-2">
        <p className="text-sm font-medium text-amber-700">Fitur pembagian akses belum diaktifkan.</p>
        <p className="text-sm text-stone-600">
          Jalankan <code className="rounded bg-stone-100 px-1">supabase/4-karyawan.sql</code> di Supabase → SQL
          Editor, lalu muat ulang halaman ini.
        </p>
      </Card>
    );
  }

  if (state.status === "no-profile") {
    return (
      <Card>
        <p className="text-sm text-stone-600">
          Akun Anda belum terdaftar. Hubungi pemilik untuk mendapatkan akses{feature ? ` ke ${feature}` : ""}.
        </p>
      </Card>
    );
  }

  if (state.role !== "owner") {
    return (
      <Card>
        <p className="text-sm text-stone-600">
          Hanya akun pemilik yang bisa mengakses{feature ? ` ${feature}` : " halaman ini"}.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
