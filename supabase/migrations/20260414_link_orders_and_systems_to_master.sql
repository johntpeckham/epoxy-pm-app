-- ============================================================================
-- Migration: Phase 3 — Link Material Orders & Material Systems to Master
-- ============================================================================
-- Adds FK columns to material_order_line_items and material_system_items
-- so each record can reference its corresponding master record.
-- Existing text columns (manufacturer, product, material_name) are kept
-- for backward compatibility.
-- ============================================================================

-- 1. Add master_supplier_id FK to material_order_line_items
ALTER TABLE material_order_line_items
  ADD COLUMN IF NOT EXISTS master_supplier_id uuid REFERENCES master_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_order_line_items_master_supplier_id
  ON material_order_line_items(master_supplier_id);

-- 2. Add master_product_id FK to material_order_line_items
ALTER TABLE material_order_line_items
  ADD COLUMN IF NOT EXISTS master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_order_line_items_master_product_id
  ON material_order_line_items(master_product_id);

-- 3. Add master_product_id FK to material_system_items
ALTER TABLE material_system_items
  ADD COLUMN IF NOT EXISTS master_product_id uuid REFERENCES master_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_system_items_master_product_id
  ON material_system_items(master_product_id);
