-- Backfill estimate_id on existing invoices that were converted from estimates.
-- Matches invoices to estimates by invoice_number = estimate_number::text and same user_id.
UPDATE invoices
SET estimate_id = e.id
FROM estimates e
WHERE invoices.invoice_number = e.estimate_number::text
  AND invoices.user_id = e.user_id
  AND invoices.estimate_id IS NULL;

-- Add index for FK lookups
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON invoices (estimate_id);
