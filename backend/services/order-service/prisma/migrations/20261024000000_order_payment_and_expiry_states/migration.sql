-- Forward-only vocabulary change. Never infer why historical orders were
-- cancelled; expiry statuses apply only to new automatic transitions.
-- Basket, Product, Checkout, Shipping, Payment and audit history are unchanged.
UPDATE "orders"
SET "status" = CASE
      WHEN "status" = 'inbasket' THEN 'pending_payment'
      ELSE "status"
    END,
    "pre_dispute_status" = CASE
      WHEN "pre_dispute_status" = 'inbasket' THEN 'pending_payment'
      ELSE "pre_dispute_status"
    END,
    "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'inbasket' OR "pre_dispute_status" = 'inbasket';
