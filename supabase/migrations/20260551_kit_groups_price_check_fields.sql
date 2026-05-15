-- ============================================================================
-- Migration: Add price-check tracking to master_kit_groups
-- ============================================================================
-- Mirrors the existing master_products fields so kits can be price-checked
-- through the same workflow as standalone products.
-- ============================================================================

ALTER TABLE master_kit_groups
  ADD COLUMN IF NOT EXISTS price_check_date timestamptz;

ALTER TABLE master_kit_groups
  ADD COLUMN IF NOT EXISTS price_check_task_id uuid REFERENCES office_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_master_kit_groups_price_check_task_id
  ON master_kit_groups(price_check_task_id);
