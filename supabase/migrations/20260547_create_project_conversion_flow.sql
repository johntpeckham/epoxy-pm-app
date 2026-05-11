-- ============================================================================
-- Create Project conversion flow — schema additions
--
-- 1. Adds email/phone/lead_source/lead_category_id/converted_at to
--    estimating_projects.
-- 2. Adds converted_to_project_id (FK to estimating_projects) to leads,
--    crm_appointments, job_walks.
-- 3. Adds source column ('takeoff' | 'site') to
--    estimating_project_measurement_pdfs to distinguish PDFs from the
--    Takeoff tool vs. PDFs carried over via Lead/Appointment/Job Walk
--    conversion.
-- 4. Creates project_photos table + project-photos bucket (mirroring
--    appointment_photos pattern).
-- 5. Reuses existing description column on estimating_projects (relabeled
--    as "Project details" in UI), and existing source/source_ref_id columns
--    (for tracking conversion origin) — no new converted_from_type /
--    converted_from_id columns.
--
-- Re-runnable: every ADD COLUMN uses IF NOT EXISTS, every CREATE TABLE /
-- INDEX uses IF NOT EXISTS, every CREATE POLICY is preceded by DROP POLICY
-- IF EXISTS, the bucket INSERT uses ON CONFLICT (id) DO NOTHING, and every
-- new CONSTRAINT add is wrapped in a DO block that checks pg_constraint
-- first.
--
-- Run manually in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- ============================================================================
-- Section 1: New columns on estimating_projects
-- ============================================================================

ALTER TABLE estimating_projects
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_category_id uuid,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- FK on lead_category_id, named per the {table}_{column}_fkey convention.
-- Wrapped in a DO block so the migration is re-runnable even if the column
-- was added by a prior partial run without the FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estimating_projects_lead_category_id_fkey'
      AND conrelid = 'estimating_projects'::regclass
  ) THEN
    ALTER TABLE estimating_projects
      ADD CONSTRAINT estimating_projects_lead_category_id_fkey
      FOREIGN KEY (lead_category_id)
      REFERENCES lead_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimating_projects_lead_category_id
  ON estimating_projects (lead_category_id);

COMMENT ON COLUMN estimating_projects.description IS
  'Free-text project details. Displayed as "Project details" in the UI to match unified terminology across Lead/Appointment/Job Walk/Project entities.';

-- ============================================================================
-- Section 2: converted_to_project_id on source tables
-- ============================================================================
-- Each source row links back to the estimating_projects row it was converted
-- into. NULL means "not converted yet." Workflow status (e.g., leads.status,
-- crm_appointments.status, job_walks.status) is intentionally NOT modified by
-- conversion — this column tracks conversion state independently so the two
-- pieces of information stay separable.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_project_id uuid;

ALTER TABLE crm_appointments
  ADD COLUMN IF NOT EXISTS converted_to_project_id uuid;

ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS converted_to_project_id uuid;

-- FKs (each named per the {table}_{column}_fkey convention) wrapped in DO
-- blocks for re-runnability.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_converted_to_project_id_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_converted_to_project_id_fkey
      FOREIGN KEY (converted_to_project_id)
      REFERENCES estimating_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_appointments_converted_to_project_id_fkey'
      AND conrelid = 'crm_appointments'::regclass
  ) THEN
    ALTER TABLE crm_appointments
      ADD CONSTRAINT crm_appointments_converted_to_project_id_fkey
      FOREIGN KEY (converted_to_project_id)
      REFERENCES estimating_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_walks_converted_to_project_id_fkey'
      AND conrelid = 'job_walks'::regclass
  ) THEN
    ALTER TABLE job_walks
      ADD CONSTRAINT job_walks_converted_to_project_id_fkey
      FOREIGN KEY (converted_to_project_id)
      REFERENCES estimating_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial indexes: most source rows are NOT converted, so the index only
-- needs to cover the non-null minority. Speeds up queries that find the
-- source row for a given project, without paying for full-table coverage.
CREATE INDEX IF NOT EXISTS idx_leads_converted_to_project_id
  ON leads (converted_to_project_id)
  WHERE converted_to_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_appointments_converted_to_project_id
  ON crm_appointments (converted_to_project_id)
  WHERE converted_to_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_walks_converted_to_project_id
  ON job_walks (converted_to_project_id)
  WHERE converted_to_project_id IS NOT NULL;

-- ============================================================================
-- Section 3: source column on estimating_project_measurement_pdfs
-- ============================================================================
-- Distinguishes PDFs uploaded from the Takeoff tool ('takeoff') from PDFs
-- carried over via Lead / Appointment / Job Walk conversion ('site'). The
-- project detail page renders each group under its own sub-section.
-- Existing rows backfill to 'takeoff' via the column default.

ALTER TABLE estimating_project_measurement_pdfs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'takeoff';

-- CHECK constraint wrapped in a DO block so any partial prior run that
-- added the column without the CHECK still converges to the constrained
-- state on re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estimating_project_measurement_pdfs_source_check'
      AND conrelid = 'estimating_project_measurement_pdfs'::regclass
  ) THEN
    ALTER TABLE estimating_project_measurement_pdfs
      ADD CONSTRAINT estimating_project_measurement_pdfs_source_check
      CHECK (source IN ('takeoff', 'site'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimating_project_measurement_pdfs_source
  ON estimating_project_measurement_pdfs (project_id, source);

COMMENT ON COLUMN estimating_project_measurement_pdfs.source IS
  'Whether this measurement PDF came from the Takeoff tool (''takeoff'') or was carried over from a Lead/Appointment/Job Walk conversion (''site''). Renders under separate sub-sections on the project detail page.';

-- ============================================================================
-- Section 4: project_photos table (mirror appointment_photos pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_photos_project_id
  ON project_photos (project_id);
CREATE INDEX IF NOT EXISTS idx_project_photos_sort
  ON project_photos (project_id, sort_order, created_at);

ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view project photos" ON project_photos;
CREATE POLICY "Authenticated users can view project photos"
  ON project_photos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert project photos" ON project_photos;
CREATE POLICY "Authenticated users can insert project photos"
  ON project_photos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update project photos" ON project_photos;
CREATE POLICY "Authenticated users can update project photos"
  ON project_photos FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete project photos" ON project_photos;
CREATE POLICY "Authenticated users can delete project photos"
  ON project_photos FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Section 5: project-photos storage bucket
-- ============================================================================
-- Note: storage.objects policy names below intentionally duplicate the
-- project_photos table policy names from Section 4; Postgres namespaces
-- policies per table so the duplicates don't collide. This mirrors the
-- appointment_photos / appointment-photos pattern in
-- 20260544_unify_detail_pages.sql.

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload project photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload project photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-photos');
DROP POLICY IF EXISTS "Anyone can view project photos" ON storage.objects;
CREATE POLICY "Anyone can view project photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'project-photos');
DROP POLICY IF EXISTS "Authenticated users can update project photos" ON storage.objects;
CREATE POLICY "Authenticated users can update project photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-photos');
DROP POLICY IF EXISTS "Authenticated users can delete project photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete project photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-photos');
