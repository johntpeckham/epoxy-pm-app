-- Table to store per-job checklist item completion state
CREATE TABLE job_report_checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES job_report_checklist_items(id) ON DELETE CASCADE,
  checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, checklist_item_id)
);

-- Enable RLS
ALTER TABLE job_report_checklist_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies: all authenticated users can CRUD
CREATE POLICY "Authenticated users can read checklist responses"
  ON job_report_checklist_responses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert checklist responses"
  ON job_report_checklist_responses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update checklist responses"
  ON job_report_checklist_responses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete checklist responses"
  ON job_report_checklist_responses FOR DELETE
  TO authenticated
  USING (true);
