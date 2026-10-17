CREATE TABLE "article_views" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "user_id" TEXT,
    "guest_session_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counted_at" TIMESTAMP(3),

    CONSTRAINT "article_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "article_views_reader_check" CHECK (
        ("user_id" IS NOT NULL AND "guest_session_id" IS NULL)
        OR ("user_id" IS NULL AND "guest_session_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "article_views_article_id_user_id_key"
ON "article_views"("article_id", "user_id");

CREATE UNIQUE INDEX "article_views_article_id_guest_session_id_key"
ON "article_views"("article_id", "guest_session_id");

CREATE INDEX "article_views_article_id_counted_at_idx"
ON "article_views"("article_id", "counted_at");

ALTER TABLE "article_views"
ADD CONSTRAINT "article_views_article_id_fkey"
FOREIGN KEY ("article_id") REFERENCES "articles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
