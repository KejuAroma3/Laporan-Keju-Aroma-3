import { supabase } from "@/lib/supabase";

// Header Authorization berisi token sesi pengguna yang sedang login,
// dipakai rute /api/staff/* di server untuk memverifikasi siapa pemanggilnya.
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type RoleState =
  | { status: "loading" }
  | { status: "not-configured" } // tabel profiles belum dibuat (SQL karyawan belum dijalankan)
  | { status: "no-profile" } // sudah login, tapi akun ini belum punya baris profil
  | { status: "ready"; role: "owner" | "staff" };

export async function loadRole(): Promise<RoleState> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return { status: "loading" };

  const { data, error } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
  if (error) return { status: "not-configured" };
  if (!data) return { status: "no-profile" };
  return { status: "ready", role: data.role as "owner" | "staff" };
}
