-- ============================================================================
-- Vendor Management — Colors + Vendor Types
-- Adds: vendors.color, vendors.vendor_type columns and vendor_types table
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. Add color + vendor_type columns to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_type text;

-- 2. vendor_types table
CREATE TABLE IF NOT EXISTS vendor_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE vendor_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vendor_types"
  ON vendor_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vendor_types"
  ON vendor_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete vendor_types"
  ON vendor_types FOR DELETE TO authenticated USING (true);

-- 4. Default vendor types
INSERT INTO vendor_types (name) VALUES
  ('Material'),
  ('Equipment')
ON CONFLICT (name) DO NOTHING;
