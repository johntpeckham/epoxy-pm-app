-- ============================================================================
-- Fix broken FKs pointing at _backup_crm_contacts
--
-- Two FKs were left over from the crm_contacts → contacts table rename and
-- still reference _backup_crm_contacts(id). This causes inserts/updates that
-- include a valid contact_id (from the live contacts table) to fail with a
-- foreign key violation. This migration repoints both FKs at contacts(id).
--
-- _backup_crm_contacts is intentionally not dropped — that's a separate
-- cleanup decision for later.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================================

-- ---------- crm_appointments.contact_id ----------------------------------
-- Null out any orphaned contact_id values that don't exist in the live
-- contacts table, so the new FK creation doesn't fail.
UPDATE crm_appointments
SET contact_id = NULL
WHERE contact_id IS NOT NULL
  AND contact_id NOT IN (SELECT id FROM contacts);

ALTER TABLE crm_appointments
  DROP CONSTRAINT IF EXISTS crm_appointments_contact_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_appointments_contact_id_fkey'
      AND conrelid = 'crm_appointments'::regclass
  ) THEN
    ALTER TABLE crm_appointments
      ADD CONSTRAINT crm_appointments_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- crm_call_log.contact_id --------------------------------------
UPDATE crm_call_log
SET contact_id = NULL
WHERE contact_id IS NOT NULL
  AND contact_id NOT IN (SELECT id FROM contacts);

ALTER TABLE crm_call_log
  DROP CONSTRAINT IF EXISTS crm_call_log_contact_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_call_log_contact_id_fkey'
      AND conrelid = 'crm_call_log'::regclass
  ) THEN
    ALTER TABLE crm_call_log
      ADD CONSTRAINT crm_call_log_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;
