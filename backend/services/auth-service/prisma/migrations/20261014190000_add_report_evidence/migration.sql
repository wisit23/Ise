CREATE TABLE "report_evidence" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_evidence_report_id_idx" ON "report_evidence"("report_id");
ALTER TABLE "report_evidence" ADD CONSTRAINT "report_evidence_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
