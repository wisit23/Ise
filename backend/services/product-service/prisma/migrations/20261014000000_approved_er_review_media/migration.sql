BEGIN;

CREATE TYPE "ReviewMediaType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TABLE "review_media" (
  "media_id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "media_type" "ReviewMediaType" NOT NULL,
  "url" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_media_pkey" PRIMARY KEY ("media_id"),
  CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY ("review_id")
    REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "review_media_review_id_idx" ON "review_media"("review_id");

-- Prefix legacy IDs by source to preserve even a photo/video UUID collision.
-- These IDs are internal; the public API still returns {url,type} in position order.
INSERT INTO "review_media" ("media_id", "review_id", "media_type", "url", "position", "created_at")
SELECT 'image:' || "id", "review_id", 'IMAGE'::"ReviewMediaType", "url", "position", "created_at"
FROM "review_photos"
UNION ALL
SELECT 'video:' || "id", "review_id", 'VIDEO'::"ReviewMediaType", "url", "position", "created_at"
FROM "review_videos";

DO $$
BEGIN
  IF (SELECT count(*) FROM "review_media") <>
     (SELECT count(*) FROM "review_photos") + (SELECT count(*) FROM "review_videos")
     OR EXISTS (
       SELECT 1 FROM (
         SELECT 'image:' || "id" AS "media_id", "review_id", "url", "position", "created_at" FROM "review_photos"
         UNION ALL
         SELECT 'video:' || "id", "review_id", "url", "position", "created_at" FROM "review_videos"
       ) legacy
       LEFT JOIN "review_media" current USING ("media_id")
       WHERE current."media_id" IS NULL
         OR ROW(current."review_id", current."url", current."position", current."created_at")
         IS DISTINCT FROM ROW(legacy."review_id", legacy."url", legacy."position", legacy."created_at")
     ) THEN
    RAISE EXCEPTION 'Review media cutover blocked: legacy rows were not preserved';
  END IF;
END $$;
DROP TABLE "review_photos";
DROP TABLE "review_videos";

COMMIT;
