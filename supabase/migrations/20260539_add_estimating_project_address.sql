-- ============================================================================
-- Estimating projects: structured project address columns
-- Adds project_address_street / city / state / zip to estimating_projects
-- so each project can carry its own job-site address independent of the
-- linked customer's address. All nullable — existing rows stay valid; the
-- new Edit Project modal lets users fill them in later.
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

ALTER TABLE estimating_projects
  ADD COLUMN IF NOT EXISTS project_address_street text,
  ADD COLUMN IF NOT EXISTS project_address_city   text,
  ADD COLUMN IF NOT EXISTS project_address_state  text,
  ADD COLUMN IF NOT EXISTS project_address_zip    text;
