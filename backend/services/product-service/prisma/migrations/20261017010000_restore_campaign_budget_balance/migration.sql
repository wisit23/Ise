BEGIN;

-- Campaign budget reservation and payment completion update this balance
-- atomically. Rebuild it from immutable attribution facts for existing data.
ALTER TABLE "campaigns"
ADD COLUMN IF NOT EXISTS "spent_budget" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "campaigns" AS campaign
SET "spent_budget" = COALESCE(attribution."spent", 0)
FROM (
  SELECT "campaign_id", SUM("discount_amount") AS "spent"
  FROM "campaign_attributions"
  GROUP BY "campaign_id"
) AS attribution
WHERE attribution."campaign_id" = campaign."id";

COMMIT;
