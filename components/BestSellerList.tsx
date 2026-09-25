import { fmt, pct, rupiah } from "@/lib/format";
import type { BestSeller } from "@/lib/types";
import { Bar, Empty } from "@/components/ui";

export function Thumb({
  url,
  name,
  size = 40,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        style={style}
        className="shrink-0 rounded-lg border border-stone-200 bg-stone-100 object-cover"
      />
    );
  }
  return (
    <div style={style} className="flex shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
      🍽️
    </div>
  );
}

export default function BestSellerList({
  items,
  detailed = false,
  limit,
}: {
  items: BestSeller[];
  detailed?: boolean;
  limit?: number;
}) {
  if (items.length === 0) return <Empty>Belum ada penjualan pada periode ini.</Empty>;
  const rows = limit ? items.slice(0, limit) : items;
  const max = Math.max(0, ...rows.map((i) => i.qty_sold));
  return (
    <ol className="space-y-3">
      {rows.map((b, i) => (
        <li key={b.menu_item_id} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-center text-sm font-bold text-stone-400">{i + 1}</span>
          <Thumb url={b.photo_url} name={b.menu} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{b.menu}</span>
              <span className="shrink-0 text-sm tabular-nums text-stone-500">{fmt(b.qty_sold)} porsi</span>
            </div>
            <Bar value={b.qty_sold} max={max} />
            {detailed && (
              <div className="mt-1 flex justify-between text-xs text-stone-500">
                <span>Omzet {rupiah(b.revenue)}</span>
                <span>
                  Laba {rupiah(b.gross_profit)} ({pct(b.gross_profit, b.revenue)})
                </span>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
