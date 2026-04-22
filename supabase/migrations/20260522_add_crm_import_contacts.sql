-- ============================================================================
-- CRM Import Contacts — multiple contacts per staged import record
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- 1. Create the crm_import_contacts table
CREATE TABLE IF NOT EXISTS crm_import_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_record_id uuid NOT NULL REFERENCES crm_import_records(id) ON DELETE CASCADE,
  contact_order integer NOT NULL DEFAULT 1,
  first_name text,
  last_name text,
  title text,
  email text,
  phones jsonb,
  call_status text,
  call_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_import_contacts_record_id
  ON crm_import_contacts (import_record_id);

-- 2. Enable RLS
ALTER TABLE crm_import_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_import_contacts"
  ON crm_import_contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_import_contacts"
  ON crm_import_contacts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update crm_import_contacts"
  ON crm_import_contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_import_contacts"
  ON crm_import_contacts FOR DELETE TO authenticated USING (true);

-- 3. Migrate existing contact data from crm_import_records
INSERT INTO crm_import_contacts (import_record_id, contact_order, first_name, last_name, title, email, phones, call_status, call_date)
SELECT
  r.id,
  1,
  r.contact_first_name,
  r.contact_last_name,
  r.contact_job_title,
  r.contact_email,
  r.contact_phones,
  r.last_call_status,
  r.last_call_date
FROM crm_import_records r
WHERE r.contact_first_name IS NOT NULL
   OR r.contact_last_name IS NOT NULL
   OR r.contact_email IS NOT NULL
   OR r.contact_phone IS NOT NULL;
