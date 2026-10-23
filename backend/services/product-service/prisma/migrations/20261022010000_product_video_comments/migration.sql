-- CreateTable
CREATE TABLE "product_video_comments" (
    "id" TEXT NOT NULL,
    "product_video_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_video_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_video_comments_product_video_id_created_at_idx" ON "product_video_comments"("product_video_id", "created_at");

-- CreateIndex
CREATE INDEX "product_video_comments_user_id_idx" ON "product_video_comments"("user_id");

-- AddForeignKey
ALTER TABLE "product_video_comments" ADD CONSTRAINT "product_video_comments_product_video_id_fkey" FOREIGN KEY ("product_video_id") REFERENCES "product_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

