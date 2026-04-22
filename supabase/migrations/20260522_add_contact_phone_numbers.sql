-- ============================================================================
-- Contact Phone Numbers — multiple phone support per contact
-- Also adds contact_phones jsonb to crm_import_records for staging.
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- 1. Create the contact_phone_numbers table
CREATE TABLE IF NOT EXISTS contact_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  phone_number text NOT NULL,
  phone_type text NOT NULL DEFAULT 'office'
    CHECK (phone_type IN ('office', 'mobile', 'fax', 'other')),
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_phone_numbers_contact_id
  ON contact_phone_numbers (contact_id);

-- 2. Enable RLS
ALTER TABLE contact_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact_phone_numbers"
  ON contact_phone_numbers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert contact_phone_numbers"
  ON contact_phone_numbers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update contact_phone_numbers"
  ON contact_phone_numbers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contact_phone_numbers"
  ON contact_phone_numbers FOR DELETE TO authenticated USING (true);

-- 3. Migrate existing phone data from contacts table
INSERT INTO contact_phone_numbers (contact_id, company_id, phone_number, phone_type, is_primary)
SELECT c.id, c.company_id, c.phone, 'office', true
FROM contacts c
WHERE c.phone IS NOT NULL AND c.phone <> '';

-- 4. Add contact_phones jsonb column to crm_import_records for multi-phone staging
ALTER TABLE crm_import_records ADD COLUMN IF NOT EXISTS contact_phones jsonb;
