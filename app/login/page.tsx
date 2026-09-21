"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Label, Notice, btnCls, inputCls, type Msg } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function login() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: "Email atau password salah." });
      return;
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-stone-100 px-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Kafe Stok</h1>
        <p className="mb-8 mt-1 text-stone-500">Masuk untuk mencatat stok dan penjualan.</p>
        <Notice msg={msg} />
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <input
              type="email"
              autoComplete="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
          </div>
          <button className={`${btnCls} w-full`} onClick={login} disabled={busy || !email || !password}>
            {busy ? "Masuk…" : "Masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}
