"use client";

import { useEffect, useState } from "react";
import { authHeader, loadRole, type RoleState } from "@/lib/authClient";
import { Card, Empty, Label, Notice, PageTitle, btnCls, btnGhostCls, inputCls, type Msg } from "@/components/ui";

type Staff = { id: string; email: string; full_name: string | null; role: "owner" | "staff"; created_at: string };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeader()), ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Terjadi kesalahan.");
  return json;
}

export default function StaffPage() {
  const [roleState, setRoleState] = useState<RoleState>({ status: "loading" });
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    try {
      const json = await api("/api/staff");
      setStaff(json.staff as Staff[]);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memuat daftar karyawan." });
    }
  }

  useEffect(() => {
    loadRole().then((r) => {
      setRoleState(r);
      if (r.status === "ready" && r.role === "owner") load();
    });
  }, []);

  if (roleState.status === "loading") {
    return <p className="py-8 text-center text-sm text-stone-500">Memuat…</p>;
  }

  if (roleState.status === "not-configured") {
    return (
      <div>
        <PageTitle>Karyawan</PageTitle>
        <Card className="space-y-2">
          <p className="text-sm font-medium text-amber-700">Fitur ini belum diaktifkan.</p>
          <p className="text-sm text-stone-600">
            Buka Supabase → SQL Editor, jalankan file <code className="rounded bg-stone-100 px-1">supabase/4-karyawan.sql</code>,
            lalu muat ulang halaman ini. File itu membuat tabel data karyawan dan menjadikan akun Anda
            yang sudah ada sebagai pemilik.
          </p>
        </Card>
      </div>
    );
  }

  if (roleState.status === "no-profile") {
    return (
      <div>
        <PageTitle>Karyawan</PageTitle>
        <Card className="space-y-2">
          <p className="text-sm font-medium text-amber-700">Akun Anda belum terdaftar di menu ini.</p>
          <p className="text-sm text-stone-600">
            Jalankan ulang <code className="rounded bg-stone-100 px-1">supabase/4-karyawan.sql</code> di
            Supabase agar akun Anda terdaftar sebagai pemilik, atau minta pemilik kafe menambahkan akun
            Anda lewat menu ini.
          </p>
        </Card>
      </div>
    );
  }

  if (roleState.role !== "owner") {
    return (
      <div>
        <PageTitle>Karyawan</PageTitle>
        <Card>
          <p className="text-sm text-stone-600">
            Hanya akun pemilik yang bisa menambah atau mengubah akun karyawan. Hubungi pemilik kafe jika
            Anda perlu perubahan pada akun Anda, atau ganti kata sandi Anda sendiri lewat Lainnya → Ubah
            kata sandi saya.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <PageTitle sub="Kelola siapa saja yang bisa masuk ke aplikasi ini.">Karyawan</PageTitle>
        <button className={`${btnCls} h-10 shrink-0 px-3 text-sm`} onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Tutup" : "+ Tambah"}
        </button>
      </div>
      <Notice msg={msg} />

      {showAdd && (
        <AddStaff
          onDone={(m) => {
            setMsg(m);
            if (m?.type === "ok") { setShowAdd(false); load(); }
          }}
        />
      )}

      {staff.length === 0 ? (
        <Empty>Belum ada data karyawan.</Empty>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => (
            <Card key={s.id}>
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.full_name || "(tanpa nama)"}</div>
                  <div className="truncate text-sm text-stone-500">{s.email}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                    s.role === "owner" ? "bg-teal-100 text-teal-800" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {s.role === "owner" ? "Pemilik" : "Staf"}
                </span>
              </button>
              {open === s.id && (
                <EditStaff
                  staff={s}
                  onDone={(m) => {
                    setMsg(m);
                    if (m?.type === "ok") { setOpen(null); load(); }
                  }}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddStaff({ onDone }: { onDone: (m: Msg) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRoleVal] = useState<"staff" | "owner">("staff");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api("/api/staff", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, email, password, role }),
      });
      onDone({ type: "ok", text: "Akun karyawan dibuat. Bagikan email dan kata sandi ini kepadanya." });
    } catch (e) {
      onDone({ type: "err", text: e instanceof Error ? e.message : "Gagal membuat akun." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 space-y-3">
      <div>
        <Label>Nama karyawan</Label>
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Contoh: Sari" />
      </div>
      <div>
        <Label>Email (dipakai untuk masuk / username)</Label>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sari@contoh.com" />
      </div>
      <div>
        <Label>Kata sandi awal</Label>
        <input type="text" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
      </div>
      <div>
        <Label>Peran</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["staff", "owner"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleVal(r)}
              className={`h-11 rounded-xl border text-sm font-semibold ${
                role === r ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              {r === "staff" ? "Staf" : "Pemilik"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Pemilik bisa menambah dan mengubah akun karyawan lain. Staf hanya memakai aplikasi seperti biasa.
        </p>
      </div>
      <button className={`${btnCls} w-full`} onClick={submit} disabled={busy || !fullName || !email || password.length < 6}>
        {busy ? "Membuat…" : "Buat akun"}
      </button>
    </Card>
  );
}

function EditStaff({ staff, onDone }: { staff: Staff; onDone: (m: Msg) => void }) {
  const [fullName, setFullName] = useState(staff.full_name ?? "");
  const [email, setEmail] = useState(staff.email);
  const [password, setPassword] = useState("");
  const [role, setRoleVal] = useState(staff.role);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { full_name: fullName, role };
      if (email !== staff.email) body.email = email;
      if (password) body.password = password;
      await api(`/api/staff/${staff.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onDone({ type: "ok", text: "Data karyawan diperbarui." });
    } catch (e) {
      onDone({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan perubahan." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Hapus akun ${staff.full_name || staff.email}? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try {
      await api(`/api/staff/${staff.id}`, { method: "DELETE" });
      onDone({ type: "ok", text: "Akun karyawan dihapus." });
    } catch (e) {
      onDone({ type: "err", text: e instanceof Error ? e.message : "Gagal menghapus akun." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
      <div>
        <Label>Nama</Label>
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <Label>Email (username login)</Label>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label>Ganti kata sandi (kosongkan jika tidak diubah)</Label>
        <input type="text" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
      </div>
      <div>
        <Label>Peran</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["staff", "owner"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleVal(r)}
              className={`h-11 rounded-xl border text-sm font-semibold ${
                role === r ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              {r === "staff" ? "Staf" : "Pemilik"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className={`${btnGhostCls} text-red-700`} onClick={remove} disabled={busy}>
          Hapus akun
        </button>
        <button className={btnCls} onClick={save} disabled={busy || !fullName || !email}>
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
