-- Align auth-service with ER_auth.drawio (page QHJz9qzJK7pLv-PV6rBe).
-- This migration also closes historical migration gaps so a fresh database and
-- an existing db-push database converge on the same 16-table design.

-- ---------------------------------------------------------------------------
-- Setup: role + user_roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "role" (
  "role_id" TEXT NOT NULL,
  "role_code" TEXT NOT NULL,
  CONSTRAINT "role_pkey" PRIMARY KEY ("role_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_role_code_key"
ON "role"("role_code");

INSERT INTO "role" ("role_id", "role_code") VALUES
  ('role-buyer', 'BUYER'),
  ('role-seller', 'SELLER'),
  ('role-customer-service', 'CUSTOMER_SERVICE'),
  ('role-admin', 'ADMIN'),
  ('role-trust-and-safety', 'TRUST_AND_SAFETY'),
  ('role-marketing', 'MARKETING'),
  ('role-executive', 'EXECUTIVE')
ON CONFLICT ("role_code") DO NOTHING;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'BUYER';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role_code'
  ) THEN
    ALTER TABLE "user_roles" RENAME COLUMN "role" TO "role_code";
  END IF;
END $$;

ALTER TABLE "user_roles"
  ALTER COLUMN "role_code" TYPE TEXT USING "role_code"::TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_code_fkey') THEN
    ALTER TABLE "user_roles"
      ADD CONSTRAINT "user_roles_role_code_fkey"
      FOREIGN KEY ("role_code") REFERENCES "role"("role_code")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP TYPE IF EXISTS "RoleCode";
DROP TYPE IF EXISTS "Role";

-- ---------------------------------------------------------------------------
-- Master tables
-- ---------------------------------------------------------------------------
ALTER TABLE "buyer_profiles"
  ADD COLUMN IF NOT EXISTS "favorite_category" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'INACTIVE_EXPIRED';

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "id_card_expiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seller_profiles' AND column_name = 'kyc_document_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seller_profiles' AND column_name = 'kyc_storage_key'
  ) THEN
    ALTER TABLE "seller_profiles" RENAME COLUMN "kyc_document_url" TO "kyc_storage_key";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seller_profiles' AND column_name = 'kyc_storage_key'
  ) THEN
    ALTER TABLE "seller_profiles" ADD COLUMN "kyc_storage_key" TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_addresses" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "recipient_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address_line" TEXT NOT NULL,
  "subdistrict" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "postal_code" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_addresses_user_id_idx"
ON "user_addresses"("user_id");
CREATE INDEX IF NOT EXISTS "user_addresses_user_id_is_default_idx"
ON "user_addresses"("user_id", "is_default");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_user_id_fkey') THEN
    ALTER TABLE "user_addresses"
      ADD CONSTRAINT "user_addresses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- KYC transaction table: rename the old document field to the ER fields.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kyc_applications' AND column_name = 'document_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kyc_applications' AND column_name = 'storage_key'
  ) THEN
    ALTER TABLE "kyc_applications" RENAME COLUMN "document_url" TO "storage_key";
  END IF;
END $$;

