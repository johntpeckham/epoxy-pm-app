-- Revert dual-version material system changes

-- Drop the material_system_columns table
DROP TABLE IF EXISTS material_system_columns;

-- Remove version and custom_column_values columns from material_system_items
ALTER TABLE material_system_items DROP COLUMN IF EXISTS version;
ALTER TABLE material_system_items DROP COLUMN IF EXISTS custom_column_values;

-- Drop indexes that were added for versioning
DROP INDEX IF EXISTS idx_material_system_items_version;
DROP INDEX IF EXISTS idx_material_system_columns_system;
