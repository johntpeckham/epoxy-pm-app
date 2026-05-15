-- ============================================================================
-- Migration: Phase 2a — Master products description + per-type file paths
-- ============================================================================
-- Pure-addition columns. The Material Management page's "Add Single Product"
-- and "Add Kit" modals will use these so users can attach a Description + PDS
-- + SDS in one submit, alongside the existing master_product_documents table
-- which the post-create Upload Document modal continues to write to.
-- ============================================================================

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS pds_file_path text;

ALTER TABLE master_products
  ADD COLUMN IF NOT EXISTS sds_file_path text;
