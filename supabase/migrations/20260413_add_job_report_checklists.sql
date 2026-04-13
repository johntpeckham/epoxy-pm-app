-- Job Report Checklists
-- Run this SQL in the Supabase SQL editor.

-- Checklist templates for job reports
CREATE TABLE IF NOT EXISTS job_report_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_report_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job report checklists"
  ON job_report_checklists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job report checklists"
  ON job_report_checklists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job report checklists"
  ON job_report_checklists FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete job report checklists"
  ON job_report_checklists FOR DELETE
  TO authenticated
  USING (true);

-- Checklist items belonging to a job report checklist
CREATE TABLE IF NOT EXISTS job_report_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES job_report_checklists(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_report_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job report checklist items"
  ON job_report_checklist_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job report checklist items"
  ON job_report_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job report checklist items"
  ON job_report_checklist_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete job report checklist items"
  ON job_report_checklist_items FOR DELETE
  TO authenticated
  USING (true);
