import { supabase } from "./supabase";
import type { Channel } from "./types";

export type FeeRule = { percent: number; flat: number };
export type FeeRules = Record<"gofood" | "grabfood" | "shopeefood", FeeRule>;

// Bawaan (dipakai juga bila SQL 25 belum dijalankan).
export const DEFAULT_FEE_RULES: FeeRules = {
  grabfood: { percent: 20, flat: 0 },
  gofood: { percent: 20, flat: 1000 },
  shopeefood: { percent: 25, flat: 0 },
};

export async function fetchFeeRules(): Promise<FeeRules> {
  const rules: FeeRules = {
    grabfood: { ...DEFAULT_FEE_RULES.grabfood },
    gofood: { ...DEFAULT_FEE_RULES.gofood },
    shopeefood: { ...DEFAULT_FEE_RULES.shopeefood },
  };
  const { data, error } = await supabase.from("platform_fee_rules").select("channel, percent, flat");
  if (error || !data) return rules;
  for (const r of data as { channel: keyof FeeRules; percent: number; flat: number }[]) {
    if (rules[r.channel]) rules[r.channel] = { percent: Number(r.percent) || 0, flat: Number(r.flat) || 0 };
  }
  return rules;
}

// Komisi = pendapatan bersih (subtotal - diskon) x persen + biaya tetap per transaksi, dibulatkan ke rupiah.
export function calcFee(rules: FeeRules, channel: Channel, netBeforeFee: number): number {
  if (channel === "offline" || netBeforeFee <= 0) return 0;
  const r = rules[channel];
  if (!r) return 0;
  return Math.round((netBeforeFee * r.percent) / 100 + r.flat);
}

export function feeLabel(rule: FeeRule): string {
  const parts = [`${rule.percent}%`];
  if (rule.flat > 0) parts.push(`Rp${Math.round(rule.flat).toLocaleString("id-ID")} per transaksi`);
  return parts.join(" + ");
}
