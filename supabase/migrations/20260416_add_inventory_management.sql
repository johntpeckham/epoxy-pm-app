-- ============================================================================
-- Material Inventory Management — Phase 1
-- Tables: material_suppliers, inventory_products, inventory_kit_groups
-- Phase 1 builds supplier + product CRUD. The kit group table is created now
-- but its UI lands in Phase 2; stock check request tasks land in Phase 3.
-- ============================================================================

-- 1. material_suppliers
CREATE TABLE IF NOT EXISTS material_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. inventory_kit_groups — soft grouping for "kits" like "Polyurea Base Coat Kit"
CREATE TABLE IF NOT EXISTS inventory_kit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES material_suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  full_kits integer DEFAULT 0,
  full_kit_size text,
  partial_kits integer DEFAULT 0,
  partial_kit_size text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. inventory_products
CREATE TABLE IF NOT EXISTS inventory_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES material_suppliers(id) ON DELETE CASCADE,
  kit_group_id uuid REFERENCES inventory_kit_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric DEFAULT 0,
  unit text DEFAULT 'gallons',
  stock_check_date timestamptz,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_products_supplier_id ON inventory_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_products_kit_group_id ON inventory_products(kit_group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kit_groups_supplier_id ON inventory_kit_groups(supplier_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE material_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_kit_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;

-- material_suppliers: authenticated users can read
CREATE POLICY "material_suppliers_select" ON material_suppliers
  FOR SELECT TO authenticated USING (true);

-- material_suppliers: admin, office_manager, salesman can insert
CREATE POLICY "material_suppliers_insert" ON material_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- material_suppliers: admin, office_manager, salesman can update
CREATE POLICY "material_suppliers_update" ON material_suppliers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- material_suppliers: admin, office_manager can delete
CREATE POLICY "material_suppliers_delete" ON material_suppliers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- inventory_kit_groups: authenticated users can read
CREATE POLICY "inventory_kit_groups_select" ON inventory_kit_groups
  FOR SELECT TO authenticated USING (true);

-- inventory_kit_groups: admin, office_manager, salesman can insert
CREATE POLICY "inventory_kit_groups_insert" ON inventory_kit_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- inventory_kit_groups: admin, office_manager, salesman can update
CREATE POLICY "inventory_kit_groups_update" ON inventory_kit_groups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- inventory_kit_groups: admin, office_manager can delete
CREATE POLICY "inventory_kit_groups_delete" ON inventory_kit_groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- inventory_products: authenticated users can read
CREATE POLICY "inventory_products_select" ON inventory_products
  FOR SELECT TO authenticated USING (true);

-- inventory_products: admin, office_manager, salesman can insert
CREATE POLICY "inventory_products_insert" ON inventory_products
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- inventory_products: admin, office_manager, salesman can update
CREATE POLICY "inventory_products_update" ON inventory_products
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- inventory_products: admin, office_manager can delete
CREATE POLICY "inventory_products_delete" ON inventory_products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );
