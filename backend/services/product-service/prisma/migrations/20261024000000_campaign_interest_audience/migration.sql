ALTER TABLE "campaigns"
ADD COLUMN "audience_criteria" JSONB,
ADD COLUMN "audience_snapshot_at" TIMESTAMP(3);

CREATE TABLE "campaign_audience" (
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_audience_pkey" PRIMARY KEY ("campaign_id", "user_id")
);

CREATE INDEX "campaign_audience_campaign_id_score_idx"
ON "campaign_audience"("campaign_id", "score");

CREATE INDEX "campaign_audience_user_id_idx"
ON "campaign_audience"("user_id");

ALTER TABLE "campaign_audience"
ADD CONSTRAINT "campaign_audience_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
