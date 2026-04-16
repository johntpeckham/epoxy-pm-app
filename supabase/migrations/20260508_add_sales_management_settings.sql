-- ============================================================================
-- Estimating — Phase 5: Sales Management settings
-- - estimate_form_settings: single-row config for estimate header, defaults,
--   sections.
-- - email_templates: follow-up email templates with merge fields.
-- - pipeline_stages.automation_rules + notification_rules: JSONB.
-- - sales_settings: singleton config (reminder escalation threshold,
--   default project number format).
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- 1. estimate_form_settings (single row)
CREATE TABLE IF NOT EXISTS estimate_form_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  company_address text,
  company_phone text,
  company_website text,
  company_logo_url text,
  default_terms text,
  default_notes text,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  default_salesperson_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sections_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed a single default row if none exists
INSERT INTO estimate_form_settings (default_tax_rate, sections_config)
SELECT 0, '[
  {"id":"project_info","name":"Project Info","visible":true,"required":false,"system":true,"type":"system"},
  {"id":"line_items","name":"Line Items","visible":true,"required":true,"system":true,"type":"system"},
  {"id":"material_systems","name":"Material Systems","visible":true,"required":false,"system":true,"type":"system"},
  {"id":"totals","name":"Subtotal / Tax / Total","visible":true,"required":true,"system":true,"type":"system"},
  {"id":"change_orders","name":"Change Orders","visible":true,"required":false,"system":true,"type":"system"},
  {"id":"terms","name":"Terms & Conditions","visible":true,"required":false,"system":true,"type":"system"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM estimate_form_settings);

ALTER TABLE estimate_form_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view estimate form settings"
  ON estimate_form_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert estimate form settings"
  ON estimate_form_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update estimate form settings"
  ON estimate_form_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION estimate_form_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimate_form_settings_updated_at ON estimate_form_settings;
CREATE TRIGGER estimate_form_settings_updated_at
  BEFORE UPDATE ON estimate_form_settings
  FOR EACH ROW EXECUTE FUNCTION estimate_form_settings_set_updated_at();

-- 2. email_templates
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view email templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION email_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION email_templates_set_updated_at();

-- 3. pipeline_stages.automation_rules + notification_rules
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS automation_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS notification_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. sales_settings (singleton: default project number format, reminder
--    escalation threshold, email template defaults)
CREATE TABLE IF NOT EXISTS sales_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_project_number_format text NOT NULL DEFAULT '1000',
  reminder_snooze_threshold integer NOT NULL DEFAULT 3,
  reminder_escalation_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sales_settings (default_project_number_format)
SELECT '1000'
WHERE NOT EXISTS (SELECT 1 FROM sales_settings);

ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sales settings"
  ON sales_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage sales settings"
  ON sales_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION sales_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_settings_updated_at ON sales_settings;
CREATE TRIGGER sales_settings_updated_at
  BEFORE UPDATE ON sales_settings
  FOR EACH ROW EXECUTE FUNCTION sales_settings_set_updated_at();
