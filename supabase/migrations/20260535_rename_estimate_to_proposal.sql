-- ============================================================================
-- Phase 4: Rename DB tables, columns, indexes, RLS policies, triggers,
-- functions, foreign keys, CHECK constraints, and CRM stage values from
-- "estimate" → "proposal".
--
-- This migration is the DB-side companion to the code rename in phases
-- 1–3.  Run this SQL in the Supabase SQL editor in ONE transaction
-- (which Supabase wraps automatically).  Do NOT auto-run.
--
-- Order matters.  Each step's prerequisites are completed by an earlier
-- step:
--   1. Drop CHECK constraints that block data UPDATEs (literal values
--      change from 'estimate*' → 'proposal*').
--   2. UPDATE all stored data values (CRM stage, slugs, notification
--      types, parent_type, pushed_to, trash_bin item_type, storage paths,
--      logo URLs).
--   3. Drop foreign-key constraints that point AT the to-be-renamed
--      `estimates` table — they're recreated in step 9 against
--      `proposals`.
--   4. Rename FK columns on UNRELATED tables that referenced estimates
--      (change_orders, invoices, projects).  `projects.estimate_number`
--      is wrapped in IF EXISTS because it was added manually in
--      production and is not in any tracked migration.
--   5. Rename columns on the soon-to-be-renamed estimate tables.
--   6. Rename indexes, triggers, and functions whose name contains
--      "estimate".
--   7. Drop RLS policies on the to-be-renamed tables (Postgres has no
--      reliable cross-version `ALTER POLICY ... RENAME`; drop+create is
--      the safe path).
--   8. Rename the four estimate tables.
--   9. Recreate the dropped FK constraints with new names against
--      `proposals`.
--  10. Rename remaining FK / PK / UNIQUE constraint NAMES on the renamed
--      tables (constraint definitions stay valid after table rename;
--      only the names need updating for consistency).
--  11. Recreate RLS policies on the renamed tables with new names.
--  12. Recreate the dropped CHECK constraints with new allowed values.
--  13. Sanity SELECTs at the bottom (commented — uncomment to verify).
--
-- DO NOT touch:
--   - estimating_projects, estimating_reminders, estimating_project_*  tables
--   - storage bucket 'estimating-project-files' (only the `estimate-form-logos/`
--     prefix INSIDE 'company-assets' moves to 'proposal-form-logos/')
--   - 'estimating' permission key
--   - lead status 'sent_to_estimating'
--   - 'estimating' value in pushed_to enums (keeps; refers to the section)
--   - pipeline_stages slug 'estimating' (the section, not the document)
-- ============================================================================


-- ============================================================================
-- STEP 1: Drop CHECK constraints that block data updates
-- ============================================================================

-- change_orders.parent_type CHECK ('estimate', 'invoice')
ALTER TABLE change_orders
  DROP CONSTRAINT IF EXISTS change_orders_parent_type_check;

-- estimating_reminders.trigger_event CHECK ('estimate_sent', 'stage_change')
ALTER TABLE estimating_reminders
  DROP CONSTRAINT IF EXISTS estimating_reminders_trigger_event_check;

-- crm_appointments.pushed_to CHECK ('job_walk', 'estimating', 'estimate', 'job')
ALTER TABLE crm_appointments
  DROP CONSTRAINT IF EXISTS crm_appointments_pushed_to_check;

-- leads.pushed_to CHECK ('appointment', 'job_walk', 'estimating', 'estimate', 'job')
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_pushed_to_check;

-- job_walks.pushed_to CHECK ('estimating', 'estimate', 'job')
ALTER TABLE job_walks
  DROP CONSTRAINT IF EXISTS job_walks_pushed_to_check;


-- ============================================================================
-- STEP 2: UPDATE data values
-- ============================================================================

-- 2a. CRM pipeline stage rename: "Estimate Sent" → "Proposal Sent"
UPDATE pipeline_stages
SET name = 'Proposal Sent', slug = 'proposal_sent'
WHERE slug = 'estimate_sent';

-- 2b. Reminder rules referencing the old slug
UPDATE reminder_rules
SET trigger_event = 'proposal_sent'
WHERE trigger_event = 'estimate_sent';

-- 2c. Existing auto-reminders attached to projects
UPDATE estimating_reminders
SET trigger_event = 'proposal_sent'
WHERE trigger_event = 'estimate_sent';

-- 2d. Project pipeline-stage values that were the old slug
UPDATE estimating_projects
SET pipeline_stage = 'proposal_sent'
WHERE pipeline_stage = 'estimate_sent';

-- 2e. Pipeline history rows that recorded transitions
UPDATE pipeline_history
SET from_stage = 'proposal_sent'
WHERE from_stage = 'estimate_sent';

