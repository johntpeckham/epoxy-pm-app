-- Custom columns defined by admins for the CRM table
CREATE TABLE IF NOT EXISTS crm_custom_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  column_type text NOT NULL CHECK (column_type IN ('text', 'number', 'date', 'select')),
  select_options jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_custom_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view custom columns"
  ON crm_custom_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom columns"
  ON crm_custom_columns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom columns"
  ON crm_custom_columns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom columns"
  ON crm_custom_columns FOR DELETE TO authenticated USING (true);

-- Field values for custom columns on CRM company records
CREATE TABLE IF NOT EXISTS crm_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  record_id uuid NOT NULL,
  column_id uuid NOT NULL REFERENCES crm_custom_columns(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, column_id)
);

ALTER TABLE crm_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view custom field values"
  ON crm_custom_field_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom field values"
  ON crm_custom_field_values FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom field values"
  ON crm_custom_field_values FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom field values"
  ON crm_custom_field_values FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_crm_custom_field_values_record ON crm_custom_field_values (record_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_field_values_column ON crm_custom_field_values (column_id);

-- Per-user column visibility preferences for the CRM table
CREATE TABLE IF NOT EXISTS crm_user_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  company_id uuid NOT NULL,
  visible_columns jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE crm_user_column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own column preferences"
  ON crm_user_column_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own column preferences"
  ON crm_user_column_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own column preferences"
  ON crm_user_column_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
