-- ============================================================================
-- Areas tab: section-level coves
-- ============================================================================
-- Coves are now per-section, not per-floor. Each row in
-- estimate_area_measurements can have multiple coves linked to it via this
-- new table. The old "cove as nested area" model (estimate_areas with
-- parent_area_id set) is retired — those rows are wiped here. The app is
-- in active build with fake data only, so this is non-destructive in
-- practice; per the standing note in CONTEXT.
-- ============================================================================

-- 1. estimate_section_coves ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_section_coves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES estimate_area_measurements(id) ON DELETE CASCADE,
  cove_length numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_section_coves_section_id
  ON estimate_section_coves(section_id);
CREATE INDEX IF NOT EXISTS idx_estimate_section_coves_sort_order
  ON estimate_section_coves(sort_order);

ALTER TABLE estimate_section_coves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_section_coves_select" ON estimate_section_coves;
DROP POLICY IF EXISTS "estimate_section_coves_insert" ON estimate_section_coves;
DROP POLICY IF EXISTS "estimate_section_coves_update" ON estimate_section_coves;
DROP POLICY IF EXISTS "estimate_section_coves_delete" ON estimate_section_coves;

CREATE POLICY "estimate_section_coves_select" ON estimate_section_coves FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_section_coves_insert" ON estimate_section_coves FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "estimate_section_coves_update" ON estimate_section_coves FOR UPDATE TO authenticated USING (true);
CREATE POLICY "estimate_section_coves_delete" ON estimate_section_coves FOR DELETE TO authenticated USING (true);


-- 2. Wipe legacy nested-cove area records. Their estimate_area_measurements
--    children cascade-delete via the existing area_id FK CASCADE.
DELETE FROM estimate_areas WHERE parent_area_id IS NOT NULL;
