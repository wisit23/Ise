CREATE TABLE "recommendation_searches" (
  "user_id" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "searched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "query"),
  CONSTRAINT "recommendation_search_query_check" CHECK (length(btrim("query")) BETWEEN 1 AND 200)
);
CREATE INDEX "recommendation_searches_user_id_searched_at_idx"
  ON "recommendation_searches" ("user_id", "searched_at");
