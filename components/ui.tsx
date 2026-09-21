import type { ReactNode } from "react";

export type Msg = { type: "ok" | "err"; text: string } | null;

export const inputCls =
  "h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/25";
export const btnCls =
  "h-12 rounded-xl bg-teal-700 px-5 text-base font-semibold text-white active:bg-teal-800 disabled:opacity-50";
export const btnGhostCls =
  "h-12 rounded-xl border border-stone-300 bg-white px-5 text-base font-medium text-stone-700 active:bg-stone-100 disabled:opacity-50";

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-stone-600">{children}</label>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-400">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-stone-200/70 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${
            value === t.id ? "bg-white text-teal-800 shadow-sm" : "text-stone-600"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div
      className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
        msg.type === "ok" ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"
      }`}
    >
      {msg.text}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-stone-500">{children}</p>;
}

export function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-stone-100">
      <div className="h-2 rounded-full bg-teal-600" style={{ width: `${w}%` }} />
    </div>
  );
}
