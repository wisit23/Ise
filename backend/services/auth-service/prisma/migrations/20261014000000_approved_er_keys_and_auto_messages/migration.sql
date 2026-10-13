BEGIN;

-- Retain legacy item identifiers/API responses while making the approved pair
-- the actual primary key. Existing composite uniqueness prevents duplicates.
CREATE UNIQUE INDEX "shop_change_request_items_id_key"
  ON "shop_change_request_items"("id");
ALTER TABLE "shop_change_request_items"
  DROP CONSTRAINT "shop_change_request_items_pkey";
ALTER TABLE "shop_change_request_items"
  ADD CONSTRAINT "shop_change_request_items_pkey"
  PRIMARY KEY ("requests_id", "field_name");
DROP INDEX "shop_change_request_items_requests_id_field_name_key";

CREATE TABLE "auto_messages" (
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "message_text" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "auto_messages_pkey" PRIMARY KEY ("message_id"),
  CONSTRAINT "auto_messages_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "seller_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "auto_messages_user_id_idx" ON "auto_messages"("user_id");

COMMIT;
