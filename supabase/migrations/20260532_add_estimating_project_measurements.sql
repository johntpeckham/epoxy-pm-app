-- ============================================================================
-- Estimating — Measurement Tool Supabase persistence
-- Adds estimating_project_measurements table (one row per PDF page)
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
--
-- Storage bucket note:
--   The existing public bucket `estimating-project-files` (created in
--   20260504_add_estimating_projects.sql) already backs the "Upload PDF"
--   button in ProjectMeasurementsCard and the `storage_path` column on
--   `estimating_project_measurement_pdfs` is already populated. This
--   migration does NOT create a new bucket — we reuse the existing one to
--   avoid orphaning PDFs that have already been uploaded by users.
-- ============================================================================

CREATE TABLE IF NOT EXISTS estimating_project_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  pdf_id uuid NOT NULL REFERENCES estimating_project_measurement_pdfs(id) ON DELETE CASCADE,
  page_number integer NOT NULL DEFAULT 1,
  measurements jsonb NOT NULL DEFAULT '[]'::jsonb,
  scale_calibration jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pdf_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_estimating_project_measurements_project_id
  ON estimating_project_measurements (project_id);
CREATE INDEX IF NOT EXISTS idx_estimating_project_measurements_pdf_id
  ON estimating_project_measurements (pdf_id);

ALTER TABLE estimating_project_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimating project measurements"
  ON estimating_project_measurements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimating project measurements"
  ON estimating_project_measurements FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating project measurements"
  ON estimating_project_measurements FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimating project measurements"
  ON estimating_project_measurements FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION estimating_project_measurements_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimating_project_measurements_updated_at
  ON estimating_project_measurements;
CREATE TRIGGER estimating_project_measurements_updated_at
  BEFORE UPDATE ON estimating_project_measurements
  FOR EACH ROW EXECUTE FUNCTION estimating_project_measurements_set_updated_at();
