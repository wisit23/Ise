-- Buyer login/logout history
ALTER TABLE "login_logs"
  ADD COLUMN "session_id" TEXT,
  ADD COLUMN "logout_at" TIMESTAMP(3),
  ADD COLUMN "user_agent" TEXT;

CREATE UNIQUE INDEX "login_logs_session_id_key" ON "login_logs"("session_id");
CREATE INDEX "login_logs_user_id_login_at_idx" ON "login_logs"("user_id", "login_at");

-- Central append-only activity stream for buyer actions emitted by web and
-- trusted backend services.
CREATE TABLE "buyer_activity_logs" (
  "id" TEXT NOT NULL,
  "buyer_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "metadata" JSONB,
  "request_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "buyer_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buyer_activity_logs_request_id_key" ON "buyer_activity_logs"("request_id");
CREATE INDEX "buyer_activity_logs_buyer_id_occurred_at_idx" ON "buyer_activity_logs"("buyer_id", "occurred_at");
CREATE INDEX "buyer_activity_logs_action_occurred_at_idx" ON "buyer_activity_logs"("action", "occurred_at");
CREATE INDEX "buyer_activity_logs_target_type_target_id_idx" ON "buyer_activity_logs"("target_type", "target_id");

ALTER TABLE "buyer_activity_logs"
  ADD CONSTRAINT "buyer_activity_logs_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
