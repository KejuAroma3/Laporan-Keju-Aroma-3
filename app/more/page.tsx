"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, PageTitle, btnGhostCls } from "@/components/ui";

const LINKS = [
  { href: "/sales/online-recap", title: "Rekap penjualan online", desc: "GoFood, GrabFood, ShopeeFood per hari" },
  { href: "/menu", title: "Menu dan resep", desc: "Harga jual, resep, estimasi HPP dan margin" },
  { href: "/ingredients", title: "Bahan baku", desc: "Daftar bahan, satuan, batas stok minimum" },
  { href: "/expenses", title: "Biaya operasional", desc: "Sewa, gaji, listrik, gas, dan lainnya" },
];

export default function MorePage() {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div>
      <PageTitle>Lainnya</PageTitle>
      <div className="space-y-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="block">
            <Card className="active:bg-stone-50">
              <div className="font-semibold">{l.title}</div>
              <div className="text-sm text-stone-500">{l.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
      <button className={`${btnGhostCls} mt-6 w-full`} onClick={logout}>
        Keluar
      </button>
    </div>
  );
}
