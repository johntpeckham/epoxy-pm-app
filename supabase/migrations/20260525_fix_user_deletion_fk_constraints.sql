-- ============================================================================
-- Fix user deletion: FK constraints blocking auth.users delete
-- ============================================================================
-- User deletion via /api/delete-user fails when the target user has rows in
-- tables whose user-reference FKs lack an ON DELETE action. This migration:
--
--   1. Drops the orphaned `_backup_customers` table left over from a manual
--      rename of `customers` during the CRM/customer unification. No code
--      reads or writes it, so the snapshot is safe to remove entirely.
--
--   2. Converts 10 unprotected FKs to ON DELETE SET NULL, grouped by table.
--      Five of those columns are NOT NULL today; we relax NOT NULL on those
--      so SET NULL can fire. All are audit columns (created_by / completed_by
--      / imported_by / approved_by / user_id on a preferences table) where
--      keeping the row and nulling the user reference is the correct behavior
--      when a user is deleted.
--
-- FKs to profiles(id) also need the action: profiles.id cascade-deletes from
-- auth.users(id), so on user delete the profile row drops and any unprotected
-- FK to profiles(id) would block the chain.
--
-- Migration is idempotent (safe to re-run).
-- ============================================================================


-- ============================================================================
-- 1. Drop the orphaned _backup_customers snapshot
-- ============================================================================
-- Historical snapshot from the customers -> companies unification (migration
-- 20260510_unify_customer_tables). The `customers` table was manually renamed
-- to `_backup_customers` outside of tracked migrations; its original
-- `customers_user_id_fkey` constraint came along on the rename and now blocks
-- user deletion. Nothing reads or writes this table.

DROP TABLE IF EXISTS _backup_customers CASCADE;


-- ============================================================================
-- 2. project_preliens.created_by -> auth.users(id)
-- ============================================================================
-- Audit column on pre-lien notice records. Keep the record, null the author.

ALTER TABLE project_preliens
  DROP CONSTRAINT IF EXISTS project_preliens_created_by_fkey;

ALTER TABLE project_preliens
  ADD CONSTRAINT project_preliens_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 3. equipment_scheduled_services.completed_by / created_by -> auth.users(id)
-- ============================================================================
-- Audit columns on scheduled equipment services. Keep the service record,
-- null the user references.

ALTER TABLE equipment_scheduled_services
  DROP CONSTRAINT IF EXISTS equipment_scheduled_services_completed_by_fkey;

ALTER TABLE equipment_scheduled_services
  ADD CONSTRAINT equipment_scheduled_services_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE equipment_scheduled_services
  DROP CONSTRAINT IF EXISTS equipment_scheduled_services_created_by_fkey;

ALTER TABLE equipment_scheduled_services
  ADD CONSTRAINT equipment_scheduled_services_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 4. field_guide_templates.created_by -> auth.users(id)
-- ============================================================================
-- Audit column on field guide templates. Keep the template, null the author.

ALTER TABLE field_guide_templates
  DROP CONSTRAINT IF EXISTS field_guide_templates_created_by_fkey;

ALTER TABLE field_guide_templates
  ADD CONSTRAINT field_guide_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 5. sops.created_by -> profiles(id)  (was NOT NULL)
-- ============================================================================
-- Author of a Standard Operating Procedure. Deleting the user should not
-- destroy published SOPs; null the author instead.

ALTER TABLE sops
  DROP CONSTRAINT IF EXISTS sops_created_by_fkey;

ALTER TABLE sops
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE sops
  ADD CONSTRAINT sops_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================================
-- 6. check_deposits.created_by -> profiles(id)  (was NOT NULL)
-- ============================================================================
-- Audit column on check deposit records. Financial history must be preserved;
-- null the user reference.

ALTER TABLE check_deposits
  DROP CONSTRAINT IF EXISTS check_deposits_created_by_fkey;

ALTER TABLE check_deposits
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE check_deposits
  ADD CONSTRAINT check_deposits_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================================
-- 7. crm_custom_columns.created_by -> profiles(id)  (was NOT NULL)
-- ============================================================================
-- Admin who defined a CRM custom column. The column definition must survive.

ALTER TABLE crm_custom_columns
  DROP CONSTRAINT IF EXISTS crm_custom_columns_created_by_fkey;

ALTER TABLE crm_custom_columns
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE crm_custom_columns
  ADD CONSTRAINT crm_custom_columns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================================
-- 8. crm_user_column_preferences.user_id -> profiles(id)  (was NOT NULL)
-- ============================================================================
-- Per-user CRM column visibility preference. On user deletion, these rows
-- are meaningless without an owner — null-then-cleanup keeps the chain
-- unblocked without needing a separate cleanup step.

ALTER TABLE crm_user_column_preferences
  DROP CONSTRAINT IF EXISTS crm_user_column_preferences_user_id_fkey;

ALTER TABLE crm_user_column_preferences
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE crm_user_column_preferences
  ADD CONSTRAINT crm_user_column_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================================
-- 9. crm_imports.imported_by -> profiles(id)  (was NOT NULL)
-- ============================================================================
-- Audit record of a CRM import batch. History must be preserved.

ALTER TABLE crm_imports
  DROP CONSTRAINT IF EXISTS crm_imports_imported_by_fkey;

ALTER TABLE crm_imports
  ALTER COLUMN imported_by DROP NOT NULL;

ALTER TABLE crm_imports
  ADD CONSTRAINT crm_imports_imported_by_fkey
  FOREIGN KEY (imported_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================================
-- 10. crm_import_records.approved_by -> profiles(id)  (already nullable)
-- ============================================================================
-- Approval audit on individual imported records. Already nullable; just add
-- the ON DELETE action.

ALTER TABLE crm_import_records
  DROP CONSTRAINT IF EXISTS crm_import_records_approved_by_fkey;

ALTER TABLE crm_import_records
  ADD CONSTRAINT crm_import_records_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
