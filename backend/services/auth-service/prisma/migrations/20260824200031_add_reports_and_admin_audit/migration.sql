-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "action_taken" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- CreateTable
CREATE TABLE "admin_audits" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audits_target_id_idx" ON "admin_audits"("target_id");
