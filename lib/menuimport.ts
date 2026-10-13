import { parseCsv } from "./csv";
import type { Channel, MenuItem } from "./types";

export type PriceMapLike = Record<string, Partial<Record<Channel, number>>>;

export const EXPORT_HEADER = [
  "nama",
  "kategori",
  "produk_dasar",
  "varian",
  "isi_per_penjualan",
  "harga_offline",
  "harga_gofood",
  "harga_grabfood",
  "harga_shopeefood",
  "tampil_di_jual",
  "hpp_info_tidak_diimpor",
];

// Angka dari Excel/CSV: "22000", "22.000", "Rp 22.000", "22000,5". Hasil NaN kalau bukan angka.
export function parseNum(raw: string): number {
  let s = raw.replace(/rp/gi, "").replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string[]> = {
  name: ["nama", "name", "menu", "namamenu"],
  category: ["kategori", "category"],
  group: ["produkdasar", "produk", "grup", "group"],
  variant: ["varian", "namavarian", "variant"],
  pack: ["isiperpenjualan", "isi", "isipcs", "packqty", "pack"],
  offline: ["hargaoffline", "harga", "price", "offline", "hargajual"],
  gofood: ["hargagofood", "gofood"],
  grabfood: ["hargagrabfood", "grabfood", "grab"],
  shopeefood: ["hargashopeefood", "shopeefood", "shopee"],
  active: ["tampildijual", "tampil", "aktif", "active"],
};

export type PlanRow = {
  line: number;
  name: string;
  error: string | null;
  existing: MenuItem | null;
  category?: string;
  group?: string;
  variant?: string;
  pack?: number;
  price?: number;
  active?: boolean;
  prices: Partial<Record<Channel, number>>; // 0 = hapus harga khusus platform itu
  changes: string[]; // ringkasan perubahan (untuk pratinjau)
};

const CH: Channel[] = ["gofood", "grabfood", "shopeefood"];
const CH_LABEL: Record<string, string> = { offline: "Offline", gofood: "GoFood", grabfood: "GrabFood", shopeefood: "ShopeeFood" };
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

// Menyusun rencana impor dari teks CSV. Kolom yang tidak ada di file atau dikosongkan = tidak diubah.
// Nama menu dicocokkan tanpa membedakan huruf besar/kecil: nama sama = ubah, nama baru = tambah.
export function planImport(
  text: string,
  menus: MenuItem[],
  groupNameById: Map<string, string>,
  prices: PriceMapLike
): { rows: PlanRow[]; known: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], known: [] };
  const header = table[0].map(norm);
  const col = (key: string) => header.findIndex((h) => ALIASES[key].includes(h));
  const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)])) as Record<string, number>;
  const known = Object.keys(idx).filter((k) => idx[k] !== -1);
  // tanpa baris judul: urutan kolom bawaan nama, kategori, harga (format lama)
  const hasHeader = idx.name !== -1;
  if (!hasHeader) {
    idx.name = 0;
    idx.category = 1;
    idx.offline = 2;
  }
  const data = hasHeader ? table.slice(1) : table;
  const offset = hasHeader ? 2 : 1;
  const byName = new Map(menus.map((m) => [m.name.trim().toLowerCase(), m]));
  const seen = new Set<string>();
  const get = (cols: string[], k: string) => (idx[k] === -1 || idx[k] === undefined ? "" : (cols[idx[k]] ?? "").trim());

  const rows = data.map((cols, i): PlanRow => {
    const name = get(cols, "name");
    const row: PlanRow = { line: i + offset, name, error: null, existing: null, prices: {}, changes: [] };
    const key = name.toLowerCase();
    if (!name) return { ...row, error: "Nama menu kosong." };
    if (seen.has(key)) return { ...row, error: "Nama menu ganda di dalam file ini." };
    seen.add(key);
    const ex = byName.get(key) ?? null;
    row.existing = ex;

    const bad: string[] = [];
    const num = (k: string, label: string, min: number): number | undefined => {
      const raw = get(cols, k);
      if (!raw) return undefined;
      const n = parseNum(raw);
      if (Number.isNaN(n) || n < min) {
        bad.push(`${label} tidak valid`);
        return undefined;
      }
      return n;
    };
    row.price = num("offline", "Harga offline", 0.000001);
    row.pack = num("pack", "Isi per penjualan", 0.000001);
    for (const c of CH) {
      const n = num(c, `Harga ${CH_LABEL[c]}`, 0);
      if (n !== undefined) row.prices[c] = n;
    }
    const cat = get(cols, "category");
    if (cat) row.category = cat;
    const grp = get(cols, "group");
    if (grp) row.group = grp;
    const variant = get(cols, "variant");
    if (variant) row.variant = variant;
    const act = get(cols, "active").toLowerCase();
    if (act) {
      if (["ya", "y", "1", "true", "aktif", "tampil"].includes(act)) row.active = true;
      else if (["tidak", "t", "0", "false", "sembunyi", "nonaktif"].includes(act)) row.active = false;
      else bad.push("Kolom tampil_di_jual isi ya/tidak");
    }
    if (bad.length > 0) return { ...row, error: bad.join(", ") + "." };
    if (!ex && !row.price) return { ...row, error: "Menu baru wajib punya harga_offline." };

    // ringkasan perubahan terhadap data sekarang
    const ch = row.changes;
    if (!ex) {
      ch.push(`Menu baru, ${rp(row.price!)}`);
      if (row.group) ch.push(`produk dasar ${row.group}${row.variant ? ` / ${row.variant}` : ""}`);
    } else {
      if (row.price !== undefined && row.price !== Number(ex.price)) ch.push(`harga offline ${rp(Number(ex.price))} → ${rp(row.price)}`);
      if (row.category !== undefined && row.category !== (ex.category ?? "")) ch.push(`kategori → ${row.category}`);
      const curGroup = ex.product_group_id ? groupNameById.get(ex.product_group_id) ?? "" : "";
      if (row.group !== undefined && row.group.toLowerCase() !== curGroup.toLowerCase()) ch.push(`produk dasar → ${row.group}`);
      if (row.variant !== undefined && row.variant !== (ex.variant_name ?? "")) ch.push(`varian → ${row.variant}`);
      if (row.pack !== undefined && row.pack !== (ex.pack_qty ?? 1)) ch.push(`isi ${ex.pack_qty ?? 1} → ${row.pack}`);
      if (row.active !== undefined && row.active !== ex.is_active) ch.push(row.active ? "ditampilkan di jual" : "disembunyikan dari jual");
    }
    for (const c of CH) {
      const v = row.prices[c];
      if (v === undefined) continue;
      const cur = ex ? prices[ex.id]?.[c] : undefined;
      if (v === 0) {
        if (cur) ch.push(`harga ${CH_LABEL[c]} dihapus (ikut harga dasar)`);
        else delete row.prices[c];
      } else if (v !== cur) ch.push(`harga ${CH_LABEL[c]} ${cur ? rp(cur) + " → " : ""}${rp(v)}`);
      else delete row.prices[c];
    }
    return row;
  });
  return { rows, known };
}

