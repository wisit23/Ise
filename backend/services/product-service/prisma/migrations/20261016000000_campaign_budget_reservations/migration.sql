-- Reserve campaign budget while an order is waiting for payment. Existing rows
-- start at zero so historical spend is preserved without being rewritten.
ALTER TABLE "campaigns"
ADD COLUMN "reserved_budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "ended_at" TIMESTAMP(3),
ADD COLUMN "end_reason" TEXT;

ALTER TABLE "user_vouchers"
ADD COLUMN "reserved_discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
