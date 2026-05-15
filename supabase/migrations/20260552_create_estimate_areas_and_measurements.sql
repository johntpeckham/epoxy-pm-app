-- ============================================================================
-- Phase 2: Estimate Detail — child tables for areas + section measurements
-- ============================================================================
-- Creates estimate_areas + estimate_area_measurements (the schema for the
-- Areas & measurements tab). Also bumps the Foreman role's default for the
-- 'estimating' feature from 'off' to 'view_only' so foremen can read
-- estimates without editing them. The matching TS types already exist in
-- src/components/sales/estimating/types.ts (scaffolding ahead of the DB);
-- this migration is the first to make them real.
-- ============================================================================

-- ── 1. estimate_areas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  area_type text NOT NULL CHECK (area_type IN ('floor','roof','walls','cove','custom')),
  name text NOT NULL DEFAULT '',
  parent_area_id uuid REFERENCES estimate_areas(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_areas_estimate_id
  ON estimate_areas(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_areas_parent_area_id
  ON estimate_areas(parent_area_id);
CREATE INDEX IF NOT EXISTS idx_estimate_areas_sort_order
  ON estimate_areas(sort_order);

ALTER TABLE estimate_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_areas_select" ON estimate_areas;
DROP POLICY IF EXISTS "estimate_areas_insert" ON estimate_areas;
DROP POLICY IF EXISTS "estimate_areas_update" ON estimate_areas;
DROP POLICY IF EXISTS "estimate_areas_delete" ON estimate_areas;

CREATE POLICY "estimate_areas_select" ON estimate_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_areas_insert" ON estimate_areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "estimate_areas_update" ON estimate_areas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "estimate_areas_delete" ON estimate_areas FOR DELETE TO authenticated USING (true);


-- ── 2. estimate_area_measurements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_area_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES estimate_areas(id) ON DELETE CASCADE,
  section_name text,
  length numeric,
  width numeric,
  total numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_area_measurements_area_id
  ON estimate_area_measurements(area_id);
CREATE INDEX IF NOT EXISTS idx_estimate_area_measurements_sort_order
  ON estimate_area_measurements(sort_order);

ALTER TABLE estimate_area_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_area_measurements_select" ON estimate_area_measurements;
DROP POLICY IF EXISTS "estimate_area_measurements_insert" ON estimate_area_measurements;
DROP POLICY IF EXISTS "estimate_area_measurements_update" ON estimate_area_measurements;
DROP POLICY IF EXISTS "estimate_area_measurements_delete" ON estimate_area_measurements;

CREATE POLICY "estimate_area_measurements_select" ON estimate_area_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_area_measurements_insert" ON estimate_area_measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "estimate_area_measurements_update" ON estimate_area_measurements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "estimate_area_measurements_delete" ON estimate_area_measurements FOR DELETE TO authenticated USING (true);


-- ── 3. Bump Foreman default for 'estimating' from 'off' to 'view_only' ─────
-- Only updates the template row if it's still at the initial 'off' value
-- seeded in 20260524. Any custom level an admin already set is left alone.
-- Per-user user_permissions rows are NOT modified — existing rows preserve
-- whatever level they were backfilled or customized to.
UPDATE template_permissions
SET access_level = 'view_only'
WHERE template_id = (SELECT id FROM permission_templates WHERE name = 'Foreman default')
  AND feature = 'estimating'
  AND access_level = 'off';
