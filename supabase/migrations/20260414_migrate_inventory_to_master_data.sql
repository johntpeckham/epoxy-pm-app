-- ============================================================================
-- DATA MIGRATION: Phase 2 — Populate master records from existing inventory
-- ============================================================================
-- Run AFTER the schema migration (20260414_link_inventory_to_master.sql).
-- For each existing inventory record, creates a corresponding master record
-- (if one doesn't already exist) and links them via the FK columns.
-- ============================================================================

-- 1. Migrate suppliers: create master_suppliers for each material_suppliers row
--    that doesn't already have a matching master record (by name).
INSERT INTO master_suppliers (id, name, color, sort_order, created_at)
SELECT
  gen_random_uuid(),
  ms.name,
  ms.color,
  ms.sort_order,
  ms.created_at
FROM material_suppliers ms
WHERE NOT EXISTS (
  SELECT 1 FROM master_suppliers msup
  WHERE LOWER(msup.name) = LOWER(ms.name)
)
ON CONFLICT DO NOTHING;

-- Link material_suppliers to their matching master_suppliers
UPDATE material_suppliers ms
SET master_supplier_id = (
  SELECT msup.id FROM master_suppliers msup
  WHERE LOWER(msup.name) = LOWER(ms.name)
  LIMIT 1
)
WHERE ms.master_supplier_id IS NULL;

-- Copy colors from material_suppliers to master_suppliers where master has no color
UPDATE master_suppliers msup
SET color = ms.color
FROM material_suppliers ms
WHERE ms.master_supplier_id = msup.id
  AND msup.color IS NULL
  AND ms.color IS NOT NULL;

-- 2. Migrate kit groups: create master_kit_groups for each inventory_kit_groups row
INSERT INTO master_kit_groups (id, name, supplier_id, price, sort_order, created_at)
SELECT
  gen_random_uuid(),
  ikg.name,
  ms.master_supplier_id,
  ikg.kit_price,
  ikg.sort_order,
  ikg.created_at
FROM inventory_kit_groups ikg
JOIN material_suppliers ms ON ms.id = ikg.supplier_id
WHERE ms.master_supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM master_kit_groups mkg
    WHERE LOWER(mkg.name) = LOWER(ikg.name)
      AND mkg.supplier_id = ms.master_supplier_id
  )
ON CONFLICT DO NOTHING;

-- Link inventory_kit_groups to their matching master_kit_groups
UPDATE inventory_kit_groups ikg
SET master_kit_group_id = (
  SELECT mkg.id FROM master_kit_groups mkg
  JOIN material_suppliers ms ON ms.id = ikg.supplier_id
  WHERE LOWER(mkg.name) = LOWER(ikg.name)
    AND mkg.supplier_id = ms.master_supplier_id
  LIMIT 1
)
WHERE ikg.master_kit_group_id IS NULL;

-- 3. Migrate products: create master_products for each inventory_products row
INSERT INTO master_products (id, supplier_id, name, unit, price, price_check_date, kit_group_id, sort_order, created_at)
SELECT
  gen_random_uuid(),
  ms.master_supplier_id,
  ip.name,
  ip.unit,
  ip.price,
  ip.price_check_date,
  ikg.master_kit_group_id,
  ip.sort_order,
  ip.created_at
FROM inventory_products ip
JOIN material_suppliers ms ON ms.id = ip.supplier_id
LEFT JOIN inventory_kit_groups ikg ON ikg.id = ip.kit_group_id
WHERE ms.master_supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM master_products mp
    WHERE LOWER(mp.name) = LOWER(ip.name)
      AND mp.supplier_id = ms.master_supplier_id
  )
ON CONFLICT DO NOTHING;

-- Link inventory_products to their matching master_products
UPDATE inventory_products ip
SET master_product_id = (
  SELECT mp.id FROM master_products mp
  JOIN material_suppliers ms ON ms.id = ip.supplier_id
  WHERE LOWER(mp.name) = LOWER(ip.name)
    AND mp.supplier_id = ms.master_supplier_id
  LIMIT 1
)
WHERE ip.master_product_id IS NULL;
