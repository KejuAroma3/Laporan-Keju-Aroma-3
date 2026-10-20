-- ============================================================
-- 28) KEMASAN IKUTAN. Jalankan setelah 1-27. Aman diulang.
--     Aturan kemasan per transaksi bisa "ikut" kemasan lain: mis. Kabel Ties x 1
--     otomatis muncul bila ada Plastik PE UK 24 / UK 35 di kartu kemasan transaksi.
--       follow_of   : daftar bahan pemicu (kosong = aturan biasa, selalu muncul)
--       per_trigger : true = jumlah dikali jumlah pemicu; false = sekali per transaksi
-- ============================================================

alter table transaction_packaging_rules
  add column if not exists follow_of uuid[] not null default '{}',
  add column if not exists per_trigger boolean not null default false;

notify pgrst, 'reload schema';
