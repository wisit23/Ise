BEGIN;

-- Physical identifiers follow the ER; Prisma property names remain compatible
-- with existing callers and public DTOs.
ALTER TABLE "hold" RENAME COLUMN "source" TO "hold_type";
ALTER TABLE "dispute_evidence" RENAME COLUMN "status" TO "dispute_status";
ALTER TABLE "dispute_audit_log" RENAME COLUMN "dispute_evidence_id" TO "dispute_id";
ALTER TABLE "dispute_audit_log" RENAME CONSTRAINT "dispute_audit_log_dispute_evidence_id_fkey"
  TO "dispute_audit_log_dispute_id_fkey";
ALTER INDEX "dispute_audit_log_dispute_evidence_id_created_at_idx"
  RENAME TO "dispute_audit_log_dispute_id_created_at_idx";

CREATE TABLE "evidence" (
  "evidence_id" TEXT NOT NULL,
  "dispute_evidence_id" TEXT NOT NULL,
  "ref_path" TEXT NOT NULL,
  CONSTRAINT "evidence_pkey" PRIMARY KEY ("evidence_id"),
  CONSTRAINT "evidence_dispute_evidence_id_fkey"
    FOREIGN KEY ("dispute_evidence_id") REFERENCES "dispute_evidence"("dispute_evidence_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "evidence_dispute_evidence_id_idx" ON "evidence"("dispute_evidence_id");

-- Reuse each record's stable identifier for its migrated file reference. This
-- preserves every path, including empty strings, without fabricating history.
INSERT INTO "evidence" ("evidence_id", "dispute_evidence_id", "ref_path")
SELECT "dispute_evidence_id", "dispute_evidence_id", "evidence_path"
FROM "dispute_evidence";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "dispute_evidence" d
    LEFT JOIN "evidence" e ON e."evidence_id" = d."dispute_evidence_id"
    WHERE e."evidence_id" IS NULL OR e."ref_path" IS DISTINCT FROM d."evidence_path"
  ) THEN
    RAISE EXCEPTION 'Evidence cutover blocked: a legacy path was not preserved';
  END IF;
END $$;
ALTER TABLE "dispute_evidence" DROP COLUMN "evidence_path";

COMMIT;
