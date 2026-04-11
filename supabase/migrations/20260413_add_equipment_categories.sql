-- ============================================================================
-- Migration: Add equipment_categories table
-- ============================================================================
-- Creates a dynamic categories table to replace hardcoded equipment category
-- values, seeds it with the initial set of categories, and migrates existing
-- equipment.category values from the old hardcoded keys to the new names.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: equipment_categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_categories_sort_order
  ON equipment_categories(sort_order);

-- ----------------------------------------------------------------------------
-- 2. Seed initial categories
-- ----------------------------------------------------------------------------
INSERT INTO equipment_categories (name, sort_order) VALUES
  ('Vehicles',       1),
  ('Trailers',       2),
  ('Spray Equipment', 3),
  ('Grinders',       4),
  ('Vacuums',        5)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Migrate existing equipment.category values
-- ----------------------------------------------------------------------------
-- Map the legacy hardcoded values to the new seeded category names.
UPDATE equipment SET category = 'Vehicles'        WHERE category = 'vehicle';
UPDATE equipment SET category = 'Trailers'        WHERE category = 'trailer';
UPDATE equipment SET category = 'Heavy Equipment' WHERE category = 'heavy_equipment';
UPDATE equipment SET category = 'Tools'           WHERE category = 'tool';

-- Any other legacy / custom values remain as-is. Add them to the categories
-- table so the UI can still show/filter them.
INSERT INTO equipment_categories (name, sort_order)
SELECT DISTINCT e.category,
       (SELECT COALESCE(MAX(sort_order), 0) FROM equipment_categories)
         + ROW_NUMBER() OVER (ORDER BY e.category)
FROM equipment e
WHERE e.category IS NOT NULL
  AND e.category <> ''
  AND NOT EXISTS (
    SELECT 1 FROM equipment_categories ec WHERE ec.name = e.category
  );

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_categories_select" ON equipment_categories;
DROP POLICY IF EXISTS "equipment_categories_insert" ON equipment_categories;
DROP POLICY IF EXISTS "equipment_categories_update" ON equipment_categories;
DROP POLICY IF EXISTS "equipment_categories_delete" ON equipment_categories;

-- All authenticated users (including foreman) can read.
CREATE POLICY "equipment_categories_select"
  ON equipment_categories
  FOR SELECT TO authenticated
  USING (true);

-- Admin and office_manager can create / update / delete.
CREATE POLICY "equipment_categories_insert"
  ON equipment_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

CREATE POLICY "equipment_categories_update"
  ON equipment_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

CREATE POLICY "equipment_categories_delete"
  ON equipment_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );
