-- Add version column to material_system_items to distinguish internal vs client-facing rows
ALTER TABLE material_system_items
  ADD COLUMN version text NOT NULL DEFAULT 'internal'
  CHECK (version IN ('internal', 'client'));

-- Add custom_column_values JSONB column for storing custom column cell values
ALTER TABLE material_system_items
  ADD COLUMN custom_column_values jsonb DEFAULT '{}';

-- Create material_system_columns table for custom column definitions per version
CREATE TABLE material_system_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_system_id uuid NOT NULL REFERENCES material_systems(id) ON DELETE CASCADE,
  version text NOT NULL CHECK (version IN ('internal', 'client')),
  column_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL DEFAULT auth.uid()
);

-- RLS policies for material_system_columns
ALTER TABLE material_system_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own columns"
  ON material_system_columns FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own columns"
  ON material_system_columns FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own columns"
  ON material_system_columns FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own columns"
  ON material_system_columns FOR DELETE
  USING (user_id = auth.uid());

-- Index for efficient querying
CREATE INDEX idx_material_system_items_version ON material_system_items(material_system_id, version);
CREATE INDEX idx_material_system_columns_system ON material_system_columns(material_system_id, version);
