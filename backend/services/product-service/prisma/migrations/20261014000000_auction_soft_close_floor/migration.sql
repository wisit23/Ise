-- Existing end times cannot reliably distinguish manual schedules from soft close.
-- Leave legacy rows NULL rather than inventing an anti-sniping history.
ALTER TABLE "auction_items" ADD COLUMN "soft_close_ends_at" TIMESTAMP(3);
