-- ============================================================================
-- Add new columns to companies and crm_import_records tables
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- 1. Add new columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_of_locations integer;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_range text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_range text;

-- 2. Add new columns to crm_import_records staging table
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS number_of_locations text;
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS revenue_range text;
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS employee_range text;
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS prospect_status text;
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS last_call_status text;
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS last_call_date text;
