-- Remediate any remaining legacy invalid product prices before applying positive price check constraint
UPDATE "products"
SET "price" = 1
WHERE "price" <= 0;

-- Add check constraint enforcing price > 0
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_price_positive'
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("price" > 0);
  END IF;
END $$;
