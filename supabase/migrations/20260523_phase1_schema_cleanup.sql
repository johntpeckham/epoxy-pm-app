-- ============================================================================
-- Phase 1: CRM Schema Cleanup — DB only, no UI changes
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- 1. Drop columns from `companies`
-- ============================================================================
ALTER TABLE companies DROP COLUMN IF EXISTS region;
ALTER TABLE companies DROP COLUMN IF EXISTS county;
ALTER TABLE companies DROP COLUMN IF EXISTS deal_value;
ALTER TABLE companies DROP COLUMN IF EXISTS company;
ALTER TABLE companies DROP COLUMN IF EXISTS email;
ALTER TABLE companies DROP COLUMN IF EXISTS phone;
ALTER TABLE companies DROP COLUMN IF EXISTS user_id;

-- ============================================================================
-- 2. Drop the entire `crm_company_addresses` table
--    (including RLS policies, indexes, and FK constraints)
-- ============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS "Authenticated users can view crm_company_addresses" ON crm_company_addresses;
DROP POLICY IF EXISTS "Authenticated users can insert crm_company_addresses" ON crm_company_addresses;
DROP POLICY IF EXISTS "Authenticated users can update crm_company_addresses" ON crm_company_addresses;
DROP POLICY IF EXISTS "Authenticated users can delete crm_company_addresses" ON crm_company_addresses;

-- Drop the index (table drop would remove it, but being explicit)
DROP INDEX IF EXISTS idx_crm_company_addresses_company_id;

-- Drop the table (CASCADE removes the FK constraint automatically)
DROP TABLE IF EXISTS crm_company_addresses CASCADE;

-- ============================================================================
-- 3. Drop columns from `crm_import_records`
-- ============================================================================
ALTER TABLE crm_import_records DROP COLUMN IF EXISTS deal_value;
ALTER TABLE crm_import_records DROP COLUMN IF EXISTS prospect_status;
ALTER TABLE crm_import_records DROP COLUMN IF EXISTS address_label;