UPDATE pipeline_history
SET to_stage = 'proposal_sent'
WHERE to_stage = 'estimate_sent';

-- 2f. Notification type literals
UPDATE notifications
SET type = 'proposal_sent'
WHERE type = 'estimate_sent';

UPDATE notifications
SET type = 'proposal_follow_up'
WHERE type = 'estimate_follow_up';

-- 2g. change_orders.parent_type 'estimate' → 'proposal'
UPDATE change_orders
SET parent_type = 'proposal'
WHERE parent_type = 'estimate';

-- 2h. pushed_to enums on the three pipeline tables
UPDATE crm_appointments
SET pushed_to = 'proposal'
WHERE pushed_to = 'estimate';

UPDATE leads
SET pushed_to = 'proposal'
WHERE pushed_to = 'estimate';

UPDATE job_walks
SET pushed_to = 'proposal'
WHERE pushed_to = 'estimate';

-- 2i. trash_bin: item_type and item_data key
-- Existing rows keyed off 'estimate' need both the discriminator AND the
-- bundled snapshot key updated, otherwise restore code (which now reads
-- item_data.proposal) will fail to find the snapshot.
UPDATE trash_bin
SET item_type = 'proposal',
    item_data = jsonb_set(item_data - 'estimate', '{proposal}', item_data -> 'estimate')
WHERE item_type = 'estimate' AND item_data ? 'estimate';

