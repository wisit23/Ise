DROP INDEX IF EXISTS "orders_auction_id_key";

CREATE UNIQUE INDEX "orders_auction_id_auction_bid_id_key"
ON "orders"("auction_id", "auction_bid_id");

CREATE INDEX "orders_auction_id_created_at_idx"
ON "orders"("auction_id", "created_at");
