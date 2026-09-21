"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const NAV = [
  { href: "/", label: "Beranda", icon: "🏠", match: ["/"] },
  { href: "/sales/new", label: "Jual", icon: "🧾", match: ["/sales/new"] },
  { href: "/stock", label: "Stok", icon: "📦", match: ["/stock"] },
  { href: "/reports", label: "Laporan", icon: "📊", match: ["/reports"] },
  {
    href: "/more",
    label: "Lainnya",
    icon: "☰",
    match: ["/more", "/menu", "/ingredients", "/expenses", "/sales/online-recap"],
  },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && path !== "/login") router.replace("/login");
      else setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [path, router]);

  if (path === "/login") return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-stone-500">Memuat…</div>
    );
  }

  const isActive = (match: string[]) =>
    match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(m + "/")));

  return (
    <div className="min-h-dvh bg-stone-100">
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-16 max-w-2xl">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isActive(n.match) ? "text-teal-800" : "text-stone-500"
              }`}
            >
              <span className="text-xl leading-none">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
