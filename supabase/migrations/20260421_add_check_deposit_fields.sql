-- ============================================================================
-- Add invoice_number and check_number to check_deposits
-- Run this SQL in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE check_deposits ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE check_deposits ADD COLUMN IF NOT EXISTS check_number text;
