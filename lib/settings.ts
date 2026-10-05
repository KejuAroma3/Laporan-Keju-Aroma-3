import { supabase } from "@/lib/supabase";
import { DEFAULT_COLOR } from "@/lib/theme";

export type AppSettings = {
  business_name: string;
  tagline: string;
  logo_url: string | null;
  theme_color: string;
  receipt_width_mm: number;
  receipt_footer: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  business_name: "Keju Aroma Tiga",
  tagline: "Aplikasi Stok dan Penjualan",
  logo_url: null,
  theme_color: DEFAULT_COLOR,
  receipt_width_mm: 58,
  receipt_footer: "Terima kasih!",
};

// Aman dipanggil dari Server Component (layout, manifest) maupun dari
// komponen klien: hanya membaca, dan tabelnya boleh dibaca publik.
// Kalau tabel belum ada (SQL pengaturan belum dijalankan) atau gagal
// diambil, kembalikan nilai bawaan supaya aplikasi tetap tampil normal.
export async function getSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      business_name: data.business_name || DEFAULT_SETTINGS.business_name,
      tagline: data.tagline || DEFAULT_SETTINGS.tagline,
      logo_url: data.logo_url ?? null,
      theme_color: data.theme_color || DEFAULT_SETTINGS.theme_color,
      receipt_width_mm: data.receipt_width_mm || DEFAULT_SETTINGS.receipt_width_mm,
      receipt_footer: data.receipt_footer || DEFAULT_SETTINGS.receipt_footer,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
