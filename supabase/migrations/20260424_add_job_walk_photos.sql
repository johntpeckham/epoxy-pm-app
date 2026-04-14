-- ============================================================================
-- Job Walk Photos — Phase 2
-- Table: job_walk_photos
-- Storage bucket: job-walk-photos
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_walk_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_walk_id uuid NOT NULL REFERENCES job_walks(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_walk_photos_walk_id
  ON job_walk_photos (job_walk_id);
CREATE INDEX IF NOT EXISTS idx_job_walk_photos_sort
  ON job_walk_photos (job_walk_id, sort_order, created_at);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE job_walk_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job walk photos"
  ON job_walk_photos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job walk photos"
  ON job_walk_photos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job walk photos"
  ON job_walk_photos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete job walk photos"
  ON job_walk_photos FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- Storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-walk-photos', 'job-walk-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (mirror existing `post-photos` pattern)
CREATE POLICY "Authenticated users can upload job walk photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-walk-photos');

CREATE POLICY "Anyone can view job walk photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'job-walk-photos');

CREATE POLICY "Authenticated users can update job walk photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'job-walk-photos');

CREATE POLICY "Authenticated users can delete job walk photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-walk-photos');
