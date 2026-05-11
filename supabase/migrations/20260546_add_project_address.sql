-- ============================================================================
-- Add project_address column to leads, crm_appointments, and job_walks.
--
-- This supports a new "Project Address" field on the unified creation modals
-- and the Info card on each detail page. The customer address (column
-- "address") remains the customer's address; "project_address" is the
-- address where the project is actually being performed. The UI offers a
-- "Same as customer address" checkbox that mirrors customer address into
-- project_address, but that checkbox state is UI-only and not persisted.
--
-- No backfill — existing rows have NULL project_address, which the UI
-- renders as an em dash.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS project_address text;

ALTER TABLE crm_appointments
  ADD COLUMN IF NOT EXISTS project_address text;

ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS project_address text;
