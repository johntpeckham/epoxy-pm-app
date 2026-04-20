-- ============================================================================
-- Check Deposits — Tracker
-- Table: check_deposits
-- Storage bucket: check-photos
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS check_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_deposited'
    CHECK (status IN ('not_deposited', 'deposited', 'filed_in_quickbooks')),
  photo_url text,
  deposited_at timestamptz,
  filed_at timestamptz,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_deposits_company_status
  ON check_deposits (company_id, status);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE check_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view check deposits"
  ON check_deposits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert check deposits"
  ON check_deposits FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update check deposits"
  ON check_deposits FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete check deposits"
  ON check_deposits FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- Auto-update trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION check_deposits_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_deposits_updated_at ON check_deposits;
CREATE TRIGGER check_deposits_updated_at
  BEFORE UPDATE ON check_deposits
  FOR EACH ROW EXECUTE FUNCTION check_deposits_set_updated_at();

-- ============================================================================
-- Storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('check-photos', 'check-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload check photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'check-photos');

CREATE POLICY "Anyone can view check photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'check-photos');

CREATE POLICY "Authenticated users can update check photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'check-photos');

CREATE POLICY "Authenticated users can delete check photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'check-photos');
