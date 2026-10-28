CREATE TABLE "recommendation_views" (
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('product', 'video')),
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_views_pkey" PRIMARY KEY ("user_id", "product_id", "source"),
  CONSTRAINT "recommendation_views_product_id_fkey" FOREIGN KEY ("product_id")
    REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "recommendation_views_user_id_source_viewed_at_idx"
  ON "recommendation_views"("user_id", "source", "viewed_at");
