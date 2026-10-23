ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "auction_bid_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_deadline_at" TIMESTAMP(3);

UPDATE "orders"
SET "payment_deadline_at" = "created_at" + INTERVAL '24 hours'
WHERE "order_type" = 'AUCTION'
  AND "payment_deadline_at" IS NULL
  AND "status" IN ('pending', 'pending_payment');

CREATE INDEX IF NOT EXISTS "orders_order_type_status_payment_deadline_at_idx"
  ON "orders"("order_type", "status", "payment_deadline_at");
