-- ============================================================================
-- CRM — Phase 1A
-- Tables: crm_companies, crm_contacts, crm_company_addresses, crm_tags,
--         crm_company_tags, crm_call_log, crm_comments, crm_files,
--         crm_appointments, crm_follow_up_reminders, crm_call_templates
-- Storage bucket: crm-files
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- crm_companies
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  zone text,
  region text,
  state text,
  county text,
  city text,
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted')),
  priority text DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  lead_source text,
  deal_value numeric(12, 2) DEFAULT 0,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_status ON crm_companies (status);
CREATE INDEX IF NOT EXISTS idx_crm_companies_assigned_to ON crm_companies (assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_companies_created_at ON crm_companies (created_at DESC);

-- ============================================================================
-- crm_contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_id ON crm_contacts (company_id);

-- ============================================================================
-- crm_company_addresses
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_company_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  label text,
  address text NOT NULL,
  city text,
  state text,
  zip text,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_company_addresses_company_id ON crm_company_addresses (company_id);

-- ============================================================================
-- crm_tags
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- crm_company_tags (junction)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_company_tags (
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_company_tags_tag_id ON crm_company_tags (tag_id);

-- ============================================================================
-- crm_call_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('connected', 'voicemail', 'no_answer', 'busy', 'wrong_number', 'email_sent', 'text_sent')),
  notes text,
  call_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_call_log_company_id ON crm_call_log (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_call_log_call_date ON crm_call_log (call_date DESC);

-- ============================================================================
-- crm_comments
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_comments_company_id ON crm_comments (company_id);

-- ============================================================================
-- crm_files
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  file_type text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_files_company_id ON crm_files (company_id);

-- ============================================================================
-- crm_appointments
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title text,
  date timestamptz NOT NULL,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  pushed_to text
    CHECK (pushed_to IN ('job_walk', 'estimating', 'estimate', 'job') OR pushed_to IS NULL),
  pushed_ref_id uuid,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_appointments_company_id ON crm_appointments (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_appointments_date ON crm_appointments (date);
CREATE INDEX IF NOT EXISTS idx_crm_appointments_assigned_to ON crm_appointments (assigned_to);

-- ============================================================================
-- crm_follow_up_reminders
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  reminder_date timestamptz NOT NULL,
  note text,
  is_completed boolean DEFAULT false,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_follow_up_reminders_company_id ON crm_follow_up_reminders (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_follow_up_reminders_reminder_date ON crm_follow_up_reminders (reminder_date);
CREATE INDEX IF NOT EXISTS idx_crm_follow_up_reminders_assigned_to ON crm_follow_up_reminders (assigned_to);

-- ============================================================================
-- crm_call_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_call_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('call_script', 'voicemail_script', 'email_template', 'text_template')),
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_company_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_company_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_follow_up_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_call_templates ENABLE ROW LEVEL SECURITY;

-- crm_companies policies
CREATE POLICY "Authenticated users can view crm_companies"
  ON crm_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_companies"
  ON crm_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_companies"
  ON crm_companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_companies"
  ON crm_companies FOR DELETE TO authenticated USING (true);

-- crm_contacts policies
CREATE POLICY "Authenticated users can view crm_contacts"
  ON crm_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_contacts"
  ON crm_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_contacts"
  ON crm_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_contacts"
  ON crm_contacts FOR DELETE TO authenticated USING (true);

-- crm_company_addresses policies
CREATE POLICY "Authenticated users can view crm_company_addresses"
  ON crm_company_addresses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_company_addresses"
  ON crm_company_addresses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_company_addresses"
  ON crm_company_addresses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_company_addresses"
  ON crm_company_addresses FOR DELETE TO authenticated USING (true);

-- crm_tags policies
CREATE POLICY "Authenticated users can view crm_tags"
  ON crm_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_tags"
  ON crm_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_tags"
  ON crm_tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_tags"
  ON crm_tags FOR DELETE TO authenticated USING (true);

-- crm_company_tags policies
CREATE POLICY "Authenticated users can view crm_company_tags"
  ON crm_company_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_company_tags"
  ON crm_company_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_company_tags"
  ON crm_company_tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_company_tags"
  ON crm_company_tags FOR DELETE TO authenticated USING (true);

-- crm_call_log policies
CREATE POLICY "Authenticated users can view crm_call_log"
  ON crm_call_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_call_log"
  ON crm_call_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_call_log"
  ON crm_call_log FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_call_log"
  ON crm_call_log FOR DELETE TO authenticated USING (true);

-- crm_comments policies
CREATE POLICY "Authenticated users can view crm_comments"
  ON crm_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_comments"
  ON crm_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_comments"
  ON crm_comments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_comments"
  ON crm_comments FOR DELETE TO authenticated USING (true);

-- crm_files policies
CREATE POLICY "Authenticated users can view crm_files"
  ON crm_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_files"
  ON crm_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_files"
  ON crm_files FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_files"
  ON crm_files FOR DELETE TO authenticated USING (true);

-- crm_appointments policies
CREATE POLICY "Authenticated users can view crm_appointments"
  ON crm_appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_appointments"
  ON crm_appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_appointments"
  ON crm_appointments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_appointments"
  ON crm_appointments FOR DELETE TO authenticated USING (true);

-- crm_follow_up_reminders policies
CREATE POLICY "Authenticated users can view crm_follow_up_reminders"
  ON crm_follow_up_reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_follow_up_reminders"
  ON crm_follow_up_reminders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_follow_up_reminders"
  ON crm_follow_up_reminders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_follow_up_reminders"
  ON crm_follow_up_reminders FOR DELETE TO authenticated USING (true);

-- crm_call_templates policies
CREATE POLICY "Authenticated users can view crm_call_templates"
  ON crm_call_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_call_templates"
  ON crm_call_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_call_templates"
  ON crm_call_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_call_templates"
  ON crm_call_templates FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION crm_companies_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_companies_updated_at ON crm_companies;
CREATE TRIGGER crm_companies_updated_at
  BEFORE UPDATE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION crm_companies_set_updated_at();

CREATE OR REPLACE FUNCTION crm_contacts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_contacts_updated_at ON crm_contacts;
CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION crm_contacts_set_updated_at();

CREATE OR REPLACE FUNCTION crm_appointments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_appointments_updated_at ON crm_appointments;
CREATE TRIGGER crm_appointments_updated_at
  BEFORE UPDATE ON crm_appointments
  FOR EACH ROW EXECUTE FUNCTION crm_appointments_set_updated_at();

CREATE OR REPLACE FUNCTION crm_call_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_call_templates_updated_at ON crm_call_templates;
CREATE TRIGGER crm_call_templates_updated_at
  BEFORE UPDATE ON crm_call_templates
  FOR EACH ROW EXECUTE FUNCTION crm_call_templates_set_updated_at();

-- ============================================================================
-- Storage bucket: crm-files
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-files', 'crm-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload crm files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crm-files');

CREATE POLICY "Anyone can view crm files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'crm-files');

CREATE POLICY "Authenticated users can update crm files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'crm-files');

CREATE POLICY "Authenticated users can delete crm files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'crm-files');
