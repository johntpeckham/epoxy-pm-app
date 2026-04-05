-- ============================================================
-- Change quantity column from numeric to text
-- Allows free-form quantity descriptions (e.g. "2 boxes", "1 pallet")
-- ============================================================

alter table public.material_order_line_items
  alter column quantity type text using quantity::text;

alter table public.material_order_line_items
  alter column quantity set default '';

alter table public.material_order_line_items
  alter column quantity drop not null;
