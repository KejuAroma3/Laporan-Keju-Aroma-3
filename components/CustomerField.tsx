"use client";

import { custKey, lastOrderLabel, type CustomerStat } from "@/lib/customers";
import { Label, inputCls } from "@/components/ui";

// Isian nama pelanggan dengan saran nama lama dan petunjuk repeat order.
export default function CustomerField({
  value,
  onChange,
  index,
  listId,
  ownCount = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  index: Map<string, CustomerStat>;
  listId: string;
  ownCount?: number; // penjualan yang sedang diubah ikut terhitung di indeks, kurangi
}) {
  const found = value.trim() ? index.get(custKey(value)) : undefined;
  const info = found && found.count - ownCount > 0 ? { ...found, count: found.count - ownCount } : undefined;
  return (
    <div>
      <Label>Nama pelanggan (opsional)</Label>
      <input
        className={inputCls}
        value={value}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contoh: Bu Rina"
        autoComplete="off"
      />
      <datalist id={listId}>
        {[...index.values()].slice(0, 300).map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
      {value.trim() && (
        <p className={`mt-1 text-xs font-medium ${info ? "text-brand-800" : "text-stone-500"}`}>
          {info
            ? `Pelanggan lama: ${info.count}× pesan sebelumnya, terakhir ${lastOrderLabel(info.last)}. Ini repeat order.`
            : "Pelanggan baru."}
        </p>
      )}
    </div>
  );
}
