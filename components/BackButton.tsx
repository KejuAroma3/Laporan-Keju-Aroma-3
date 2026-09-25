"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Kembali"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-600 active:bg-stone-100"
    >
      ‹
    </button>
  );
}
