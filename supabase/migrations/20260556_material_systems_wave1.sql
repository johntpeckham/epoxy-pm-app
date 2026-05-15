-- ============================================================================
-- Material Systems Wave 1: foundation
-- ============================================================================
-- 1. Add five default-quantity-rule columns to master_products and
--    master_kit_groups (the actual kit table — the brief's "master_kits"
--    refers to this).
-- 2. Create material_systems and material_system_items.
-- 3. RLS policies mirror master_products: all-read; INSERT/UPDATE for
--    admin/office_manager/salesman; DELETE for admin/office_manager.
-- ============================================================================

-- ── 1. Defaults on master_products ──────────────────────────────────────────
ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS default_quantity_mode text NULL
    CHECK (default_quantity_mode IS NULL OR default_quantity_mode IN ('coverage', 'fixed'));
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS default_coverage_amount numeric NULL;
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS default_coverage_basis  numeric NULL;
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS default_fixed_quantity  numeric NULL;
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS default_unit text NULL;

-- ── 2. Defaults on master_kit_groups (the table the brief calls "master_kits")
ALTER TABLE master_kit_groups
  ADD COLUMN IF NOT EXISTS default_quantity_mode text NULL
    CHECK (default_quantity_mode IS NULL OR default_quantity_mode IN ('coverage', 'fixed'));
ALTER TABLE master_kit_groups ADD COLUMN IF NOT EXISTS default_coverage_amount numeric NULL;
ALTER TABLE master_kit_groups ADD COLUMN IF NOT EXISTS default_coverage_basis  numeric NULL;
ALTER TABLE master_kit_groups ADD COLUMN IF NOT EXISTS default_fixed_quantity  numeric NULL;
ALTER TABLE master_kit_groups ADD COLUMN IF NOT EXISTS default_unit text NULL;

-- ── 3. material_systems table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION material_systems_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_systems_updated_at ON material_systems;
CREATE TRIGGER material_systems_updated_at
  BEFORE UPDATE ON material_systems
  FOR EACH ROW EXECUTE FUNCTION material_systems_set_updated_at();

ALTER TABLE material_systems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_systems_select" ON material_systems;
DROP POLICY IF EXISTS "material_systems_insert" ON material_systems;
DROP POLICY IF EXISTS "material_systems_update" ON material_systems;
DROP POLICY IF EXISTS "material_systems_delete" ON material_systems;

CREATE POLICY "material_systems_select" ON material_systems
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_systems_insert" ON material_systems
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager','salesman')));
CREATE POLICY "material_systems_update" ON material_systems
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager','salesman')));
CREATE POLICY "material_systems_delete" ON material_systems
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager')));


-- ── 4. material_system_items table ──────────────────────────────────────────
-- The XOR check enforces (item_type, product_id, kit_id) coherence at the DB
-- level so application bugs can't insert a half-shaped row.
CREATE TABLE IF NOT EXISTS material_system_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES material_systems(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('product','kit')),
  product_id uuid NULL REFERENCES master_products(id)    ON DELETE CASCADE,
  kit_id     uuid NULL REFERENCES master_kit_groups(id)  ON DELETE CASCADE,
  quantity_mode text NOT NULL CHECK (quantity_mode IN ('coverage','fixed')),
  coverage_amount numeric NULL,
  coverage_basis  numeric NULL,
  fixed_quantity  numeric NULL,
  unit text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_system_items_type_target_xor CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND kit_id IS NULL) OR
    (item_type = 'kit'     AND kit_id     IS NOT NULL AND product_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_material_system_items_system_sort
  ON material_system_items(system_id, sort_order);

CREATE OR REPLACE FUNCTION material_system_items_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_system_items_updated_at ON material_system_items;
CREATE TRIGGER material_system_items_updated_at
  BEFORE UPDATE ON material_system_items
  FOR EACH ROW EXECUTE FUNCTION material_system_items_set_updated_at();

ALTER TABLE material_system_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_system_items_select" ON material_system_items;
DROP POLICY IF EXISTS "material_system_items_insert" ON material_system_items;
DROP POLICY IF EXISTS "material_system_items_update" ON material_system_items;
DROP POLICY IF EXISTS "material_system_items_delete" ON material_system_items;

CREATE POLICY "material_system_items_select" ON material_system_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_system_items_insert" ON material_system_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager','salesman')));
CREATE POLICY "material_system_items_update" ON material_system_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager','salesman')));
CREATE POLICY "material_system_items_delete" ON material_system_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','office_manager')));
