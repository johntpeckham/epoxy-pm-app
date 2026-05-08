-- ============================================================================
-- Unify Lead / Appointment / Job Walk detail pages
--
-- 1. Adds lead_source, lead_category_id, project_details columns where missing.
-- 2. Adds project_name, customer_name/email/phone, measurements to
--    crm_appointments so the appointment detail page can show the same Info,
--    Project Details, and Measurements sections as Leads & Job Walks.
-- 3. Backfills leads.lead_category_id from leads.category (free-text name).
-- 4. Migrates job_walks.notes -> job_walks.project_details (notes kept as
--    deprecated until a future cleanup pass).
-- 5. Creates appointment_photos + appointment_measurement_pdfs child tables.
-- 6. Creates appointment-photos + appointment-measurement-pdfs storage buckets.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================================

-- ---------- 1. New columns on leads ---------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_category_id uuid REFERENCES lead_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_lead_category_id ON leads (lead_category_id);

-- Backfill lead_category_id from the legacy text "category" column where
-- there's a unique name match in lead_categories.
UPDATE leads l
SET lead_category_id = c.id
FROM lead_categories c
WHERE l.lead_category_id IS NULL
  AND l.category IS NOT NULL
  AND lower(trim(l.category)) = lower(trim(c.name));

COMMENT ON COLUMN leads.category IS
  'DEPRECATED: free-text category name. Use lead_category_id instead. Will be removed in a future cleanup pass.';

-- ---------- 2. New columns on job_walks -----------------------------------
ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_category_id uuid REFERENCES lead_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_details text;

CREATE INDEX IF NOT EXISTS idx_job_walks_lead_category_id ON job_walks (lead_category_id);

-- Migrate existing notes -> project_details when project_details is empty
UPDATE job_walks
SET project_details = notes
WHERE project_details IS NULL
  AND notes IS NOT NULL;

COMMENT ON COLUMN job_walks.notes IS
  'DEPRECATED: data has been migrated to job_walks.project_details. Will be removed in a future cleanup pass.';

-- ---------- 3. New columns on crm_appointments ----------------------------
-- crm_appointments lacks the parity fields for an Info / Project Details /
-- Measurements detail page. Add them as nullable so existing rows are valid.
ALTER TABLE crm_appointments
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_category_id uuid REFERENCES lead_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_details text,
  ADD COLUMN IF NOT EXISTS measurements text;

CREATE INDEX IF NOT EXISTS idx_crm_appointments_lead_category_id ON crm_appointments (lead_category_id);

-- Backfill project_name from title (existing free-text title field) where empty
UPDATE crm_appointments
SET project_name = title
WHERE project_name IS NULL
  AND title IS NOT NULL;

-- Backfill project_details from the existing notes column where empty.
UPDATE crm_appointments
SET project_details = notes
WHERE project_details IS NULL
  AND notes IS NOT NULL;

-- Backfill customer fields from the linked company so the new Info card has
-- something to show on existing rows.
UPDATE crm_appointments a
SET
  customer_name  = COALESCE(a.customer_name,  c.name),
  customer_email = COALESCE(a.customer_email, c.email),
  customer_phone = COALESCE(a.customer_phone, c.phone),
  address        = COALESCE(a.address,        c.address)
FROM companies c
WHERE a.company_id = c.id
  AND (
    a.customer_name IS NULL OR
    a.customer_email IS NULL OR
    a.customer_phone IS NULL OR
    a.address IS NULL
  );

-- ---------- 4. appointment_photos -----------------------------------------
CREATE TABLE IF NOT EXISTS appointment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES crm_appointments(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_photos_appointment_id
  ON appointment_photos (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_photos_sort
  ON appointment_photos (appointment_id, sort_order, created_at);

ALTER TABLE appointment_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view appointment photos" ON appointment_photos;
CREATE POLICY "Authenticated users can view appointment photos"
  ON appointment_photos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert appointment photos" ON appointment_photos;
CREATE POLICY "Authenticated users can insert appointment photos"
  ON appointment_photos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update appointment photos" ON appointment_photos;
CREATE POLICY "Authenticated users can update appointment photos"
  ON appointment_photos FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete appointment photos" ON appointment_photos;
CREATE POLICY "Authenticated users can delete appointment photos"
  ON appointment_photos FOR DELETE TO authenticated USING (true);

-- ---------- 5. appointment_measurement_pdfs -------------------------------
CREATE TABLE IF NOT EXISTS appointment_measurement_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES crm_appointments(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_measurement_pdfs_appointment_id
  ON appointment_measurement_pdfs (appointment_id);

ALTER TABLE appointment_measurement_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view appointment measurement pdfs" ON appointment_measurement_pdfs;
CREATE POLICY "Authenticated users can view appointment measurement pdfs"
  ON appointment_measurement_pdfs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert appointment measurement pdfs" ON appointment_measurement_pdfs;
CREATE POLICY "Authenticated users can insert appointment measurement pdfs"
  ON appointment_measurement_pdfs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update appointment measurement pdfs" ON appointment_measurement_pdfs;
CREATE POLICY "Authenticated users can update appointment measurement pdfs"
  ON appointment_measurement_pdfs FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete appointment measurement pdfs" ON appointment_measurement_pdfs;
CREATE POLICY "Authenticated users can delete appointment measurement pdfs"
  ON appointment_measurement_pdfs FOR DELETE TO authenticated USING (true);

-- ---------- 6. Storage buckets --------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('appointment-photos', 'appointment-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('appointment-measurement-pdfs', 'appointment-measurement-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload appointment photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload appointment photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'appointment-photos');
DROP POLICY IF EXISTS "Anyone can view appointment photos" ON storage.objects;
CREATE POLICY "Anyone can view appointment photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'appointment-photos');
-- Note: storage.objects policy names duplicate the appointment_photos table
-- policy names below; that's fine — each policy is namespaced per table.
DROP POLICY IF EXISTS "Authenticated users can update appointment photos" ON storage.objects;
CREATE POLICY "Authenticated users can update appointment photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'appointment-photos');
DROP POLICY IF EXISTS "Authenticated users can delete appointment photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete appointment photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'appointment-photos');

DROP POLICY IF EXISTS "Authenticated users can upload appointment measurement pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can upload appointment measurement pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'appointment-measurement-pdfs');
DROP POLICY IF EXISTS "Anyone can view appointment measurement pdfs" ON storage.objects;
CREATE POLICY "Anyone can view appointment measurement pdfs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'appointment-measurement-pdfs');
DROP POLICY IF EXISTS "Authenticated users can update appointment measurement pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can update appointment measurement pdfs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'appointment-measurement-pdfs');
DROP POLICY IF EXISTS "Authenticated users can delete appointment measurement pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can delete appointment measurement pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'appointment-measurement-pdfs');
