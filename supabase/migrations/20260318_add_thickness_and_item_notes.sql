-- Add thickness and item_notes columns to material_system_items
-- Replace unit_size with thickness in the UI (keep unit_size column for backward compat)
ALTER TABLE material_system_items ADD COLUMN IF NOT EXISTS thickness text;
ALTER TABLE material_system_items ADD COLUMN IF NOT EXISTS item_notes text;
