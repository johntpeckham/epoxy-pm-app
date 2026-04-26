-- ============================================================================
-- Remove Pipeline feature from Estimating
--
-- Drops the Pipeline card backing data:
--   - pipeline_history (audit log)
--   - pipeline_stages (configurable stage lookup)
--   - estimating_projects.pipeline_stage column
--
-- The estimating_reminders and reminder_rules tables are intentionally kept;
-- they continue to power the Reminders card which is independent of pipeline.
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- Drop pipeline_stages updated_at trigger + function
DROP TRIGGER IF EXISTS pipeline_stages_updated_at ON pipeline_stages;
DROP FUNCTION IF EXISTS pipeline_stages_set_updated_at();

-- Drop pipeline_history first (FK to estimating_projects, cascades anyway)
DROP TABLE IF EXISTS pipeline_history CASCADE;

-- Drop pipeline_stages lookup table
DROP TABLE IF EXISTS pipeline_stages CASCADE;

-- Drop the pipeline_stage column on estimating_projects
ALTER TABLE estimating_projects DROP COLUMN IF EXISTS pipeline_stage;
