-- ============================================================================
-- Leads — Phase 1
-- Tables: leads, lead_photos, lead_measurement_pdfs, lead_categories
-- Storage buckets: lead-photos, lead-measurement-pdfs
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- 1. leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  company_id uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  address text,
  date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  category text,
  project_details text,
  measurements text,
  pushed_to text CHECK (pushed_to IN ('appointment', 'job_walk', 'estimating', 'estimate', 'job')),
  pushed_ref_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads (company_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads (created_by);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leads"
  ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete leads"
  ON leads FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION leads_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_updated_at();

-- 2. lead_photos
CREATE TABLE IF NOT EXISTS lead_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_id ON lead_photos (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_photos_sort
  ON lead_photos (lead_id, sort_order, created_at);

ALTER TABLE lead_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lead photos"
  ON lead_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert lead photos"
  ON lead_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update lead photos"
  ON lead_photos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete lead photos"
  ON lead_photos FOR DELETE TO authenticated USING (true);

-- 3. lead_measurement_pdfs
CREATE TABLE IF NOT EXISTS lead_measurement_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_measurement_pdfs_lead_id
  ON lead_measurement_pdfs (lead_id);

ALTER TABLE lead_measurement_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lead measurement pdfs"
  ON lead_measurement_pdfs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert lead measurement pdfs"
  ON lead_measurement_pdfs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update lead measurement pdfs"
  ON lead_measurement_pdfs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete lead measurement pdfs"
  ON lead_measurement_pdfs FOR DELETE TO authenticated USING (true);

-- 4. lead_categories
CREATE TABLE IF NOT EXISTS lead_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lead categories"
  ON lead_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert lead categories"
  ON lead_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update lead categories"
  ON lead_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete lead categories"
  ON lead_categories FOR DELETE TO authenticated USING (true);

INSERT INTO lead_categories (name) VALUES
  ('Phone Call'),
  ('Email'),
  ('Zoom Info'),
  ('Website Google Ads'),
  ('Website Organic')
ON CONFLICT (name) DO NOTHING;

-- 5. Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-photos', 'lead-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-measurement-pdfs', 'lead-measurement-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- lead-photos storage policies
CREATE POLICY "Authenticated users can upload lead photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-photos');
CREATE POLICY "Anyone can view lead photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'lead-photos');
CREATE POLICY "Authenticated users can update lead photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-photos');
CREATE POLICY "Authenticated users can delete lead photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-photos');

-- lead-measurement-pdfs storage policies
CREATE POLICY "Authenticated users can upload lead measurement pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-measurement-pdfs');
CREATE POLICY "Anyone can view lead measurement pdfs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'lead-measurement-pdfs');
CREATE POLICY "Authenticated users can update lead measurement pdfs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-measurement-pdfs');
CREATE POLICY "Authenticated users can delete lead measurement pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-measurement-pdfs');
