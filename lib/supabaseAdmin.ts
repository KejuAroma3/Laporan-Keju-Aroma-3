// Hanya dipakai di rute server (app/api/**/route.ts). JANGAN pernah
// mengimpor file ini dari komponen "use client" — kunci di sini
// punya akses penuh ke seluruh data dan bisa membuat/menghapus akun.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum diisi di server. Tambahkan di .env.local dan di Environment Variables Vercel."
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type OwnerCtx = { admin: SupabaseClient; userId: string };
type AuthError = { error: string; status: number };

// Memastikan yang memanggil rute ini adalah pengguna yang sudah login
// DAN berperan sebagai pemilik (owner). Mengembalikan client admin
// hanya jika keduanya terpenuhi.
export async function requireOwner(req: Request): Promise<OwnerCtx | AuthError> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Anda belum masuk.", status: 401 };

  let admin: SupabaseClient;
  try {
    admin = adminClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Konfigurasi server belum lengkap.", status: 500 };
  }

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) return { error: "Sesi masuk tidak valid, coba masuk ulang.", status: 401 };

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .single();
  if (profErr || profile?.role !== "owner") {
    return { error: "Hanya pemilik yang bisa mengelola akun karyawan.", status: 403 };
  }
  return { admin, userId: userRes.user.id };
}
