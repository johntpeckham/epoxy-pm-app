-- ============================================================================
-- Material Systems Wave 1 cleanup: simplify Default quantity rule to a
-- single coverage rate row.
-- ============================================================================
-- Drops the now-unused mode toggle + amount + fixed-quantity columns, adds
-- a coverage_basis_unit (sqft|lf) column to each of the three tables.
-- Inline column CHECKs drop automatically with their columns.
-- App is in active build with fake data only; no backfill required.
-- ============================================================================

ALTER TABLE master_products
  DROP COLUMN IF EXISTS default_quantity_mode,
  DROP COLUMN IF EXISTS default_coverage_amount,
  DROP COLUMN IF EXISTS default_fixed_quantity;

ALTER TABLE master_kit_groups
  DROP COLUMN IF EXISTS default_quantity_mode,
  DROP COLUMN IF EXISTS default_coverage_amount,
  DROP COLUMN IF EXISTS default_fixed_quantity;

ALTER TABLE material_system_items
  DROP COLUMN IF EXISTS quantity_mode,
  DROP COLUMN IF EXISTS coverage_amount,
  DROP COLUMN IF EXISTS fixed_quantity;

-- New basis-unit column on each table. NULL means "no default" (pairs with
-- NULL on the basis amount and the unit). Two-option CHECK keeps the
-- application's contract honest at the DB level.
ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS default_coverage_basis_unit text NULL
    CHECK (default_coverage_basis_unit IS NULL OR default_coverage_basis_unit IN ('sqft', 'lf'));

ALTER TABLE master_kit_groups
  ADD COLUMN IF NOT EXISTS default_coverage_basis_unit text NULL
    CHECK (default_coverage_basis_unit IS NULL OR default_coverage_basis_unit IN ('sqft', 'lf'));

ALTER TABLE material_system_items
  ADD COLUMN IF NOT EXISTS coverage_basis_unit text NULL
    CHECK (coverage_basis_unit IS NULL OR coverage_basis_unit IN ('sqft', 'lf'));
