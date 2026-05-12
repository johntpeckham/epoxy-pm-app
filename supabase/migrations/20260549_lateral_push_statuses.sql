-- ============================================================================
-- Add lateral-push status values so the convertSourceLateral flow can write
-- per-direction "where this row WENT" statuses instead of the too-aggressive
-- 'sent_to_estimating' / 'completed' it wrote pre-Prompt-12.
--
-- New values:
--   leads.status            + 'job_walk_scheduled'
--   crm_appointments.status + 'pushed_to_lead', 'pushed_to_job_walk'
--   job_walks.status        + 'pushed_to_lead', 'pushed_to_appointment'
--
-- Existing values are preserved. job_walks also picks up 'upcoming' here so
-- the column constraint matches what the app has been writing — the original
-- CHECK from 20260423 only listed 'in_progress' and was apparently widened
-- out-of-band; this migration codifies both.
--
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- leads ---------------------------------------------------------------
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN (
    'new',
    'appointment_set',
    'sent_to_estimating',
    'unable_to_reach',
    'disqualified',
    'job_walk_scheduled'
  ));

-- crm_appointments ----------------------------------------------------
ALTER TABLE crm_appointments DROP CONSTRAINT IF EXISTS crm_appointments_status_check;
ALTER TABLE crm_appointments ADD CONSTRAINT crm_appointments_status_check
  CHECK (status IN (
    'scheduled',
    'completed',
    'cancelled',
    'pushed_to_lead',
    'pushed_to_job_walk'
  ));

-- job_walks -----------------------------------------------------------
ALTER TABLE job_walks DROP CONSTRAINT IF EXISTS job_walks_status_check;
ALTER TABLE job_walks ADD CONSTRAINT job_walks_status_check
  CHECK (status IN (
    'upcoming',
    'in_progress',
    'completed',
    'sent_to_estimating',
    'pushed_to_lead',
    'pushed_to_appointment'
  ));
