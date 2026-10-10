-- Additive rollout: existing disputes retain their original priority and deadline.
ALTER TABLE "dispute_cases"
  ADD COLUMN IF NOT EXISTS "sla_policy_version" TEXT,
  ADD COLUMN IF NOT EXISTS "first_review_due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "first_reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decision_due_at" TIMESTAMP(3);
