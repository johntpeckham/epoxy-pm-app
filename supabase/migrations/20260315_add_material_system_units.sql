-- Create material_system_units table for unit size dropdown options
CREATE TABLE IF NOT EXISTS material_system_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE material_system_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material system units"
  ON material_system_units FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert material system units"
  ON material_system_units FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update material system units"
  ON material_system_units FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete material system units"
  ON material_system_units FOR DELETE
  TO authenticated
  USING (true);

-- Seed default units
INSERT INTO material_system_units (name) VALUES ('Gal'), ('Qt'), ('Kit')
ON CONFLICT (name) DO NOTHING;
