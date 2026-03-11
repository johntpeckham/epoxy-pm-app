-- Add optional default fields to material_systems
ALTER TABLE material_systems
  ADD COLUMN IF NOT EXISTS default_quantity text,
  ADD COLUMN IF NOT EXISTS default_coverage_rate text,
  ADD COLUMN IF NOT EXISTS default_notes text;
