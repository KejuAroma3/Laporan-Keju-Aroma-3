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

// ---------- Tanggal (semua dihitung dalam zona waktu Jakarta / WIB) ----------

const jkt = (d: Date) =>
  d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD

export const todayJkt = () => jkt(new Date());
export const daysAgoJkt = (n: number) => jkt(new Date(Date.now() - n * 86400000));
export const monthStartJkt = () => todayJkt().slice(0, 8) + "01";

export const rangeIso = (from: string, to: string) => ({
  start: `${from}T00:00:00+07:00`,
  end: `${to}T23:59:59.999+07:00`,
});

// Tanggal (YYYY-MM-DD) di sini adalah tanggal kalender murni, bukan waktu.
// Perhitungan memakai Date.UTC supaya tidak bergeser oleh zona waktu perangkat/server.
type Ymd = { y: number; m: number; d: number };
const parts = (s: string): Ymd => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};
const fromUtcMs = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDaysIso = (s: string, n: number) => {
  const { y, m, d } = parts(s);
  return fromUtcMs(Date.UTC(y, m - 1, d) + n * 86400000);
};

export const addMonthsIso = (s: string, n: number) => {
  const { y, m } = parts(s);
  return fromUtcMs(Date.UTC(y, m - 1 + n, 1));
};

export const monthStartIso = (s: string) => {
  const { y, m } = parts(s);
  return fromUtcMs(Date.UTC(y, m - 1, 1));
};

export const monthEndIso = (s: string) => {
  const { y, m } = parts(s);
  return fromUtcMs(Date.UTC(y, m, 0)); // hari terakhir bulan m (m sudah 1-indeks)
};

// Senin sebagai awal minggu
export const startOfWeekIso = (s: string) => {
  const { y, m, d } = parts(s);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0=Minggu..6=Sabtu
  const shift = dow === 0 ? -6 : 1 - dow;
  return fromUtcMs(t + shift * 86400000);
};
export const endOfWeekIso = (s: string) => addDaysIso(startOfWeekIso(s), 6);

const fullDateFmt: Intl.DateTimeFormatOptions = {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
};
const dayMonthFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
const dayOnlyFmt: Intl.DateTimeFormatOptions = { day: "numeric", timeZone: "UTC" };
const monthYearFmt: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", timeZone: "UTC" };

export const labelDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("id-ID", fullDateFmt);

export const labelWeek = (from: string, to: string) => {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return sameMonth
    ? `${a.toLocaleDateString("id-ID", dayOnlyFmt)}\u2013${b.toLocaleDateString("id-ID", dayMonthFmt)}`
    : `${a.toLocaleDateString("id-ID", dayMonthFmt)} \u2013 ${b.toLocaleDateString("id-ID", dayMonthFmt)}`;
};

export const labelMonth = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("id-ID", monthYearFmt);
