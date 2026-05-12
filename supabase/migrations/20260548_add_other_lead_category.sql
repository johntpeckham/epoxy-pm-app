-- ============================================================================
-- Add "Other" as a Lead Category
--
-- Inserts a single row into lead_categories with name='Other'. lead_categories
-- has no sort_order column — the table is (id uuid, name text UNIQUE,
-- created_at timestamptz). Display ordering is handled client-side in
-- CreationFormModal: alphabetical sort with the literal name 'Other' pinned
-- to the bottom of the dropdown.
--
-- Idempotent: the NOT EXISTS guard means re-running this migration is a
-- no-op (it also avoids the UNIQUE-constraint violation that would otherwise
-- abort the second run).
--
-- Run manually in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

INSERT INTO lead_categories (name)
SELECT 'Other'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_categories WHERE name = 'Other'
);
