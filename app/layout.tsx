import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Kafe Stok",
  description: "Stok, penjualan, dan laporan keuangan kafe",
  appleWebApp: {
    capable: true,
    title: "Kafe Stok",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // agar area aman iPhone (env(safe-area-inset-bottom)) terbaca
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-stone-100 text-stone-900 antialiased">
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}
