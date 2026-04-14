-- Job Report Field Guides junction
-- Run this SQL in the Supabase SQL editor.
--
-- Attaches reusable field guide templates to a project's job report.
-- Mirrors the pattern used by job_report_checklist_selections
-- (which uses project_id as the report scope, since one project_reports
-- row exists per project).

CREATE TABLE IF NOT EXISTS job_report_field_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_guide_template_id uuid NOT NULL REFERENCES field_guide_templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, field_guide_template_id)
);

CREATE INDEX IF NOT EXISTS job_report_field_guides_project_idx
  ON job_report_field_guides (project_id);

ALTER TABLE job_report_field_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job report field guides"
  ON job_report_field_guides FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job report field guides"
  ON job_report_field_guides FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete job report field guides"
  ON job_report_field_guides FOR DELETE
  TO authenticated
  USING (true);
