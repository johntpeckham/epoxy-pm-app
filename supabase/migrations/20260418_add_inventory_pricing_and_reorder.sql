-- ============================================================================
-- Material Inventory Management — Pricing & Reorder
--
-- 1. Add `price` column to inventory_products (inline editable price per unit)
-- 2. Add `kit_price` column to inventory_kit_groups (kit-level price)
-- 3. Add `price_check_date` column to inventory_products (mirrors stock_check_date)
-- 4. Add `price_check_task_id` column to inventory_products (mirrors stock_check_task_id)
-- 5. Add `sort_order` column to material_suppliers for drag-and-drop reordering
-- ============================================================================

-- 1. inventory_products.price — nullable numeric for per-product pricing
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT NULL;

-- 2. inventory_kit_groups.kit_price — nullable numeric for kit-level pricing
ALTER TABLE inventory_kit_groups
  ADD COLUMN IF NOT EXISTS kit_price numeric DEFAULT NULL;

-- 3. inventory_products.price_check_date — auto-filled when price check task completes
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS price_check_date timestamptz;

-- 4. inventory_products.price_check_task_id — FK to pending price check office_task
--    ON DELETE SET NULL so if the task is deleted, the product returns to
--    "no pending request" state (mirrors stock_check_task_id pattern).
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS price_check_task_id uuid
  REFERENCES office_tasks(id) ON DELETE SET NULL;

-- Index for reverse lookup during task completion
CREATE INDEX IF NOT EXISTS idx_inventory_products_price_check_task_id
  ON inventory_products(price_check_task_id);

-- 5. material_suppliers.sort_order — for drag-and-drop reordering
ALTER TABLE material_suppliers
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
