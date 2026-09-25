import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabaseAdmin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOwner(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;

  const body = await req.json().catch(() => null);
  const authUpdates: { email?: string; password?: string; user_metadata?: { full_name: string | null } } = {};

  if (typeof body?.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    if (!email.includes("@")) return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });
    authUpdates.email = email;
  }
  if (typeof body?.password === "string" && body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: "Kata sandi minimal 6 karakter." }, { status: 400 });
    authUpdates.password = body.password;
  }
  const fullNameProvided = typeof body?.full_name === "string";
  const fullName = fullNameProvided ? body.full_name.trim() || null : undefined;
  if (fullNameProvided) authUpdates.user_metadata = { full_name: fullName as string | null };

  if (Object.keys(authUpdates).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(params.id, authUpdates);
    if (error) {
      const msg = error.message?.includes("already registered") ? "Email tersebut sudah dipakai akun lain." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const profileUpdates: Record<string, unknown> = {};
  if (fullNameProvided) profileUpdates.full_name = fullName;
  if (body?.role === "owner" || body?.role === "staff") profileUpdates.role = body.role;

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await admin.from("profiles").update(profileUpdates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOwner(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, userId } = ctx;

  if (params.id === userId) {
    return NextResponse.json({ error: "Tidak bisa menghapus akun yang sedang Anda pakai." }, { status: 400 });
  }

  const { data: target } = await admin.from("profiles").select("role").eq("id", params.id).single();
  if (target?.role === "owner") {
    const { data: owners } = await admin.from("profiles").select("id").eq("role", "owner");
    if ((owners?.length ?? 0) <= 1) {
      return NextResponse.json({ error: "Tidak bisa menghapus satu-satunya pemilik." }, { status: 400 });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("profiles").delete().eq("id", params.id); // jaga-jaga bila cascade tertunda
  return NextResponse.json({ ok: true });
}
