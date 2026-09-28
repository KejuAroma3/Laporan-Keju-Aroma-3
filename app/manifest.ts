import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  const icons: MetadataRoute.Manifest["icons"] = s.logo_url
    ? [
        { src: s.logo_url, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: s.logo_url, sizes: "512x512", type: "image/png", purpose: "any" },
        // Ikon maskable tetap pakai bawaan: perlu ruang aman di tepi
        // supaya tidak terpotong aneh saat dibentuk lingkaran/persegi
        // oleh Android, dan logo unggahan belum tentu punya ruang itu.
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];

  return {
    name: `Aplikasi Stok dan Penjualan ${s.business_name}`,
    short_name: s.business_name,
    description: `Stok, penjualan, dan laporan keuangan ${s.business_name}`,
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f4",
    theme_color: s.theme_color,
    icons,
  };
}
