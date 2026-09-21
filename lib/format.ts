import type { Channel } from "./types";

export const CHANNEL_LABEL: Record<Channel, string> = {
  offline: "Offline",
  gofood: "GoFood",
  grabfood: "GrabFood",
  shopeefood: "ShopeeFood",
};

export const rupiah = (n: number) =>
  (n < 0 ? "-Rp" : "Rp") + Math.abs(Math.round(n)).toLocaleString("id-ID");

export const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("id-ID");

export const pct = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-";

// Semua tanggal memakai zona waktu Jakarta (WIB)
const jkt = (d: Date) =>
  d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD

export const todayJkt = () => jkt(new Date());
export const daysAgoJkt = (n: number) => jkt(new Date(Date.now() - n * 86400000));
export const monthStartJkt = () => todayJkt().slice(0, 8) + "01";

export const rangeIso = (from: string, to: string) => ({
  start: `${from}T00:00:00+07:00`,
  end: `${to}T23:59:59.999+07:00`,
});
