-- ============================================================================
-- Fix profiles_role_check to allow all 5 canonical user roles.
--
-- Background:
--   Creating a user with role='office_manager' fails with
--     "new row for relation \"profiles\" violates check constraint
--      \"profiles_role_check\""
--   even though the source-controlled migration 20260230_add_user_roles.sql
--   already allows that slug. The deployed constraint in the live database
--   has drifted from the migration (likely a manual alter at some point).
--
-- Fix: drop and recreate the constraint with the canonical slug list.
-- The 5 valid roles in this app are: admin, office_manager, salesman,
-- foreman, crew.
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'office_manager', 'salesman', 'foreman', 'crew'));
