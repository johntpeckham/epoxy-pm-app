-- ============================================================================
-- Estimating — Measurement Sections
-- Adds estimating_project_measurement_sections (one row per section per
-- project) and seeds a "Default" section for every project that already has
-- measurement data. Item-level sectionId assignment happens lazily in the
-- client on first load (see TakeoffClient.tsx) — we do NOT update the JSONB
-- here because items live inside the `measurements` jsonb column and the
-- client will autosave new sectionId values back on the next change.
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS estimating_project_measurement_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimating_project_measurement_sections_project
  ON estimating_project_measurement_sections (project_id, sort_order);

ALTER TABLE estimating_project_measurement_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimating measurement sections"
  ON estimating_project_measurement_sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimating measurement sections"
  ON estimating_project_measurement_sections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating measurement sections"
  ON estimating_project_measurement_sections FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimating measurement sections"
  ON estimating_project_measurement_sections FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION estimating_project_measurement_sections_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimating_project_measurement_sections_updated_at
  ON estimating_project_measurement_sections;
CREATE TRIGGER estimating_project_measurement_sections_updated_at
  BEFORE UPDATE ON estimating_project_measurement_sections
  FOR EACH ROW EXECUTE FUNCTION estimating_project_measurement_sections_set_updated_at();

-- Backfill: one Default section per project that already has measurement
-- data (i.e. has at least one row in estimating_project_measurement_pdfs).
-- Skip projects that already have a section so this is safe to re-run.
INSERT INTO estimating_project_measurement_sections (project_id, name, sort_order)
SELECT DISTINCT p.project_id, 'Default', 0
FROM estimating_project_measurement_pdfs p
WHERE NOT EXISTS (
  SELECT 1 FROM estimating_project_measurement_sections s
  WHERE s.project_id = p.project_id
);
