-- ============================================================================
-- Job Walks — Phase 1
-- Table: job_walks
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_walks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  address text,
  date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'sent_to_estimating')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_walks_created_at ON job_walks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_walks_customer_id ON job_walks (customer_id);
CREATE INDEX IF NOT EXISTS idx_job_walks_created_by ON job_walks (created_by);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE job_walks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job walks"
  ON job_walks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job walks"
  ON job_walks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job walks"
  ON job_walks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete job walks"
  ON job_walks FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION job_walks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_walks_updated_at ON job_walks;
CREATE TRIGGER job_walks_updated_at
  BEFORE UPDATE ON job_walks
  FOR EACH ROW EXECUTE FUNCTION job_walks_set_updated_at();
