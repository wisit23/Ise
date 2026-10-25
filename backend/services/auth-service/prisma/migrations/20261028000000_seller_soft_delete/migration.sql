-- Preserve seller data and historical relations when deleted.
ALTER TABLE "user_addresses" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "auto_messages" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "user_addresses_user_id_deleted_at_idx" ON "user_addresses"("user_id", "deleted_at");
