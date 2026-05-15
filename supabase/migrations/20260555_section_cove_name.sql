-- ============================================================================
-- Areas tab: optional name (label) on each section cove line
-- ============================================================================
-- Users can now tag each cove line with a free-form label (e.g.
-- "North wall cove", "Entryway cove"). Optional — null/empty saves cleanly.
-- ============================================================================

ALTER TABLE estimate_section_coves
  ADD COLUMN IF NOT EXISTS name text;
