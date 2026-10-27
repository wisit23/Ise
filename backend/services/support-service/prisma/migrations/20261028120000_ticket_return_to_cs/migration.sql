-- Trust & Safety can send an escalated ticket back to CS with a checklist.
ALTER TABLE "support_tickets"
  ADD COLUMN "return_reason" TEXT,
  ADD COLUMN "return_tasks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "returned_by" TEXT,
  ADD COLUMN "returned_at" TIMESTAMPTZ(3);
