-- ============================================================================
-- Phase B: Rename the `takeoffs` DB table to `estimates`, plus its indexes,
-- RLS policies, foreign keys, trigger functions/triggers, and constraint
-- names.
--
-- This is the DB-side companion to Phase A (commit 57d3cbe), which renamed
-- the top "Estimates" card on the Estimating project detail page from its
-- legacy "Takeoff" naming at the code layer (component files, modal, route
-- folder, TS types, profile editors, navigators, UI strings).  Phase A
-- intentionally left `.from('takeoffs')` query strings in three places:
-- this migration renames the underlying table and the same commit updates
-- the three call sites to `.from('estimates')`.
--
-- CRITICAL — the new `estimates` table created here (via rename) is a
-- SEPARATE concept from the OLD `estimates` table that was renamed to
-- `proposals` in 20260535_rename_estimate_to_proposal.sql (Phase 4 of
-- the prior estimate→proposal rename).  Two different things sharing
-- a name.  After this migration runs:
--   - `proposals`  ← was `estimates` (the bottom card on the project page,
--                    Phase 4)
--   - `estimates`  ← was `takeoffs` (the top card on the project page,
--                    THIS migration)
--
-- DO NOT touch in this migration:
--   - `proposals` and the four other phase-4 renamed tables
--   - `estimating_projects`, `estimating_reminders`,
--     `estimating_project_measurement_pdfs`
--   - the legacy `project_takeoff_projects` and
--     `project_takeoff_measurement_pdfs` tables (different concept —
--     legacy PDF measurement tool surfaced by the MIDDLE "Takeoffs" card)
--   - the `estimating-project-files` storage bucket
--   - the `'estimating'` permission key
--   - the `/sales/estimating/` parent route segment
--
-- IMPORTANT — the `takeoffs` table is NOT in any committed migration.
-- It was created out-of-band (Supabase Studio).  This migration cannot
-- assume specific RLS policy names, exact index names, or exact trigger
-- names.  It uses:
--   - `IF EXISTS` guards on every rename
--   - dynamic discovery to drop / recreate RLS policies (we don't know
--     the original policy names)
--   - dynamic discovery for triggers and trigger functions whose names
--     contain "takeoff"
--
-- After this migration, recreated RLS policies on `estimates` follow the
-- "Authenticated users can …" team-shared pattern used elsewhere in the
-- repo (the card already filters by project_id, not user_id).
-- ============================================================================


-- ============================================================================
-- STEP 1: Drop foreign-key constraints on EXTERNAL tables that reference
-- takeoffs(id).
--
-- Research: `grep -rn "REFERENCES takeoffs" supabase/` finds zero hits.
-- No committed migration declares an inbound FK to takeoffs(id).  The
-- TS-only child types (TakeoffArea, TakeoffMaterial, etc.) are
-- scaffolding for a future detail editor; the corresponding tables do
-- not exist in the database.  Therefore step 1 is a no-op.
-- ============================================================================


-- ============================================================================
-- STEP 2: Drop RLS policies on `takeoffs`
-- (Postgres has no reliable cross-version `ALTER POLICY ... RENAME`,
--  and we don't know the exact policy names because the table was
--  created out-of-band.  Drop ALL policies dynamically; recreate with
--  known names in step 7.)
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.takeoffs'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.takeoffs', pol.polname);
  END LOOP;
END $$;


-- ============================================================================
-- STEP 3: Rename the table
-- ============================================================================

ALTER TABLE takeoffs RENAME TO estimates;


-- ============================================================================
-- STEP 4: Rename indexes whose names contain "takeoff"
--
-- Indexes don't auto-rename when their table renames; their NAMES still
-- contain "takeoff" until updated.  Cover the standard naming patterns
-- (manual `idx_<table>_<column>` and Postgres-default `<table>_pkey` /
-- `<table>_<column>_idx`) defensively with IF EXISTS so this is safe to
-- re-run.
-- ============================================================================

ALTER INDEX IF EXISTS idx_takeoffs_project_id   RENAME TO idx_estimates_project_id;
ALTER INDEX IF EXISTS idx_takeoffs_customer_id  RENAME TO idx_estimates_customer_id;
ALTER INDEX IF EXISTS idx_takeoffs_template_id  RENAME TO idx_estimates_template_id;
ALTER INDEX IF EXISTS idx_takeoffs_status       RENAME TO idx_estimates_status;
ALTER INDEX IF EXISTS idx_takeoffs_created_by   RENAME TO idx_estimates_created_by;
ALTER INDEX IF EXISTS idx_takeoffs_created_at   RENAME TO idx_estimates_created_at;

