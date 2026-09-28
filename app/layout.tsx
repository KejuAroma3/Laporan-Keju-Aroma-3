import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";
import { getSettings } from "@/lib/settings";
import { buildShades } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: `${s.business_name} | Stok & Penjualan`,
    description: `Stok, penjualan, dan laporan keuangan ${s.business_name}`,
    appleWebApp: {
      capable: true,
      title: s.business_name,
      statusBarStyle: "default",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover", // agar area aman iPhone (env(safe-area-inset-bottom)) terbaca
    themeColor: s.theme_color,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const shades = buildShades(settings.theme_color);
  const brandCss = `:root{${Object.entries(shades)
    .map(([k, v]) => `--brand-${k}:${v};`)
    .join("")}}`;

  return (
    <html lang="id">
      <head>
        {/* Warna tema dari menu Pengaturan, ditimpa di atas nilai bawaan globals.css */}
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
      </head>
      <body className="bg-stone-100 text-stone-900 antialiased">
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}
