/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warna tema, diatur lewat menu Pengaturan. Nilainya ada di
        // variabel CSS --brand-* yang di-inject per permintaan di
        // app/layout.tsx, dengan warna teal bawaan sebagai fallback
        // di app/globals.css.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          // Warna teks yang otomatis dipilih (putih/hitam) supaya tetap
          // terbaca di atas bg-brand-700, walau warna temanya terang.
          fg: "rgb(var(--brand-fg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
