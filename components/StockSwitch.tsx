"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pindah antara dua halaman stok di menu utama: produksi (produk jadi) dan kemasan (perlengkapan).
const ITEMS = [
  { href: "/production", label: "Stok produksi" },
  { href: "/packaging", label: "Stok kemasan" },
];

export default function StockSwitch() {
  const path = usePathname();
  return (
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-200/70 p-1">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex h-11 items-center justify-center rounded-lg text-sm font-semibold ${
            path === i.href ? "bg-brand-700 text-brand-fg shadow-sm" : "text-stone-600"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
