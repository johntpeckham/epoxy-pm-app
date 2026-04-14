-- ============================================================================
-- Migration: Add Material Management tables (Phase 1)
-- ============================================================================
-- Creates the master_suppliers, master_products, master_kit_groups, and
-- master_product_documents tables that form the single source of truth for
-- all supplier and product names across the app. Also creates a Supabase
-- Storage bucket for PDS/SDS document uploads.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: master_suppliers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_suppliers_sort_order
  ON master_suppliers(sort_order);

-- ----------------------------------------------------------------------------
-- 2. Table: master_kit_groups (must precede master_products for FK)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_kit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES master_suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric DEFAULT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_kit_groups_supplier_id
  ON master_kit_groups(supplier_id);

CREATE INDEX IF NOT EXISTS idx_master_kit_groups_sort_order
  ON master_kit_groups(sort_order);

-- ----------------------------------------------------------------------------
-- 3. Table: master_products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES master_suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'gallons',
  price numeric DEFAULT NULL,
  price_check_date timestamptz DEFAULT NULL,
  kit_group_id uuid REFERENCES master_kit_groups(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_products_supplier_id
  ON master_products(supplier_id);

CREATE INDEX IF NOT EXISTS idx_master_products_kit_group_id
  ON master_products(kit_group_id);

CREATE INDEX IF NOT EXISTS idx_master_products_sort_order
  ON master_products(sort_order);

-- ----------------------------------------------------------------------------
-- 4. Table: master_product_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_product_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  document_type text NOT NULL,  -- 'PDS' or 'SDS'
  file_name text NOT NULL,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_product_documents_product_id
  ON master_product_documents(product_id);

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------

-- master_suppliers
ALTER TABLE master_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_suppliers_select" ON master_suppliers;
DROP POLICY IF EXISTS "master_suppliers_insert" ON master_suppliers;
DROP POLICY IF EXISTS "master_suppliers_update" ON master_suppliers;
DROP POLICY IF EXISTS "master_suppliers_delete" ON master_suppliers;

CREATE POLICY "master_suppliers_select"
  ON master_suppliers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_suppliers_insert"
  ON master_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_suppliers_update"
  ON master_suppliers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_suppliers_delete"
  ON master_suppliers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- master_kit_groups
ALTER TABLE master_kit_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_kit_groups_select" ON master_kit_groups;
DROP POLICY IF EXISTS "master_kit_groups_insert" ON master_kit_groups;
DROP POLICY IF EXISTS "master_kit_groups_update" ON master_kit_groups;
DROP POLICY IF EXISTS "master_kit_groups_delete" ON master_kit_groups;

CREATE POLICY "master_kit_groups_select"
  ON master_kit_groups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_kit_groups_insert"
  ON master_kit_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_kit_groups_update"
  ON master_kit_groups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_kit_groups_delete"
  ON master_kit_groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- master_products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_products_select" ON master_products;
DROP POLICY IF EXISTS "master_products_insert" ON master_products;
DROP POLICY IF EXISTS "master_products_update" ON master_products;
DROP POLICY IF EXISTS "master_products_delete" ON master_products;

CREATE POLICY "master_products_select"
  ON master_products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_products_insert"
  ON master_products
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_products_update"
  ON master_products
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_products_delete"
  ON master_products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- master_product_documents
ALTER TABLE master_product_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_product_documents_select" ON master_product_documents;
DROP POLICY IF EXISTS "master_product_documents_insert" ON master_product_documents;
DROP POLICY IF EXISTS "master_product_documents_update" ON master_product_documents;
DROP POLICY IF EXISTS "master_product_documents_delete" ON master_product_documents;

CREATE POLICY "master_product_documents_select"
  ON master_product_documents
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_product_documents_insert"
  ON master_product_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_product_documents_update"
  ON master_product_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

CREATE POLICY "master_product_documents_delete"
  ON master_product_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Supabase Storage bucket for material documents (PDS/SDS)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-documents', 'material-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload, read, and delete.
DROP POLICY IF EXISTS "material_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "material_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "material_documents_delete" ON storage.objects;

CREATE POLICY "material_documents_select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'material-documents');

CREATE POLICY "material_documents_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'material-documents');

CREATE POLICY "material_documents_delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'material-documents');
