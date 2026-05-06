-- ============================================================================
-- Rename companies.status value 'blacklisted' -> 'do_not_call'.
--
-- Old set: ('prospect', 'contacted', 'lead_created', 'appointment_made',
--          'not_very_interested', 'blacklisted', 'active', 'inactive')
-- New set: ('prospect', 'contacted', 'lead_created', 'appointment_made',
--          'not_very_interested', 'do_not_call', 'active', 'inactive')
--
-- Also auto-archives any pre-existing 'do_not_call' rows so the data
-- matches the new client policy (Do Not Call always implies archived).
--
-- IMPORTANT: backfill BEFORE dropping/recreating the constraint so the
-- new check does not reject existing rows.
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. Backfill: rename status value
UPDATE companies SET status = 'do_not_call' WHERE status = 'blacklisted';

-- 2. Drop old CHECK constraint
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

-- 3. Add new CHECK constraint with the renamed value
ALTER TABLE companies ADD CONSTRAINT companies_status_check
  CHECK (status IN (
    'prospect',
    'contacted',
    'lead_created',
    'appointment_made',
    'not_very_interested',
    'do_not_call',
    'active',
    'inactive'
  ));

-- 4. Auto-archive any do_not_call row that isn't already archived,
--    matching the new client policy that Do Not Call implies archived.
UPDATE companies
   SET archived = true,
       archived_at = COALESCE(archived_at, now())
 WHERE status = 'do_not_call'
   AND archived = false;
