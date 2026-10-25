-- Current state only: preserve historical logs and shipped_at (carrier handoff).
-- Claim a new Order version once even when both fields need mapping.
BEGIN;
UPDATE "orders"
SET "status" = CASE WHEN "status" = 'shipped' THEN 'in_transit' ELSE "status" END,
    "pre_dispute_status" = CASE WHEN "pre_dispute_status" = 'shipped' THEN 'in_transit' ELSE "pre_dispute_status" END,
    "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'shipped' OR "pre_dispute_status" = 'shipped';

UPDATE "shipping" SET "status" = 'in_transit'
WHERE "status" = 'shipped';
COMMIT;
