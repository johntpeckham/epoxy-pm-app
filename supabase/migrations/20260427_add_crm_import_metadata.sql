-- ============================================================================
-- CRM — Phase 5
-- Import metadata & batch tracking for CSV imports
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- crm_companies: store unmapped CSV data + batch id
ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS import_metadata jsonb,
  ADD COLUMN IF NOT EXISTS import_batch_id text;

CREATE INDEX IF NOT EXISTS idx_crm_companies_import_batch_id
  ON crm_companies (import_batch_id);

-- crm_contacts: batch id
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS import_batch_id text;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_import_batch_id
  ON crm_contacts (import_batch_id);
