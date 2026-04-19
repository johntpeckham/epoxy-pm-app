-- ============================================================================
-- SOP PDF Upload Support
-- Adds sop_format and pdf_url columns to the sops table.
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS sop_format text NOT NULL DEFAULT 'created'
    CHECK (sop_format IN ('created', 'uploaded'));

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS pdf_url text;