-- 2j. Storage path prefix rename inside the company-assets bucket.
-- The bucket name stays 'company-assets'; only the prefix changes.
-- Updating storage.objects.name moves the public path of each object
-- (Supabase resolves public URLs via this row's `name`).
UPDATE storage.objects
SET name = REPLACE(name, 'estimate-form-logos/', 'proposal-form-logos/')
WHERE bucket_id = 'company-assets'
  AND name LIKE 'estimate-form-logos/%';

-- 2k. Logo URLs stored on the still-named-estimate_form_settings row
UPDATE estimate_form_settings
SET company_logo_url = REPLACE(company_logo_url, 'estimate-form-logos/', 'proposal-form-logos/')
WHERE company_logo_url LIKE '%estimate-form-logos/%';


-- ============================================================================
-- STEP 3: Drop foreign-key constraints that point AT estimates(id)
-- They will be recreated in step 9 against the renamed `proposals` table.
-- ============================================================================

ALTER TABLE change_orders
  DROP CONSTRAINT IF EXISTS change_orders_estimate_id_fkey;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_estimate_id_fkey;

ALTER TABLE estimate_follow_ups
  DROP CONSTRAINT IF EXISTS estimate_follow_ups_estimate_id_fkey;


-- ============================================================================
-- STEP 4: Rename FK columns on UNRELATED tables
-- ============================================================================

-- change_orders.estimate_id → proposal_id
ALTER TABLE change_orders
  RENAME COLUMN estimate_id TO proposal_id;

-- invoices.estimate_id → proposal_id (column added manually; guard for safety)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'invoices'
      AND column_name  = 'estimate_id'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN estimate_id TO proposal_id;
  END IF;
END $$;

-- projects.estimate_number → proposal_number (column added manually; guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'projects'
      AND column_name  = 'estimate_number'
  ) THEN
    ALTER TABLE projects RENAME COLUMN estimate_number TO proposal_number;
  END IF;
END $$;


-- ============================================================================
-- STEP 5: Rename columns on the soon-to-be-renamed estimate tables
-- (renaming columns BEFORE the table rename — column names cascade through
--  CHECK constraints and indexes automatically.)
-- ============================================================================

ALTER TABLE estimates
  RENAME COLUMN estimate_number TO proposal_number;

ALTER TABLE estimate_settings
  RENAME COLUMN next_estimate_number TO next_proposal_number;

ALTER TABLE estimate_follow_ups
  RENAME COLUMN estimate_id TO proposal_id;


-- ============================================================================
-- STEP 6: Rename indexes, triggers, and functions
-- ============================================================================

-- Indexes on the renamed tables
ALTER INDEX IF EXISTS idx_estimates_company_id        RENAME TO idx_proposals_company_id;
ALTER INDEX IF EXISTS idx_estimates_status            RENAME TO idx_proposals_status;
ALTER INDEX IF EXISTS idx_estimates_sent_at           RENAME TO idx_proposals_sent_at;

-- Indexes on estimate_follow_ups
ALTER INDEX IF EXISTS idx_estimate_follow_ups_estimate_id
  RENAME TO idx_proposal_follow_ups_proposal_id;
ALTER INDEX IF EXISTS idx_estimate_follow_ups_project_id
  RENAME TO idx_proposal_follow_ups_project_id;
ALTER INDEX IF EXISTS idx_estimate_follow_ups_created_at
  RENAME TO idx_proposal_follow_ups_created_at;

-- Indexes on change_orders / invoices that referenced estimate_id
ALTER INDEX IF EXISTS idx_change_orders_estimate_id
  RENAME TO idx_change_orders_proposal_id;
ALTER INDEX IF EXISTS idx_invoices_estimate_id
  RENAME TO idx_invoices_proposal_id;

-- Trigger function on estimate_form_settings
ALTER FUNCTION estimate_form_settings_set_updated_at()
  RENAME TO proposal_form_settings_set_updated_at;

-- Trigger on estimate_form_settings (must rename via ALTER TRIGGER)
ALTER TRIGGER estimate_form_settings_updated_at
  ON estimate_form_settings
  RENAME TO proposal_form_settings_updated_at;


-- ============================================================================
-- STEP 7: Drop RLS policies on the to-be-renamed tables
-- (Postgres has no reliable `ALTER POLICY ... RENAME` across versions.
--  Drop now; recreate after the table rename in step 11.)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own estimates"   ON estimates;
DROP POLICY IF EXISTS "Users can insert their own estimates" ON estimates;
DROP POLICY IF EXISTS "Users can update their own estimates" ON estimates;
DROP POLICY IF EXISTS "Users can delete their own estimates" ON estimates;

DROP POLICY IF EXISTS "Users can view their own estimate settings"   ON estimate_settings;
DROP POLICY IF EXISTS "Users can insert their own estimate settings" ON estimate_settings;
DROP POLICY IF EXISTS "Users can update their own estimate settings" ON estimate_settings;

DROP POLICY IF EXISTS "Authenticated can view estimate form settings" ON estimate_form_settings;
DROP POLICY IF EXISTS "Admins can insert estimate form settings"      ON estimate_form_settings;
DROP POLICY IF EXISTS "Admins can update estimate form settings"      ON estimate_form_settings;

DROP POLICY IF EXISTS "Authenticated users can view estimate follow ups"   ON estimate_follow_ups;
DROP POLICY IF EXISTS "Authenticated users can insert estimate follow ups" ON estimate_follow_ups;
DROP POLICY IF EXISTS "Authenticated users can update estimate follow ups" ON estimate_follow_ups;
DROP POLICY IF EXISTS "Authenticated users can delete estimate follow ups" ON estimate_follow_ups;


-- ============================================================================
-- STEP 8: Rename the four tables
-- ============================================================================

ALTER TABLE estimates           RENAME TO proposals;
ALTER TABLE estimate_settings   RENAME TO proposal_settings;
ALTER TABLE estimate_form_settings RENAME TO proposal_form_settings;
ALTER TABLE estimate_follow_ups RENAME TO proposal_follow_ups;


-- ============================================================================
-- STEP 9: Recreate FK constraints against the renamed `proposals` table
-- ============================================================================

ALTER TABLE change_orders
  ADD CONSTRAINT change_orders_proposal_id_fkey
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;

-- invoices.proposal_id (column may not exist in environments where
-- the unversioned column was never added)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'invoices'
      AND column_name  = 'proposal_id'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_proposal_id_fkey
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE proposal_follow_ups
  ADD CONSTRAINT proposal_follow_ups_proposal_id_fkey
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;


-- ============================================================================
-- STEP 10: Rename remaining FK / PK / UNIQUE constraint NAMES on the
-- renamed tables.  Constraint definitions stay valid after the table
-- rename; only the names need updating for consistency with the new
-- table names.  Each ALTER is wrapped in a DO block so it's a no-op
-- when the constraint is already named correctly (idempotent re-runs).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  rename_pairs CONSTANT text[][] := ARRAY[
    -- table              old constraint name                       new constraint name
    ['proposals',          'estimates_pkey',                          'proposals_pkey'],
    ['proposals',          'estimates_company_id_fkey',               'proposals_company_id_fkey'],
    ['proposals',          'estimates_customer_id_fkey',              'proposals_customer_id_fkey'],
    ['proposals',          'estimates_user_id_fkey',                  'proposals_user_id_fkey'],
    ['proposal_settings',  'estimate_settings_pkey',                  'proposal_settings_pkey'],
    ['proposal_settings',  'estimate_settings_user_id_fkey',          'proposal_settings_user_id_fkey'],
    ['proposal_settings',  'estimate_settings_user_id_key',           'proposal_settings_user_id_key'],
    ['proposal_form_settings', 'estimate_form_settings_pkey',         'proposal_form_settings_pkey'],
    ['proposal_form_settings', 'estimate_form_settings_default_salesperson_id_fkey',
                               'proposal_form_settings_default_salesperson_id_fkey'],
    ['proposal_follow_ups', 'estimate_follow_ups_pkey',               'proposal_follow_ups_pkey'],
    ['proposal_follow_ups', 'estimate_follow_ups_project_id_fkey',    'proposal_follow_ups_project_id_fkey'],
    ['proposal_follow_ups', 'estimate_follow_ups_created_by_fkey',    'proposal_follow_ups_created_by_fkey']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY rename_pairs LOOP
    -- Only rename if the old-named constraint actually exists
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = pair[1]
        AND c.conname = pair[2]
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        pair[1], pair[2], pair[3]
      );
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- STEP 11: Recreate RLS policies on the renamed tables
-- ============================================================================

CREATE POLICY "Users can view their own proposals"
  ON proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proposals"
  ON proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proposals"
  ON proposals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proposals"
  ON proposals FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own proposal settings"
  ON proposal_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proposal settings"
  ON proposal_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proposal settings"
  ON proposal_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can view proposal form settings"
  ON proposal_form_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert proposal form settings"
  ON proposal_form_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update proposal form settings"
  ON proposal_form_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view proposal follow ups"
  ON proposal_follow_ups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proposal follow ups"
  ON proposal_follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update proposal follow ups"
  ON proposal_follow_ups FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete proposal follow ups"
  ON proposal_follow_ups FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================================
-- STEP 12: Recreate CHECK constraints with new allowed values
-- ============================================================================

ALTER TABLE change_orders
  ADD CONSTRAINT change_orders_parent_type_check
  CHECK (parent_type IN ('proposal', 'invoice'));

ALTER TABLE estimating_reminders
  ADD CONSTRAINT estimating_reminders_trigger_event_check
  CHECK (trigger_event IN ('proposal_sent', 'stage_change') OR trigger_event IS NULL);

ALTER TABLE crm_appointments
  ADD CONSTRAINT crm_appointments_pushed_to_check
  CHECK (pushed_to IN ('job_walk', 'estimating', 'proposal', 'job') OR pushed_to IS NULL);

ALTER TABLE leads
  ADD CONSTRAINT leads_pushed_to_check
  CHECK (pushed_to IN ('appointment', 'job_walk', 'estimating', 'proposal', 'job'));

ALTER TABLE job_walks
  ADD CONSTRAINT job_walks_pushed_to_check
  CHECK (pushed_to IN ('estimating', 'proposal', 'job') OR pushed_to IS NULL);


-- ============================================================================
-- STEP 13: Sanity SELECTs — uncomment to verify post-migration row counts
-- ============================================================================

-- SELECT 'proposals'                AS table_name, count(*) FROM proposals
-- UNION ALL SELECT 'proposal_settings',         count(*) FROM proposal_settings
-- UNION ALL SELECT 'proposal_form_settings',    count(*) FROM proposal_form_settings
-- UNION ALL SELECT 'proposal_follow_ups',       count(*) FROM proposal_follow_ups;

-- SELECT 'pipeline_stages: Proposal Sent', count(*) FROM pipeline_stages WHERE slug = 'proposal_sent';
-- SELECT 'reminder_rules: proposal_sent',  count(*) FROM reminder_rules  WHERE trigger_event = 'proposal_sent';
-- SELECT 'notifications: proposal_sent',   count(*) FROM notifications   WHERE type = 'proposal_sent';
-- SELECT 'notifications: proposal_follow_up', count(*) FROM notifications WHERE type = 'proposal_follow_up';
-- SELECT 'change_orders: proposal',        count(*) FROM change_orders   WHERE parent_type = 'proposal';
-- SELECT 'change_orders.proposal_id NOT NULL', count(*) FROM change_orders WHERE proposal_id IS NOT NULL;

-- Confirm the old names are gone (each should error or return 0):
-- SELECT 1 FROM information_schema.tables WHERE table_name = 'estimates';
-- SELECT 1 FROM information_schema.tables WHERE table_name = 'estimate_settings';
-- SELECT 1 FROM information_schema.tables WHERE table_name = 'estimate_form_settings';
-- SELECT 1 FROM information_schema.tables WHERE table_name = 'estimate_follow_ups';
-- SELECT count(*) FROM pipeline_stages WHERE slug = 'estimate_sent';
-- SELECT count(*) FROM notifications   WHERE type IN ('estimate_sent', 'estimate_follow_up');
-- SELECT count(*) FROM change_orders   WHERE parent_type = 'estimate';
-- SELECT count(*) FROM trash_bin       WHERE item_type = 'estimate';
-- SELECT count(*) FROM storage.objects WHERE bucket_id = 'company-assets' AND name LIKE 'estimate-form-logos/%';