-- Postgres-default index names from `CREATE INDEX ... ON takeoffs (...)`
ALTER INDEX IF EXISTS takeoffs_project_id_idx   RENAME TO estimates_project_id_idx;
ALTER INDEX IF EXISTS takeoffs_customer_id_idx  RENAME TO estimates_customer_id_idx;
ALTER INDEX IF EXISTS takeoffs_template_id_idx  RENAME TO estimates_template_id_idx;
ALTER INDEX IF EXISTS takeoffs_status_idx       RENAME TO estimates_status_idx;
ALTER INDEX IF EXISTS takeoffs_created_by_idx   RENAME TO estimates_created_by_idx;
ALTER INDEX IF EXISTS takeoffs_created_at_idx   RENAME TO estimates_created_at_idx;


-- ============================================================================
-- STEP 5: Rename trigger functions and triggers whose names contain
-- "takeoff" (likely the standard `set_takeoffs_updated_at` /
-- `takeoffs_updated_at` pair; matched dynamically because we don't know
-- the exact names).  The legacy `set_project_takeoff_projects_updated_at`
-- function is explicitly excluded to avoid touching the unrelated
-- `project_takeoff_projects` table.
-- ============================================================================

-- Triggers attached to the renamed `estimates` table (post-rename, the
-- triggers' tgrelid points at the new OID; only the trigger NAME still
-- contains "takeoff").
DO $$
DECLARE
  tr RECORD;
  new_name text;
BEGIN
  FOR tr IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.estimates'::regclass
      AND NOT tgisinternal
      AND tgname LIKE '%takeoff%'
  LOOP
    new_name := REPLACE(tr.tgname, 'takeoffs', 'estimates');
    new_name := REPLACE(new_name, 'takeoff',  'estimate');
    EXECUTE format(
      'ALTER TRIGGER %I ON public.estimates RENAME TO %I',
      tr.tgname, new_name
    );
  END LOOP;
END $$;

-- Functions in the public schema whose name starts with "takeoffs_" or
-- "set_takeoffs" or "takeoff_" (excluding the legacy
-- `set_project_takeoff_projects_*` names that belong to a different
-- table).
DO $$
DECLARE
  fn RECORD;
  new_name text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (
        p.proname LIKE 'takeoffs\_%' ESCAPE '\'
        OR p.proname LIKE 'set\_takeoffs\_%' ESCAPE '\'
        OR p.proname = 'set_takeoffs_updated_at'
        OR p.proname = 'takeoffs_set_updated_at'
      )
      AND p.proname NOT LIKE '%project_takeoff%'
  LOOP
    new_name := REPLACE(fn.proname, 'takeoffs', 'estimates');
    new_name := REPLACE(new_name,    'takeoff',  'estimate');
    -- Skip if the destination name already exists in the same schema
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = new_name
    ) THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) RENAME TO %I',
        fn.proname, fn.args, new_name
      );
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- STEP 6: Rename remaining FK / PK constraint NAMES on the renamed
-- `estimates` table.  Constraint definitions stay valid after the
-- table rename; only the NAMES need updating for consistency.
-- Each rename is wrapped in an `IF EXISTS` check so this is idempotent
-- (no-op if the constraint is already named correctly, or never
-- existed under the old name).
-- ============================================================================

DO $$
DECLARE
  pair text[];
  rename_pairs CONSTANT text[][] := ARRAY[
    -- table         old constraint name              new constraint name
    ['estimates',    'takeoffs_pkey',                 'estimates_pkey'],
    ['estimates',    'takeoffs_project_id_fkey',      'estimates_project_id_fkey'],
    ['estimates',    'takeoffs_customer_id_fkey',     'estimates_customer_id_fkey'],
    ['estimates',    'takeoffs_template_id_fkey',     'estimates_template_id_fkey'],
    ['estimates',    'takeoffs_created_by_fkey',      'estimates_created_by_fkey']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY rename_pairs LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
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
-- STEP 7: Recreate RLS policies on the renamed `estimates` table.
--
-- RLS itself survives the table rename (the row-security flag is on the
-- pg_class row, which moves with the table).  Re-asserting it here is
-- idempotent and harmless.  The card already filters by `project_id`
-- (not `user_id`), so the team-shared "Authenticated users can …"
-- pattern matches the rest of the codebase.
-- ============================================================================

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimates"
  ON estimates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimates"
  ON estimates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimates"
  ON estimates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimates"
  ON estimates FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================================
-- STEP 8: Recreate external FK constraints against `estimates(id)`.
--
-- No external table referenced takeoffs(id) (see step 1).  No-op.
-- ============================================================================


-- ============================================================================
-- STEP 9: Sanity SELECTs — uncomment to verify post-migration state
-- ============================================================================

-- Row count survives the rename:
-- SELECT 'estimates' AS table_name, count(*) FROM estimates;

-- Old name should be absent:
-- SELECT 1 FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'takeoffs';

-- Confirm new policies are present:
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.estimates'::regclass;

-- Confirm renamed constraints:
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.estimates'::regclass
--   ORDER BY conname;

-- Confirm renamed indexes:
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'estimates'
--   ORDER BY indexname;
