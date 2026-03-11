-- Material Systems master list
-- Run this SQL in the Supabase SQL editor if migrations don't run automatically.

CREATE TABLE IF NOT EXISTS material_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE material_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material systems"
  ON material_systems FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert material systems"
  ON material_systems FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update material systems"
  ON material_systems FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete material systems"
  ON material_systems FOR DELETE
  TO authenticated
  USING (true);
