-- ============================================================================
-- CRM Import History — crm_imports table
-- Tracks import operations (file name, type, record counts, column mapping)
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'xls', 'numbers', 'pdf')),
  record_count integer DEFAULT 0,
  total_rows integer DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial')),
  column_mapping jsonb,
  error_message text,
  imported_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_imports_company_created
  ON crm_imports (company_id, created_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE crm_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_imports"
  ON crm_imports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_imports"
  ON crm_imports FOR INSERT TO authenticated WITH CHECK (true);
