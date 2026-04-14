-- ============================================================================
-- Migration: Phase 2 — Link Material Inventory to Material Management
-- ============================================================================
-- Adds FK columns to inventory tables so each inventory record can reference
-- its corresponding master record. Also adds missing price_check_task_id
-- column to master_products.
-- ============================================================================

-- 1. Add master_supplier_id FK to material_suppliers
ALTER TABLE material_suppliers
  ADD COLUMN IF NOT EXISTS master_supplier_id uuid REFERENCES master_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_suppliers_master_supplier_id
  ON material_suppliers(master_supplier_id);

-- 2. Add master_product_id FK to inventory_products
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_products_master_product_id
  ON inventory_products(master_product_id);

-- 3. Add master_kit_group_id FK to inventory_kit_groups
ALTER TABLE inventory_kit_groups
  ADD COLUMN IF NOT EXISTS master_kit_group_id uuid REFERENCES master_kit_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_kit_groups_master_kit_group_id
  ON inventory_kit_groups(master_kit_group_id);

-- 4. Add missing price_check_task_id to master_products (used by Phase 1 TS types but missing from schema)
ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS price_check_task_id uuid REFERENCES office_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_master_products_price_check_task_id
  ON master_products(price_check_task_id);
