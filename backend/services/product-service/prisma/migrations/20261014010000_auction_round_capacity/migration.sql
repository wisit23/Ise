ALTER TABLE "auction_rounds" ADD COLUMN "max_items" INTEGER;
ALTER TABLE "auction_rounds" ADD CONSTRAINT "auction_rounds_max_items_positive"
  CHECK ("max_items" IS NULL OR "max_items" > 0);
