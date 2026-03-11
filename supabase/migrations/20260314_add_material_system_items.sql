-- Create material_system_items table
CREATE TABLE IF NOT EXISTS material_system_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_system_id uuid NOT NULL REFERENCES material_systems(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  unit_size text,
  coverage_rate text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE material_system_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material system items"
  ON material_system_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert material system items"
  ON material_system_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update material system items"
  ON material_system_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete material system items"
  ON material_system_items FOR DELETE
  TO authenticated
  USING (true);

-- Add notes column to material_systems
ALTER TABLE material_systems ADD COLUMN IF NOT EXISTS notes text;

-- Drop old columns from material_systems
ALTER TABLE material_systems
  DROP COLUMN IF EXISTS default_quantity,
  DROP COLUMN IF EXISTS default_coverage_rate,
  DROP COLUMN IF EXISTS default_notes;
