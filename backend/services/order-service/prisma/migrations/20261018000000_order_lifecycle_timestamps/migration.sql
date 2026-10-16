-- Order lifecycle: paid -> confirmed -> ready_to_ship -> shipped -> delivered -> completed.
-- The timestamps drive the automatic delivery/completion sweeps and the dispute window.
ALTER TABLE "orders" ADD COLUMN "shipped_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "completed_at" TIMESTAMP(3);

-- Backfill from the order log, which records every shipment and status change.
UPDATE "orders" o SET "shipped_at" = l.at
FROM (
  SELECT order_id, MIN(created_at) AS at FROM order_log
  WHERE action = 'SHIPPED'
     OR (action = 'STATUS_CHANGED' AND detail LIKE '%"to":"shipped"%')
  GROUP BY order_id
) l
WHERE o.order_id = l.order_id;

UPDATE "orders" o SET "completed_at" = l.at
FROM (
  SELECT order_id, MIN(created_at) AS at FROM order_log
  WHERE action = 'STATUS_CHANGED' AND detail LIKE '%"to":"completed"%'
  GROUP BY order_id
) l
WHERE o.order_id = l.order_id;

-- Legacy orders had no delivered step; the closest known receipt time is completion.
UPDATE "orders" SET "delivered_at" = "completed_at"
WHERE "delivered_at" IS NULL AND "completed_at" IS NOT NULL;

-- Orders completed before logging existed still need a completion time.
UPDATE "orders" SET "completed_at" = "updated_at", "delivered_at" = COALESCE("delivered_at", "updated_at")
WHERE "completed_at" IS NULL
  AND ("status" = 'completed' OR ("status" IN ('disputed', 'refunded') AND "pre_dispute_status" = 'completed'));

UPDATE "orders" SET "shipped_at" = "updated_at"
WHERE "shipped_at" IS NULL AND "status" = 'shipped';

CREATE INDEX "orders_status_shipped_at_idx" ON "orders"("status", "shipped_at");
CREATE INDEX "orders_status_delivered_at_idx" ON "orders"("status", "delivered_at");
