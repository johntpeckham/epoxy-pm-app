-- ============================================================================
-- Material Inventory Management — Phase 3
-- Wire Stock Check Requests to the existing office_tasks system.
--
-- When a user requests a stock check for an inventory product, the UI creates
-- an office_task assigned to a selected user. We link the two so that when the
-- task is marked complete, inventory_products.stock_check_date is auto-updated
-- and the link is cleared, allowing a new request to be made.
--
-- A separate request can only exist per product if stock_check_task_id IS NULL.
-- This prevents duplicate pending requests.
-- ============================================================================

-- 1. Add the link column on inventory_products pointing at the pending task.
--    ON DELETE SET NULL so if the task is deleted from My Work / Office Tasks,
--    the product automatically returns to the "no pending request" state.
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS stock_check_task_id uuid
  REFERENCES office_tasks(id) ON DELETE SET NULL;

-- Index to make the reverse lookup during task completion fast.
CREATE INDEX IF NOT EXISTS idx_inventory_products_stock_check_task_id
  ON inventory_products(stock_check_task_id);
