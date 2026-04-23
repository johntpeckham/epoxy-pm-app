-- ============================================================================
-- Fix user deletion: second-sweep FK constraint cleanup
-- ============================================================================
-- Follow-up to 20260525_fix_user_deletion_fk_constraints.sql.
--
-- The prior sweep focused on created_by / completed_by / imported_by /
-- approved_by audit columns and missed `office_tasks.assigned_to`, which
-- surfaces as the next hard block on user deletion:
--   "update or delete on table 'users' violates foreign key constraint
--    'office_tasks_assigned_to_fkey' on table 'office_tasks'"
--
-- Root cause: office_tasks was created manually in the Supabase SQL editor
-- (same pattern as the already-removed _backup_customers) — no tracked
-- migration exists, so any unprotected FKs it has weren't visible to the
-- prior audit.
--
-- This migration does two things:
--
--   1. Explicitly fix the known-unprotected FKs on office_tasks
--      (assigned_to and created_by).
--
--   2. Add a defensive DO-block catch-all that walks pg_catalog and
--      converts ANY remaining public-schema FK to auth.users(id) or
--      profiles(id) with NO ACTION / RESTRICT to ON DELETE SET NULL,
--      relaxing NOT NULL where required. Tables already handled by the
--      delete-user route cleanup (post_comments, estimates, estimate_settings,
--      invoices, change_orders, tasks) are excluded so we don't change
--      the route's semantics.
--
-- FKs already declared with ON DELETE CASCADE or ON DELETE SET NULL are
-- skipped by the filter — the block only touches unprotected constraints.
--
-- Migration is idempotent (safe to re-run).
-- ============================================================================


-- ============================================================================
-- 1. office_tasks.assigned_to -> auth.users(id)
-- ============================================================================
-- The failing case. Audit column — keep the task, null the assignee.

ALTER TABLE office_tasks
  DROP CONSTRAINT IF EXISTS office_tasks_assigned_to_fkey;

ALTER TABLE office_tasks
  ALTER COLUMN assigned_to DROP NOT NULL;

ALTER TABLE office_tasks
  ADD CONSTRAINT office_tasks_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 2. office_tasks.created_by -> auth.users(id)
-- ============================================================================
-- Same hand-created table, same default-named constraint. Application code
-- always populates created_by on insert, but keep the row and null the author
-- on user delete.

ALTER TABLE office_tasks
  DROP CONSTRAINT IF EXISTS office_tasks_created_by_fkey;

ALTER TABLE office_tasks
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE office_tasks
  ADD CONSTRAINT office_tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 3. Defensive catch-all: fix every remaining unprotected FK to
--    auth.users(id) or profiles(id) in the public schema.
-- ============================================================================
-- Walks pg_catalog to find single-column FKs where:
--   - referenced table is auth.users OR public.profiles
--   - current delete action is NO ACTION ('a') or RESTRICT ('r')
--     (skips CASCADE 'c' and SET NULL 'n' — those already work)
-- For each match: relax NOT NULL if set, drop the old constraint, re-add
-- it with ON DELETE SET NULL. Constraint name is preserved.
--
-- Tables listed in the delete-user route's hand-maintained cleanup are
-- excluded so this migration doesn't change the semantics of that flow
-- (per the guard rail for this task). Those tables are:
--   post_comments, estimates, estimate_settings, invoices, change_orders, tasks
--
-- office_tasks is also excluded here because step 1+2 already handled it
-- explicitly — without that skip, the DO block would be a harmless no-op
-- on those constraints, but the explicit skip makes the intent clearer.

DO $$
DECLARE
  rec RECORD;
  excluded_tables text[] := ARRAY[
    'post_comments',
    'estimates',
    'estimate_settings',
    'invoices',
    'change_orders',
    'tasks',
    'office_tasks'
  ];
BEGIN
  FOR rec IN
    SELECT
      rel.relname            AS table_name,
      con.conname            AS constraint_name,
      att.attname            AS column_name,
      rns.nspname            AS ref_schema,
      rrel.relname           AS ref_table,
      att.attnotnull         AS is_not_null
    FROM pg_constraint con
    JOIN pg_class rel    ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_class rrel   ON rrel.oid = con.confrelid
    JOIN pg_namespace rns ON rns.oid = rrel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
      AND con.confdeltype IN ('a', 'r')  -- NO ACTION or RESTRICT only
      AND (
        (rns.nspname = 'auth'   AND rrel.relname = 'users')
        OR (rns.nspname = 'public' AND rrel.relname = 'profiles')
      )
      AND rel.relname <> ALL (excluded_tables)
  LOOP
    IF rec.is_not_null THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL',
        rec.table_name, rec.column_name
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      rec.table_name, rec.constraint_name
    );

    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE SET NULL',
      rec.table_name,
      rec.constraint_name,
      rec.column_name,
      rec.ref_schema,
      rec.ref_table
    );

    RAISE NOTICE 'Converted % (%) -> %.%(id) ON DELETE SET NULL',
      rec.table_name, rec.column_name, rec.ref_schema, rec.ref_table;
  END LOOP;
END $$;
