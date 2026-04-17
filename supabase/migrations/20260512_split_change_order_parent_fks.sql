-- Split polymorphic parent_type + parent_id into proper FK columns.
-- Keeps parent_type and parent_id intact for backwards compatibility.

-- 1. Add proper FK columns
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES estimates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS invoice_id  uuid REFERENCES invoices(id)  ON DELETE CASCADE;

-- 2. Backfill from existing data
UPDATE change_orders SET estimate_id = parent_id WHERE parent_type = 'estimate';
UPDATE change_orders SET invoice_id  = parent_id WHERE parent_type = 'invoice';

-- 3. Exactly one of estimate_id or invoice_id must be non-null
ALTER TABLE change_orders
  ADD CONSTRAINT chk_change_order_single_parent
  CHECK (
    (estimate_id IS NOT NULL AND invoice_id IS NULL)
    OR
    (estimate_id IS NULL AND invoice_id IS NOT NULL)
  );

-- 4. Indexes for FK lookups
CREATE INDEX IF NOT EXISTS idx_change_orders_estimate_id ON change_orders (estimate_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_invoice_id  ON change_orders (invoice_id);
