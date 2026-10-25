-- Rename only the Order vocabulary. Checkout, Shipping and Payment each have
-- their own pending state and must not be changed. Keep historical logs intact.
UPDATE "orders"
SET "status" = CASE
      WHEN "status" = 'pending' THEN 'inbasket'
      ELSE "status"
    END,
    "pre_dispute_status" = CASE
      WHEN "pre_dispute_status" = 'pending' THEN 'inbasket'
      ELSE "pre_dispute_status"
    END,
    "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'pending' OR "pre_dispute_status" = 'pending';
