-- ============================================================================
-- Update leads status values
-- Drop old CHECK constraint, add new one with expanded values,
-- migrate existing data.
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. Drop old CHECK constraint on status
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- 2. Add new CHECK constraint with expanded values
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'appointment_set', 'sent_to_estimating', 'unable_to_reach', 'disqualified'));

-- 3. Migrate existing data
UPDATE leads SET status = 'new' WHERE status = 'in_progress';
UPDATE leads SET status = 'disqualified' WHERE status = 'completed';
