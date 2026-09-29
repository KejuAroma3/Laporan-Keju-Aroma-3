// Warna default (sama persis dengan teal-700 Tailwind) memakai nilai
// bawaan Tailwind apa adanya, supaya tampilan tidak berubah sama sekali
// selama pemilik belum mengganti warna tema.
export const DEFAULT_COLOR = "#0f766e";
const DEFAULT_SHADES: Record<Shade, string> = {
  "50": "240 253 250",
  "100": "204 251 241",
  "600": "13 148 136",
  "700": "15 118 110",
  "800": "17 94 89",
  "900": "19 78 74",
};

export type Shade = "50" | "100" | "600" | "700" | "800" | "900";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// Menghasilkan enam nada (50/100/600/700/800/900) dari satu warna yang
// dipilih pemilik (dianggap sebagai nada "700", warna utama), supaya
// tombol, badge, dan status hover/aktif di seluruh aplikasi tetap serasi.
export function buildShades(hex: string): Record<Shade, string> {
  if (hex.trim().toLowerCase() === DEFAULT_COLOR) return DEFAULT_SHADES;
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_SHADES;
  const [h, s, l] = rgbToHsl(...rgb);
  const at = (dl: number, sMul = 1): string => hslToRgb(h, clamp(s * sMul), clamp(l + dl)).join(" ");
  return {
    "50": at(clamp(95 - l), 0.35),
    "100": at(clamp(85 - l), 0.5),
    "600": at(6),
    "700": at(0),
    "800": at(-9),
    "900": at(-16),
  };
}

export function isValidHexColor(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

// Memilih warna teks (putih atau nyaris hitam) yang kontrasnya paling
// tinggi di atas warna tema pilihan pemilik, memakai rumus kontras WCAG.
// Perlu supaya warna terang seperti kuning tetap terbaca saat dipakai
// sebagai latar tombol dengan teks di atasnya.
export function pickForegroundRgb(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "255 255 255";
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb;
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrastWithWhite = 1.05 / (l + 0.05);
  const contrastWithBlack = (l + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? "255 255 255" : "23 23 23";
}
