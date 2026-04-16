-- ============================================================================
-- Estimating — Phase 3: Send estimate + follow-up logging
-- Adds status tracking columns to estimates, estimate_follow_ups table
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- 1. Extend estimates with send/status tracking columns
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS sent_to_email text;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS sent_to_name text;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS sent_message text;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- status column already exists with default 'Draft'. No change needed —
-- the app will now also write 'Declined' in addition to existing values.

CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates (status);
CREATE INDEX IF NOT EXISTS idx_estimates_sent_at ON estimates (sent_at);

-- 2. estimate_follow_ups — log outreach activity per estimate
CREATE TABLE IF NOT EXISTS estimate_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  project_id uuid REFERENCES estimating_projects(id) ON DELETE SET NULL,
  follow_up_type text NOT NULL
    CHECK (follow_up_type IN ('call', 'email', 'text', 'other')),
  notes text,
  outcome text
    CHECK (
      outcome IN ('connected', 'voicemail', 'no_answer', 'sent', 'replied', 'other')
      OR outcome IS NULL
    ),
  contacted_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_follow_ups_estimate_id
  ON estimate_follow_ups (estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_follow_ups_project_id
  ON estimate_follow_ups (project_id);
CREATE INDEX IF NOT EXISTS idx_estimate_follow_ups_created_at
  ON estimate_follow_ups (created_at DESC);

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE estimate_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimate follow ups"
  ON estimate_follow_ups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimate follow ups"
  ON estimate_follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimate follow ups"
  ON estimate_follow_ups FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimate follow ups"
  ON estimate_follow_ups FOR DELETE
  TO authenticated
  USING (true);
