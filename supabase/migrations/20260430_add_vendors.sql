-- ============================================================================
-- Vendor Management
-- Tables: vendors, vendor_contacts
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- vendors
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors (name);
CREATE INDEX IF NOT EXISTS idx_vendors_created_at ON vendors (created_at DESC);

-- ============================================================================
-- vendor_contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor_id ON vendor_contacts (vendor_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vendors"
  ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vendors"
  ON vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update vendors"
  ON vendors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete vendors"
  ON vendors FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view vendor_contacts"
  ON vendor_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vendor_contacts"
  ON vendor_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update vendor_contacts"
  ON vendor_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete vendor_contacts"
  ON vendor_contacts FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION vendors_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendors_updated_at ON vendors;
CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION vendors_set_updated_at();

CREATE OR REPLACE FUNCTION vendor_contacts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_contacts_updated_at ON vendor_contacts;
CREATE TRIGGER vendor_contacts_updated_at
  BEFORE UPDATE ON vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION vendor_contacts_set_updated_at();
