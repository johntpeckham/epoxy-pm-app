-- ============================================================================
-- UNIFY CUSTOMER TABLES — Phase 1: SQL Migration
-- Merges crm_companies + customers → companies (single source of truth)
-- Creates contacts table (mirrors crm_contacts, pointing to companies)
-- Migrates data and adds company_id FKs to all referencing tables
-- Does NOT drop any existing tables or columns
-- ============================================================================

-- ============================================================================
-- Section 1: Create companies table
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,

  -- Core fields (from crm_companies)
  name text NOT NULL,
  industry text,
  zone text,
  region text,
  state text,
  county text,
  city text,
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted', 'active', 'inactive')),
  priority text DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  lead_source text,
  deal_value numeric(12, 2) DEFAULT 0,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,

  -- Billing / contact fields (from customers)
  company text,
  email text,
  phone text,
  address text,
  zip text,

  -- Import tracking (from crm_companies)
  import_metadata jsonb,
  import_batch_id text,

  -- Soft-delete / archive
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Audit
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Section 2: Create contacts table
-- ============================================================================
-- crm_contacts has the right structure. We create a parallel contacts table
-- pointing to companies instead of crm_companies. crm_contacts is kept intact.

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Section 3: Migrate crm_companies data → companies
-- ============================================================================
-- Preserve original IDs so CRM FK references remain valid.

INSERT INTO companies (
  id, name, industry, zone, region, state, county, city,
  status, priority, lead_source, deal_value, assigned_to, notes,
  import_metadata, import_batch_id,
  archived, created_by, created_at, updated_at
)
SELECT
  id, name, industry, zone, region, state, county, city,
  status, priority, lead_source, deal_value, assigned_to, notes,
  import_metadata, import_batch_id,
  false,
  created_by, created_at, updated_at
FROM crm_companies
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Section 4: Migrate customers data → companies (with duplicate handling)
-- ============================================================================
-- Strategy:
--   1. Create a temp mapping table: customers.id → companies.id
--   2. For each customer, check if a company with the same name exists
--      (case-insensitive). If so, map to it and merge billing fields.
--      If not, insert as a new company and map the new ID.

-- 4a. Temp mapping table
CREATE TABLE IF NOT EXISTS _customer_company_map (
  old_customer_id uuid PRIMARY KEY,
  new_company_id uuid NOT NULL,
  merge_action text NOT NULL  -- 'matched_existing' or 'inserted_new'
);

-- 4b. Match existing companies by name (case-insensitive)
INSERT INTO _customer_company_map (old_customer_id, new_company_id, merge_action)
SELECT DISTINCT ON (c.id)
  c.id,
  co.id,
  'matched_existing'
FROM customers c
JOIN companies co ON lower(trim(co.name)) = lower(trim(c.name))
ON CONFLICT (old_customer_id) DO NOTHING;

-- 4c. Insert unmatched customers as new companies
INSERT INTO companies (
  id, name, company, email, phone, address, city, state, zip,
  status, archived, user_id, created_at
)
SELECT
  c.id, c.name, c.company, c.email, c.phone, c.address, c.city, c.state, c.zip,
  'prospect', false, c.user_id, c.created_at
FROM customers c
WHERE c.id NOT IN (SELECT old_customer_id FROM _customer_company_map)
ON CONFLICT (id) DO NOTHING;

-- 4d. Map unmatched customers (same ID preserved)
INSERT INTO _customer_company_map (old_customer_id, new_company_id, merge_action)
SELECT c.id, c.id, 'inserted_new'
FROM customers c
WHERE c.id NOT IN (SELECT old_customer_id FROM _customer_company_map)
ON CONFLICT (old_customer_id) DO NOTHING;

-- 4e. Merge billing fields from matched customers into existing companies
UPDATE companies co
SET
  email   = COALESCE(co.email,   c.email),
  phone   = COALESCE(co.phone,   c.phone),
  address = COALESCE(co.address, c.address),
  city    = COALESCE(co.city,    c.city),
  state   = COALESCE(co.state,   c.state),
  zip     = COALESCE(co.zip,     c.zip),
  company = COALESCE(co.company, c.company),
  user_id = COALESCE(co.user_id, c.user_id)
FROM _customer_company_map m
JOIN customers c ON c.id = m.old_customer_id
WHERE co.id = m.new_company_id
  AND m.merge_action = 'matched_existing';

-- 4f. Log migration results for audit
DO $$
DECLARE
  matched_count integer;
  inserted_count integer;
BEGIN
  SELECT count(*) INTO matched_count  FROM _customer_company_map WHERE merge_action = 'matched_existing';
  SELECT count(*) INTO inserted_count FROM _customer_company_map WHERE merge_action = 'inserted_new';
  RAISE NOTICE '=== Customer Migration Summary ===';
  RAISE NOTICE 'Matched to existing companies: %', matched_count;
  RAISE NOTICE 'Inserted as new companies: %', inserted_count;
END $$;

-- ============================================================================
-- Section 5: Migrate crm_contacts data → contacts
-- ============================================================================
-- crm_contacts.company_id already references crm_companies IDs which are
-- preserved in companies, so the FK values are directly valid.

