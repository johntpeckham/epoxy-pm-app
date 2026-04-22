-- ============================================================================
-- CRM Import Records — staging table for imported data
-- Records land here first for review/editing before being approved into live CRM.
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- 1. Add 'staged' to the crm_imports status check constraint
ALTER TABLE crm_imports DROP CONSTRAINT IF EXISTS crm_imports_status_check;
ALTER TABLE crm_imports ADD CONSTRAINT crm_imports_status_check
  CHECK (status IN ('completed', 'failed', 'partial', 'staged'));

-- 2. Create the staging table
CREATE TABLE IF NOT EXISTS crm_import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES crm_imports(id) ON DELETE CASCADE,

  -- Company fields
  company_name text NOT NULL,
  industry text,
  zone text,
  region text,
  state text,
  county text,
  city text,
  status text,
  priority text,
  lead_source text,
  deal_value numeric,

  -- Contact fields
  contact_first_name text,
  contact_last_name text,
  contact_job_title text,
  contact_email text,
  contact_phone text,

  -- Address fields
  address text,
  address_label text,

  -- Extra columns that didn't map
  extras jsonb,

  -- Duplicate detection
  duplicate_of uuid REFERENCES companies(id) ON DELETE SET NULL,
  duplicate_score real,
  merge_decision text NOT NULL DEFAULT 'import'
    CHECK (merge_decision IN ('import', 'merge', 'skip', 'rejected')),

  -- Approval tracking
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),

  -- Row index from original file
  row_index integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_import_records_import_id
  ON crm_import_records (import_id);

CREATE INDEX IF NOT EXISTS idx_crm_import_records_approved
  ON crm_import_records (import_id, approved);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE crm_import_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_import_records"
  ON crm_import_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_import_records"
  ON crm_import_records FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update crm_import_records"
  ON crm_import_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_import_records"
  ON crm_import_records FOR DELETE TO authenticated USING (true);
