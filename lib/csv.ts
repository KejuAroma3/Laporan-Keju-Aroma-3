// Pengurai dan pembuat CSV kecil, tanpa dependensi tambahan.
// Menangani kolom berisi koma, kutip, dan baris baru di dalam tanda kutip.

export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // buang BOM UTF-8
  // Excel versi Indonesia menyimpan CSV dengan pemisah titik koma, dan boleh diawali baris "sep=;"
  let delim = ",";
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep) {
    delim = sep[1];
    text = text.slice(sep[0].length);
  } else {
    const first = text.split(/\r?\n/, 1)[0] ?? "";
    const semi = (first.match(/;/g) ?? []).length;
    const comma = (first.match(/,/g) ?? []).length;
    if (semi > comma) delim = ";";
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // dilewati, ditangani lewat \n
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number)[][], delim = ","): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return s.includes(delim) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delim)
    )
    .join("\r\n");
}

// delim ";" cocok untuk Excel berbahasa Indonesia (ditambah baris "sep=;" supaya kolom terpisah di semua Excel).
export function downloadCsv(filename: string, rows: (string | number)[][], delim = ",") {
  const head = delim === "," ? "" : `sep=${delim}\r\n`;
  const blob = new Blob(["\uFEFF" + head + toCsv(rows, delim)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
