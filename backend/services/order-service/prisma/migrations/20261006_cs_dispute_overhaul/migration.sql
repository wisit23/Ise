ALTER TABLE "dispute_cases"
  ADD COLUMN IF NOT EXISTS "verdict_key" TEXT,
  ADD COLUMN IF NOT EXISTS "escalation_note" TEXT,
  ADD COLUMN IF NOT EXISTS "escalated_by" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "priority_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "risk_report_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sla_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "dispute_cases_verdict_key_key"
  ON "dispute_cases"("verdict_key");
