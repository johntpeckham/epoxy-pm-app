-- ============================================================================
-- Update companies.status allowed values for the new prospect-status set.
--
-- Old set: ('prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted',
--          'active', 'inactive')
-- New set: ('prospect', 'contacted', 'lead_created', 'appointment_made',
--          'not_very_interested', 'blacklisted', 'active', 'inactive')
--
-- Backfill mapping:
--   'hot_lead' → 'contacted'           (closest match; "lead_created" implies
--                                       a row exists in the leads table)
--   'lost'     → 'not_very_interested' (direct rename)
--   all others → unchanged
--
-- IMPORTANT: backfill BEFORE dropping/recreating the constraint so the new
-- check does not reject any pre-existing row.
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. Backfill existing rows
UPDATE companies SET status = 'contacted'           WHERE status = 'hot_lead';
UPDATE companies SET status = 'not_very_interested' WHERE status = 'lost';

-- 2. Drop old CHECK constraint
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

-- 3. Add new CHECK constraint with the updated allowed values
ALTER TABLE companies ADD CONSTRAINT companies_status_check
  CHECK (status IN (
    'prospect',
    'contacted',
    'lead_created',
    'appointment_made',
    'not_very_interested',
    'blacklisted',
    'active',
    'inactive'
  ));
