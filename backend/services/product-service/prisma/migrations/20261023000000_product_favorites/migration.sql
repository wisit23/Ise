CREATE TABLE "product_favorites" (
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_favorites_pkey" PRIMARY KEY ("user_id", "product_id"),
  CONSTRAINT "product_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "product_favorites_product_id_idx" ON "product_favorites"("product_id");
CREATE INDEX "product_favorites_user_id_created_at_idx" ON "product_favorites"("user_id", "created_at");
