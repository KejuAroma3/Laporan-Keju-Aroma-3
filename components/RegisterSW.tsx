"use client";

import { useEffect } from "react";

// Mendaftarkan service worker hanya di versi produksi (Vercel), bukan saat npm run dev.
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
