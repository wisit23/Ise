-- Preserve seller data and historical relations when deleted.
ALTER TABLE "products" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "photos" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "videos" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "product_categories" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "product_videos" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "product_favorites" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "swipe_choices" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "products_seller_id_deleted_at_idx" ON "products"("seller_id", "deleted_at");