INSERT INTO contacts (
  id, company_id, first_name, last_name, job_title,
  email, phone, is_primary, import_batch_id,
  created_at, updated_at
)
SELECT
  id, company_id, first_name, last_name, job_title,
  email, phone, is_primary, import_batch_id,
  created_at, updated_at
FROM crm_contacts
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Section 6: Update foreign keys on referencing tables
-- ============================================================================

-- --------------------------------------------------------------------------
-- 6a. Tables that reference customers(id) — add new company_id column
-- --------------------------------------------------------------------------

-- estimates: customer_id → customers(id)
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

UPDATE estimates e
SET company_id = m.new_company_id
FROM _customer_company_map m
WHERE e.customer_id = m.old_customer_id
  AND e.company_id IS NULL;

-- invoices: client_id → customers(id)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

UPDATE invoices i
SET company_id = m.new_company_id
FROM _customer_company_map m
WHERE i.client_id = m.old_customer_id
  AND i.company_id IS NULL;

-- job_walks: customer_id → customers(id)
ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

UPDATE job_walks jw
SET company_id = m.new_company_id
FROM _customer_company_map m
WHERE jw.customer_id = m.old_customer_id
  AND jw.company_id IS NULL;

-- estimating_projects: customer_id → customers(id)
ALTER TABLE estimating_projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

UPDATE estimating_projects ep
SET company_id = m.new_company_id
FROM _customer_company_map m
WHERE ep.customer_id = m.old_customer_id
  AND ep.company_id IS NULL;

-- project_takeoff_projects: customer_id → customers(id)
ALTER TABLE project_takeoff_projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

UPDATE project_takeoff_projects ptp
SET company_id = m.new_company_id
FROM _customer_company_map m
WHERE ptp.customer_id = m.old_customer_id
  AND ptp.company_id IS NULL;

-- --------------------------------------------------------------------------
-- 6b. leads: has BOTH customer_id → customers(id) AND company_id → crm_companies(id)
-- --------------------------------------------------------------------------
-- leads.company_id already references crm_companies; since IDs are preserved
-- in companies, those values are already valid. We add a new
-- unified_company_id column to avoid a naming conflict, then backfill it
-- from either the existing company_id or via the customer mapping.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS unified_company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Populate from existing company_id (crm_companies IDs preserved in companies)
UPDATE leads
SET unified_company_id = company_id
WHERE company_id IS NOT NULL
  AND unified_company_id IS NULL;

-- Populate from customer mapping where company_id was null
UPDATE leads l
SET unified_company_id = m.new_company_id
FROM _customer_company_map m
WHERE l.customer_id = m.old_customer_id
  AND l.unified_company_id IS NULL;

-- --------------------------------------------------------------------------
-- 6c. CRM tables that reference crm_companies(id) via company_id
-- --------------------------------------------------------------------------
-- These tables already have company_id with values that are valid in companies
-- (because we preserved crm_companies IDs). No new column needed — the FK
-- constraint will be updated from crm_companies → companies in Phase 5.
-- Tables: crm_contacts, crm_company_addresses, crm_company_tags,
--         crm_call_log, crm_comments, crm_files, crm_appointments,
--         crm_follow_up_reminders

-- ============================================================================
-- Section 7: Create helper views
-- ============================================================================

CREATE OR REPLACE VIEW active_companies AS
  SELECT * FROM companies WHERE archived = false;

-- ============================================================================
-- Section 8: Add indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_organization_id ON companies (organization_id);
CREATE INDEX IF NOT EXISTS idx_companies_archived ON companies (archived);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);
CREATE INDEX IF NOT EXISTS idx_companies_assigned_to ON companies (assigned_to);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_import_batch_id ON companies (import_batch_id);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts (company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_import_batch_id ON contacts (import_batch_id);

-- Indexes on new company_id columns
CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON estimates (company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices (company_id);
CREATE INDEX IF NOT EXISTS idx_job_walks_company_id ON job_walks (company_id);
CREATE INDEX IF NOT EXISTS idx_estimating_projects_company_id ON estimating_projects (company_id);
CREATE INDEX IF NOT EXISTS idx_project_takeoff_projects_company_id ON project_takeoff_projects (company_id);
CREATE INDEX IF NOT EXISTS idx_leads_unified_company_id ON leads (unified_company_id);

-- ============================================================================
-- Section 9: Add RLS policies
-- ============================================================================
-- Follows CRM pattern: all authenticated users have full CRUD access.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view companies"
  ON companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies"
  ON companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies"
  ON companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete companies"
  ON companies FOR DELETE TO authenticated USING (true);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts"
  ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contacts"
  ON contacts FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Section 10: Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION companies_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_set_updated_at();

CREATE OR REPLACE FUNCTION contacts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_updated_at();

-- ============================================================================
-- NOTE: The _customer_company_map table is intentionally kept for reference.
-- It can be dropped in Phase 5 cleanup after all application code is migrated.
-- ============================================================================
