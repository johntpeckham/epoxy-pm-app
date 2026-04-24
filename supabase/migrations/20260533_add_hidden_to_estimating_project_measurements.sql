-- ============================================================================
-- Estimating — Measurement Tool: persist page deletion as soft-delete
-- Adds `hidden` flag to estimating_project_measurements so the Measurement
-- Tool can remember which PDF pages have been removed from the takeoff grid
-- across reloads without losing the underlying measurements.
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

ALTER TABLE estimating_project_measurements
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
