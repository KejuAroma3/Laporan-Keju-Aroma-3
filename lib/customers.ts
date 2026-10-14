import { supabase } from "./supabase";

export type CustomerStat = { name: string; count: number; last: string };

export const custKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Indeks pelanggan dari semua penjualan yang bernama: kunci = nama huruf kecil.
// Gagal (kolom belum ada, SQL 22 belum dijalankan) = indeks kosong.
export async function fetchCustomerIndex(): Promise<Map<string, CustomerStat>> {
  const index = new Map<string, CustomerStat>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("sales")
      .select("customer_name, sold_at")
      .not("customer_name", "is", null)
      .order("sold_at", { ascending: false })
      .range(from, from + 999);
    if (error) return new Map();
    const rows = (data ?? []) as { customer_name: string; sold_at: string }[];
    for (const r of rows) {
      const k = custKey(r.customer_name);
      if (!k) continue;
      const cur = index.get(k);
      if (cur) cur.count += 1;
      else index.set(k, { name: r.customer_name.trim(), count: 1, last: r.sold_at });
    }
    if (rows.length < 1000) break;
  }
  return index;
}

// Simpan nama pelanggan pada penjualan. Memakai penulisan nama yang sudah ada supaya tidak ganda
// ("bu rina" dan "Bu Rina" dianggap orang yang sama). Mengembalikan pesan kesalahan atau null.
export async function saveCustomerName(
  saleId: string,
  input: string,
  index: Map<string, CustomerStat>
): Promise<string | null> {
  const name = input.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const { error } = await supabase
    .from("sales")
    .update({ customer_name: index.get(custKey(name))?.name ?? name })
    .eq("id", saleId);
  if (!error) return null;
  return /customer_name|schema cache/i.test(error.message)
    ? "Nama pelanggan belum bisa disimpan: jalankan supabase/22-nama-pelanggan.sql di Supabase (SQL Editor)."
    : `Nama pelanggan gagal disimpan (${error.message}).`;
}

export const lastOrderLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
