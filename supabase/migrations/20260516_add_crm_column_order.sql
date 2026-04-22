-- Company-wide CRM column order
CREATE TABLE IF NOT EXISTS crm_column_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  column_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE crm_column_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view column order"
  ON crm_column_order FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage column order"
  ON crm_column_order FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