export function buildExport(
  menus: MenuItem[],
  groupNameById: Map<string, string>,
  prices: PriceMapLike,
  hppOf: (m: MenuItem) => number
): (string | number)[][] {
  const rows = [...menus].sort(
    (a, b) => (a.category ?? "").localeCompare(b.category ?? "", "id") || a.name.localeCompare(b.name, "id")
  );
  return [
    EXPORT_HEADER,
    ...rows.map((m) => [
      m.name,
      m.category ?? "",
      m.product_group_id ? groupNameById.get(m.product_group_id) ?? "" : "",
      m.variant_name ?? "",
      m.pack_qty ?? 1,
      Number(m.price),
      prices[m.id]?.gofood ?? "",
      prices[m.id]?.grabfood ?? "",
      prices[m.id]?.shopeefood ?? "",
      m.is_active ? "ya" : "tidak",
      Math.round(hppOf(m)) || "",
    ]),
  ];
}

export const EMPTY_TEMPLATE: (string | number)[][] = [
  EXPORT_HEADER,
  ["Keju Aroma Original isi 5", "Keju Aroma", "Keju Aroma", "Original isi 5", 5, 45000, 52000, 52000, 50000, "ya", ""],
  ["Es Kopi Susu", "Minuman", "", "", 1, 22000, "", "", "", "ya", ""],
];
