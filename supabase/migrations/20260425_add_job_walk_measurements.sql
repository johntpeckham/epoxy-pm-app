-- ============================================================================
-- Job Walks — Phase 3
-- Adds measurements text column to job_walks
-- Adds job_walk_measurement_pdfs table
-- Adds job-walk-measurements storage bucket
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- 1. measurements column on job_walks
ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS measurements text;

-- 2. PDFs table
CREATE TABLE IF NOT EXISTS job_walk_measurement_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_walk_id uuid NOT NULL REFERENCES job_walks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_walk_measurement_pdfs_walk_id
  ON job_walk_measurement_pdfs (job_walk_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE job_walk_measurement_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job walk measurement pdfs"
  ON job_walk_measurement_pdfs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job walk measurement pdfs"
  ON job_walk_measurement_pdfs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job walk measurement pdfs"
  ON job_walk_measurement_pdfs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete job walk measurement pdfs"
  ON job_walk_measurement_pdfs FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- Storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-walk-measurements', 'job-walk-measurements', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload job walk measurement pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-walk-measurements');

CREATE POLICY "Anyone can view job walk measurement pdfs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'job-walk-measurements');

CREATE POLICY "Authenticated users can update job walk measurement pdfs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'job-walk-measurements');

CREATE POLICY "Authenticated users can delete job walk measurement pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-walk-measurements');
