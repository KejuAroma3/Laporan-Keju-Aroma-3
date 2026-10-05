// Format struk untuk printer thermal 58mm/80mm, dipakai baik untuk cetak
// biasa (HTML, lewat window.print()) maupun cetak Bluetooth langsung
// (ESC/POS, teks polos dengan lebar karakter yang sama).

export type ReceiptItem = { name: string; qty: number; unit_price: number };
export type ReceiptData = {
  business_name: string;
  tagline: string;
  sold_at: string; // ISO
  channel_label: string;
  items: ReceiptItem[];
  discount: number;
  platform_fee: number;
  footer: string;
};

// Printer thermal umumnya muat sekitar 32 karakter per baris di kertas
// 58mm, dan 48 karakter di kertas 80mm (huruf ukuran standar).
export function charsPerLine(widthMm: number): number {
  return widthMm >= 72 ? 48 : 32;
}

const rupiahPlain = (n: number) => Math.round(n).toLocaleString("id-ID");

function padLine(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > width) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const timeWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Menghasilkan struk sebagai baris-baris teks monospace, siap dipakai untuk
// tampilan HTML (<pre>) maupun dikirim sebagai teks polos ke printer.
export function buildReceiptLines(data: ReceiptData, widthMm: number): string[] {
  const w = charsPerLine(widthMm);
  const sep = "-".repeat(w);
  const dSep = "=".repeat(w);
  const lines: string[] = [];

  lines.push(center(data.business_name, w));
  if (data.tagline) lines.push(center(data.tagline, w));
  lines.push(dSep);
  lines.push(`${timeWib(data.sold_at)}`);
  lines.push(`Platform: ${data.channel_label}`);
  lines.push(sep);

  let subtotal = 0;
  for (const it of data.items) {
    const total = it.qty * it.unit_price;
    subtotal += total;
    lines.push(...wrap(it.name, w));
    lines.push(padLine(`  ${it.qty} x ${rupiahPlain(it.unit_price)}`, rupiahPlain(total), w));
  }

  lines.push(sep);
  lines.push(padLine("Subtotal", rupiahPlain(subtotal), w));
  if (data.discount > 0) lines.push(padLine("Diskon", `-${rupiahPlain(data.discount)}`, w));
  if (data.platform_fee > 0) lines.push(padLine("Komisi platform", `-${rupiahPlain(data.platform_fee)}`, w));
  lines.push(dSep);
  const total = subtotal - data.discount - data.platform_fee;
  lines.push(padLine("TOTAL", rupiahPlain(total), w));
  lines.push(dSep);
  if (data.footer) {
    lines.push("");
    for (const l of wrap(data.footer, w)) lines.push(center(l, w));
  }
  return lines;
}

// ---------- ESC/POS, untuk cetak Bluetooth langsung ----------
const ESC = 0x1b;
const GS = 0x1d;

export function buildEscPosBytes(data: ReceiptData, widthMm: number): Uint8Array {
  const lines = buildReceiptLines(data, widthMm);
  const text = lines.join("\n") + "\n";
  const body = new TextEncoder().encode(text);
  const init = new Uint8Array([ESC, 0x40]); // reset printer
  const feedAndCut = new Uint8Array([0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]); // feed + full cut (diabaikan printer yang tak punya pemotong)
  const out = new Uint8Array(init.length + body.length + feedAndCut.length);
  out.set(init, 0);
  out.set(body, init.length);
  out.set(feedAndCut, init.length + body.length);
  return out;
}