ALTER TABLE "kyc_applications" ADD COLUMN IF NOT EXISTS "file_type" TEXT;
UPDATE "kyc_applications"
SET "file_type" = 'application/octet-stream'
WHERE "file_type" IS NULL;
ALTER TABLE "kyc_applications" ALTER COLUMN "file_type" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Shop change requests + normalized request items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "shop_change_requests" (
  "requests_id" TEXT NOT NULL,
  "seller_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "admin_note" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comment" TEXT NOT NULL,
  CONSTRAINT "shop_change_requests_pkey" PRIMARY KEY ("requests_id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_change_requests' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_change_requests' AND column_name = 'requests_id'
  ) THEN
    ALTER TABLE "shop_change_requests" RENAME COLUMN "id" TO "requests_id";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "shop_change_request_items" (
  "id" TEXT NOT NULL,
  "requests_id" TEXT NOT NULL,
  "field_name" TEXT NOT NULL,
  "old_value" TEXT,
  "new_value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_change_request_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_change_request_items_requests_id_field_name_key"
ON "shop_change_request_items"("requests_id", "field_name");
CREATE INDEX IF NOT EXISTS "shop_change_request_items_requests_id_idx"
ON "shop_change_request_items"("requests_id");
CREATE INDEX IF NOT EXISTS "shop_change_requests_seller_id_idx"
ON "shop_change_requests"("seller_id");
CREATE INDEX IF NOT EXISTS "shop_change_requests_status_idx"
ON "shop_change_requests"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_change_requests_one_pending_per_seller"
ON "shop_change_requests"("seller_id") WHERE "status" = 'PENDING';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_change_requests' AND column_name = 'shop_name'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "shop_change_request_items"
        ("id", "requests_id", "field_name", "old_value", "new_value", "created_at")
      SELECT r."requests_id" || ':shop_name', r."requests_id", 'shop_name',
             CASE WHEN r."status" = 'PENDING' THEN p."shop_name" ELSE NULL END,
             r."shop_name", r."created_at"
      FROM "shop_change_requests" r
      LEFT JOIN "seller_profiles" p ON p."user_id" = r."seller_id"
      WHERE r."shop_name" IS NOT NULL
      ON CONFLICT ("requests_id", "field_name") DO NOTHING
    $sql$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_change_requests' AND column_name = 'address'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "shop_change_request_items"
        ("id", "requests_id", "field_name", "old_value", "new_value", "created_at")
      SELECT r."requests_id" || ':address', r."requests_id", 'address',
             CASE WHEN r."status" = 'PENDING' THEN p."address" ELSE NULL END,
             r."address", r."created_at"
      FROM "shop_change_requests" r
      LEFT JOIN "seller_profiles" p ON p."user_id" = r."seller_id"
      WHERE r."address" IS NOT NULL
      ON CONFLICT ("requests_id", "field_name") DO NOTHING
    $sql$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_change_requests' AND column_name = 'bank_account'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "shop_change_request_items"
        ("id", "requests_id", "field_name", "old_value", "new_value", "created_at")
      SELECT r."requests_id" || ':bank_account', r."requests_id", 'bank_account',
             CASE WHEN r."status" = 'PENDING' THEN p."bank_account" ELSE NULL END,
             r."bank_account", r."created_at"
      FROM "shop_change_requests" r
      LEFT JOIN "seller_profiles" p ON p."user_id" = r."seller_id"
      WHERE r."bank_account" IS NOT NULL
      ON CONFLICT ("requests_id", "field_name") DO NOTHING
    $sql$;
  END IF;
END $$;

ALTER TABLE "shop_change_requests"
  DROP COLUMN IF EXISTS "shop_name",
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "bank_account";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_change_requests_seller_id_fkey') THEN
    ALTER TABLE "shop_change_requests"
      ADD CONSTRAINT "shop_change_requests_seller_id_fkey"
      FOREIGN KEY ("seller_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_change_request_items_requests_id_fkey') THEN
    ALTER TABLE "shop_change_request_items"
      ADD CONSTRAINT "shop_change_request_items_requests_id_fkey"
      FOREIGN KEY ("requests_id") REFERENCES "shop_change_requests"("requests_id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Executive audit log (present in the ER but absent from old migrations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "executive_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_email" TEXT,
  "actor_role" TEXT,
  "action" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "executive_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "executive_audit_logs_actor_id_idx"
ON "executive_audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "executive_audit_logs_action_idx"
ON "executive_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "executive_audit_logs_category_idx"
ON "executive_audit_logs"("category");
CREATE INDEX IF NOT EXISTS "executive_audit_logs_created_at_idx"
ON "executive_audit_logs"("created_at");

-- Relationships drawn from users to privileged activity tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_audits_actor_id_fkey') THEN
    ALTER TABLE "admin_audits"
      ADD CONSTRAINT "admin_audits_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bulk_action_runs_actor_id_fkey') THEN
    ALTER TABLE "bulk_action_runs"
      ADD CONSTRAINT "bulk_action_runs_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'executive_audit_logs_actor_id_fkey') THEN
    ALTER TABLE "executive_audit_logs"
      ADD CONSTRAINT "executive_audit_logs_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

-- Remove structures from the abandoned operation-table design so both fresh
-- and previously db-pushed databases match the approved ER exactly.
DROP TABLE IF EXISTS "admin_operations";
ALTER TABLE "reports" DROP COLUMN IF EXISTS "version";
UPDATE "bulk_action_runs"
SET "results" = '{"state":"UNKNOWN"}'::JSONB
WHERE "results" IS NULL;
UPDATE "bulk_action_runs"
SET "requested_ids" = ARRAY[]::TEXT[]
WHERE "requested_ids" IS NULL;
ALTER TABLE "bulk_action_runs"
  ALTER COLUMN "results" SET NOT NULL,
  ALTER COLUMN "requested_ids" SET NOT NULL,
  DROP COLUMN IF EXISTS "payload_hash",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "error",
  DROP COLUMN IF EXISTS "updated_at";
