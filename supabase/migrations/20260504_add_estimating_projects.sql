-- ============================================================================
-- Estimating — Phase 1
-- Adds estimating_projects table (projects under customers)
-- Adds estimating_project_measurement_pdfs table
-- Adds estimating-project-files storage bucket
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- 1. estimating_projects
CREATE TABLE IF NOT EXISTS estimating_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'on_hold')),
  source text
    CHECK (source IN ('job_walk', 'lead', 'appointment', 'manual') OR source IS NULL),
  source_ref_id uuid,
  measurements text,
  pipeline_stage text NOT NULL DEFAULT 'estimating',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimating_projects_customer_id
  ON estimating_projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_estimating_projects_created_at
  ON estimating_projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimating_projects_created_by
  ON estimating_projects (created_by);

-- 2. estimating_project_measurement_pdfs
CREATE TABLE IF NOT EXISTS estimating_project_measurement_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimating_project_measurement_pdfs_project_id
  ON estimating_project_measurement_pdfs (project_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE estimating_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimating projects"
  ON estimating_projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimating projects"
  ON estimating_projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating projects"
  ON estimating_projects FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimating projects"
  ON estimating_projects FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE estimating_project_measurement_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimating project pdfs"
  ON estimating_project_measurement_pdfs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimating project pdfs"
  ON estimating_project_measurement_pdfs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating project pdfs"
  ON estimating_project_measurement_pdfs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimating project pdfs"
  ON estimating_project_measurement_pdfs FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- updated_at trigger on estimating_projects
-- ============================================================================

CREATE OR REPLACE FUNCTION estimating_projects_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimating_projects_updated_at ON estimating_projects;
CREATE TRIGGER estimating_projects_updated_at
  BEFORE UPDATE ON estimating_projects
  FOR EACH ROW EXECUTE FUNCTION estimating_projects_set_updated_at();

-- ============================================================================
-- Storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('estimating-project-files', 'estimating-project-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload estimating project files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'estimating-project-files');

CREATE POLICY "Anyone can view estimating project files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'estimating-project-files');

CREATE POLICY "Authenticated users can update estimating project files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'estimating-project-files');

CREATE POLICY "Authenticated users can delete estimating project files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'estimating-project-files');

-- ============================================================================
-- Add pushed_to / pushed_ref_id to job_walks (Phase 1 pipeline plumbing)
-- ============================================================================

ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS pushed_to text
    CHECK (pushed_to IN ('estimating', 'estimate', 'job') OR pushed_to IS NULL);

ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS pushed_ref_id uuid;
