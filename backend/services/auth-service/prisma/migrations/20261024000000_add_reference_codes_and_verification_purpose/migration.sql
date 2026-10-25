-- CreateEnum
CREATE TYPE "EmailVerificationPurpose" AS ENUM ('SIGNUP', 'EMAIL_CHANGE');

-- DropIndex
DROP INDEX "email_verification_tokens_user_id_created_at_idx";

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "reference_code" TEXT;

-- AlterTable: "email" is added nullable, filled for links issued before this
-- migration (all of them sign-up links to the account's own address), then
-- made NOT NULL.
ALTER TABLE "email_verification_tokens" ADD COLUMN     "email" TEXT,
ADD COLUMN     "purpose" "EmailVerificationPurpose" NOT NULL DEFAULT 'SIGNUP',
ADD COLUMN     "reference_code" TEXT;

UPDATE "email_verification_tokens" AS t
SET "email" = u."email"
FROM "users" AS u
WHERE u."id" = t."user_id" AND t."email" IS NULL;

ALTER TABLE "email_verification_tokens" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_purpose_created_at_idx" ON "email_verification_tokens"("user_id", "purpose", "created_at");
