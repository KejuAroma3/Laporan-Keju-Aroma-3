import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const ctx = await requireOwner(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: usersRes, error: uErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  const emailById = new Map(usersRes.users.map((u) => [u.id, u.email ?? ""]));

  const staff = (profiles ?? []).map((p) => ({ ...p, email: emailById.get(p.id) ?? "" }));
  return NextResponse.json({ staff });
}

export async function POST(req: Request) {
  const ctx = await requireOwner(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const fullName = String(body?.full_name ?? "").trim() || null;
  const role = body?.role === "owner" ? "owner" : "staff";

  if (!email || !email.includes("@")) return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Kata sandi minimal 6 karakter." }, { status: 400 });

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (cErr || !created?.user) {
    const msg = cErr?.message?.includes("already registered")
      ? "Email tersebut sudah terdaftar."
      : cErr?.message ?? "Gagal membuat akun.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error: profErr } = await admin
    .from("profiles")
    .insert({ id: created.user.id, full_name: fullName, role });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id); // batalkan akun agar tidak jadi akun "yatim"
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}
