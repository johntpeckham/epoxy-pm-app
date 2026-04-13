-- Table to store which checklist template was selected for each checklist_placeholder field per project
CREATE TABLE job_report_checklist_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_id text NOT NULL,
  checklist_id uuid NOT NULL REFERENCES job_report_checklists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, field_id)
);

-- Enable RLS
ALTER TABLE job_report_checklist_selections ENABLE ROW LEVEL SECURITY;

-- RLS policies: all authenticated users can CRUD
CREATE POLICY "Authenticated users can read checklist selections"
  ON job_report_checklist_selections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert checklist selections"
  ON job_report_checklist_selections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update checklist selections"
  ON job_report_checklist_selections FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete checklist selections"
  ON job_report_checklist_selections FOR DELETE
  TO authenticated
  USING (true);
