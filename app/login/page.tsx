"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS, getSettings, type AppSettings } from "@/lib/settings";
import { Label, Notice, btnCls, inputCls, type Msg } from "@/components/ui";

const REMEMBER_KEY = "kejuAromaTiga.rememberedEmail";

export default function LoginPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    const saved = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) setEmail(saved);
  }, []);

  async function login() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: "Email atau password salah." });
      return;
    }
    if (typeof window !== "undefined") {
      if (remember) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-stone-100 px-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings.logo_url || "/icons/icon-512.png"}
            alt={settings.business_name}
            className="mb-4 h-20 w-20 rounded-2xl object-cover shadow-sm"
          />
          <h1 className="text-2xl font-bold tracking-tight">{settings.business_name}</h1>
          <p className="mt-1 text-stone-500">{settings.tagline}</p>
        </div>
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
            <p className="mt-1 text-xs text-stone-400">Browser Anda biasanya akan menawarkan untuk menyimpan kata sandi ini secara aman.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-700"
            />
            Ingat email saya
          </label>
          <button className={`${btnCls} w-full`} onClick={login} disabled={busy || !email || !password}>
            {busy ? "Masuk…" : "Masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}
