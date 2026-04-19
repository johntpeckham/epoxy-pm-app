-- ============================================================================
-- SOP (Standard Operating Procedure) Management
-- Tables: sop_divisions, sops, sop_steps, sop_step_images,
--         sop_job_report_assignments
-- Storage: sop-images bucket
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- sop_divisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('office', 'field')),
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_divisions_type ON sop_divisions (type);

-- ============================================================================
-- sops
-- ============================================================================

CREATE TABLE IF NOT EXISTS sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('office', 'field')),
  division_id uuid REFERENCES sop_divisions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sops_type ON sops (type);
CREATE INDEX IF NOT EXISTS idx_sops_division_id ON sops (division_id);
CREATE INDEX IF NOT EXISTS idx_sops_status ON sops (status);
CREATE INDEX IF NOT EXISTS idx_sops_created_at ON sops (created_at DESC);

-- ============================================================================
-- sop_steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  text_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_steps_sop_id ON sop_steps (sop_id);

-- ============================================================================
-- sop_step_images
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_step_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_step_id uuid NOT NULL REFERENCES sop_steps(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  markup_data jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_step_images_sop_step_id ON sop_step_images (sop_step_id);

-- ============================================================================
-- sop_job_report_assignments
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_job_report_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  project_report_id uuid NOT NULL REFERENCES project_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sop_id, project_report_id)
);

CREATE INDEX IF NOT EXISTS idx_sop_job_report_assignments_sop_id ON sop_job_report_assignments (sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_job_report_assignments_project_report_id ON sop_job_report_assignments (project_report_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE sop_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_step_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_job_report_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sop_divisions"
  ON sop_divisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sop_divisions"
  ON sop_divisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sop_divisions"
  ON sop_divisions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sop_divisions"
  ON sop_divisions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sops"
  ON sops FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sops"
  ON sops FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sops"
  ON sops FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sops"
  ON sops FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sop_steps"
  ON sop_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sop_steps"
  ON sop_steps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sop_steps"
  ON sop_steps FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sop_steps"
  ON sop_steps FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sop_step_images"
  ON sop_step_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sop_step_images"
  ON sop_step_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sop_step_images"
  ON sop_step_images FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sop_step_images"
  ON sop_step_images FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sop_job_report_assignments"
  ON sop_job_report_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sop_job_report_assignments"
  ON sop_job_report_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sop_job_report_assignments"
  ON sop_job_report_assignments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sop_job_report_assignments"
  ON sop_job_report_assignments FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION sops_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sops_updated_at ON sops;
CREATE TRIGGER sops_updated_at
  BEFORE UPDATE ON sops
  FOR EACH ROW EXECUTE FUNCTION sops_set_updated_at();

CREATE OR REPLACE FUNCTION sop_steps_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sop_steps_updated_at ON sop_steps;
CREATE TRIGGER sop_steps_updated_at
  BEFORE UPDATE ON sop_steps
  FOR EACH ROW EXECUTE FUNCTION sop_steps_set_updated_at();

-- ============================================================================
-- Storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('sop-images', 'sop-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload sop images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sop-images');

CREATE POLICY "Anyone can view sop images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'sop-images');

CREATE POLICY "Authenticated users can update sop images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'sop-images');

CREATE POLICY "Authenticated users can delete sop images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sop-images');
