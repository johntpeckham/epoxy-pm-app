-- ============================================================================
-- Project Takeoff — Adds project_takeoff_projects and related tables
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. Projects table
CREATE TABLE IF NOT EXISTS project_takeoff_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  measurements text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_takeoff_projects_customer
  ON project_takeoff_projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_project_takeoff_projects_created_by
  ON project_takeoff_projects (created_by);

-- 2. Measurement PDFs table
CREATE TABLE IF NOT EXISTS project_takeoff_measurement_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project_takeoff_projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_takeoff_measurement_pdfs_project
  ON project_takeoff_measurement_pdfs (project_id);

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION set_project_takeoff_projects_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_takeoff_projects_updated_at ON project_takeoff_projects;
CREATE TRIGGER trg_project_takeoff_projects_updated_at
  BEFORE UPDATE ON project_takeoff_projects
  FOR EACH ROW
  EXECUTE FUNCTION set_project_takeoff_projects_updated_at();

-- 4. RLS policies
ALTER TABLE project_takeoff_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view project takeoff projects"
  ON project_takeoff_projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert project takeoff projects"
  ON project_takeoff_projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update project takeoff projects"
  ON project_takeoff_projects FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete project takeoff projects"
  ON project_takeoff_projects FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE project_takeoff_measurement_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view project takeoff measurement pdfs"
  ON project_takeoff_measurement_pdfs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert project takeoff measurement pdfs"
  ON project_takeoff_measurement_pdfs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update project takeoff measurement pdfs"
  ON project_takeoff_measurement_pdfs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete project takeoff measurement pdfs"
  ON project_takeoff_measurement_pdfs FOR DELETE
  TO authenticated
  USING (true);

-- 5. Storage bucket for measurement PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-takeoff-measurements', 'project-takeoff-measurements', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload project takeoff measurement pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-takeoff-measurements');

CREATE POLICY "Anyone can view project takeoff measurement pdfs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'project-takeoff-measurements');

CREATE POLICY "Authenticated users can update project takeoff measurement pdfs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-takeoff-measurements');

CREATE POLICY "Authenticated users can delete project takeoff measurement pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-takeoff-measurements');
