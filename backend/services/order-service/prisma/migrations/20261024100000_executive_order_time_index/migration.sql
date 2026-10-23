-- Executive dashboard: sales, order status, category ranking and first-sale
-- queries all read orders in a created_at window, then narrow by status.
-- Index only; no column or data changes.
CREATE INDEX IF NOT EXISTS "orders_created_at_status_idx" ON "orders" ("created_at", "status");
