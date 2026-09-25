"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { rupiah } from "@/lib/format";
import { Card, Notice, PageTitle, btnCls, btnGhostCls, type Msg } from "@/components/ui";

type Row = {
  line: number;
  name: string;
  category: string;
  price: number;
  error: string | null;
};

const TEMPLATE_ROWS: (string | number)[][] = [
  ["nama", "kategori", "harga"],
  ["Es Kopi Susu", "Kopi", 22000],
  ["Roti Bakar Coklat", "Makanan", 18000],
  ["Air Mineral", "Minuman", 8000],
];

function parseRows(text: string): Row[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  const iName = header.findIndex((h) => h === "nama" || h === "name");
  const iCat = header.findIndex((h) => h === "kategori" || h === "category");
  const iPrice = header.findIndex((h) => h === "harga" || h === "price");
  const hasHeader = iName !== -1;
  const dataRows = hasHeader ? table.slice(1) : table;
  const offset = hasHeader ? 2 : 1;
  const seen = new Set<string>();

  return dataRows.map((cols, idx) => {
    const name = (cols[hasHeader ? iName : 0] ?? "").trim();
    const category = (cols[hasHeader ? (iCat === -1 ? 1 : iCat) : 1] ?? "").trim();
    const priceRaw = (cols[hasHeader ? (iPrice === -1 ? 2 : iPrice) : 2] ?? "").trim();
    const price = Number(priceRaw.replace(/[^\d.-]/g, ""));
    let error: string | null = null;
    const key = name.toLowerCase();
    if (!name) error = "Nama produk kosong.";
    else if (seen.has(key)) error = "Nama produk ganda di dalam file ini.";
    else if (!priceRaw || Number.isNaN(price) || price <= 0) error = "Harga tidak valid.";
    if (!error) seen.add(key);
    return { line: idx + offset, name, category, price, error };
  });
}

export default function ImportMenuPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  function pickFile() {
    inputRef.current?.click();
  }

  function onFile(file: File) {
    setResult(null);
    setMsg(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseRows(text);
      setRows(parsed);
      if (parsed.length === 0) setMsg({ type: "err", text: "File kosong atau formatnya tidak dikenali." });
    };
    reader.onerror = () => setMsg({ type: "err", text: "Gagal membaca file." });
    reader.readAsText(file, "utf-8");
  }

  async function submit() {
    if (valid.length === 0) return;
    setBusy(true);
    setMsg(null);
    const payload = valid.map((r) => ({
      name: r.name,
      category: r.category || null,
      price: r.price,
    }));
    // upsert berdasarkan nama: produk baru ditambah, produk dengan nama sama diperbarui harganya
    const { error, count } = await supabase
      .from("menu_items")
      .upsert(payload, { onConflict: "name", count: "exact" });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setResult({ ok: count ?? payload.length, failed: invalid.length });
    setRows([]);
    setFileName("");
  }

  return (
    <div>
      <PageTitle sub="Tambah atau perbarui harga banyak produk sekaligus dari file CSV.">
        Impor produk massal
      </PageTitle>
      <Notice msg={msg} />

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Langkah 1: unduh format</h2>
        <p className="text-sm text-stone-500">
          Unduh, isi kolom nama, kategori, dan harga, lalu simpan tanpa mengubah format kolom.
        </p>
        <button
          className={`${btnGhostCls} w-full`}
          onClick={() => downloadCsv("format-produk.csv", TEMPLATE_ROWS)}
        >
          Unduh format CSV
        </button>
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Langkah 2: unggah file yang sudah diisi</h2>
        <button className={`${btnGhostCls} w-full`} onClick={pickFile}>
          {fileName || "Pilih file CSV…"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <p className="text-xs text-stone-500">
          Produk dengan nama yang sudah ada akan diperbarui harganya, bukan digandakan. Resep dan foto
          ditambahkan satu per satu setelah impor, lewat halaman Menu dan resep.
        </p>
      </Card>

      {rows.length > 0 && (
        <Card className="mb-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Pratinjau</h2>
            <span className="text-sm text-stone-500">
              {valid.length} siap diimpor{invalid.length > 0 ? `, ${invalid.length} bermasalah` : ""}
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <ul className="divide-y divide-stone-100">
              {rows.map((r) => (
                <li key={r.line} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`truncate ${r.error ? "text-stone-400" : "font-medium"}`}>
                      Baris {r.line}: {r.name || "(tanpa nama)"}
                    </span>
                    {!r.error && <span className="shrink-0 tabular-nums">{rupiah(r.price)}</span>}
                  </div>
                  {r.error && <p className="text-xs font-medium text-red-700">{r.error}</p>}
                </li>
              ))}
            </ul>
          </div>
          <button className={`${btnCls} mt-4 w-full`} onClick={submit} disabled={busy || valid.length === 0}>
            {busy ? "Mengimpor…" : `Impor ${valid.length} produk`}
          </button>
        </Card>
      )}

      {result && (
        <Card className="space-y-3">
          <p className="text-sm font-medium text-teal-800">
            {result.ok} produk berhasil ditambahkan atau diperbarui.
            {result.failed > 0 && ` ${result.failed} baris dilewati karena datanya tidak valid.`}
          </p>
          <Link href="/menu" className={`${btnCls} block text-center`}>
            Lihat daftar menu
          </Link>
        </Card>
      )}
    </div>
  );
}
