import { supabase } from "@/lib/supabase";
import { DEFAULT_COLOR } from "@/lib/theme";

export type AppSettings = {
  business_name: string;
  tagline: string;
  logo_url: string | null;
  theme_color: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  business_name: "Keju Aroma Tiga",
  tagline: "Aplikasi Stok dan Penjualan",
  logo_url: null,
  theme_color: DEFAULT_COLOR,
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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
