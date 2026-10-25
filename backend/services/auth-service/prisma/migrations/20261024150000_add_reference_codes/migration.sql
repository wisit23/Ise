-- Additive reference IDs: primary keys, tokens and foreign keys are unchanged.
-- Reservations and the entity insert share the caller's transaction. ON CONFLICT
-- retries without aborting it; deleted entities do not make their codes reusable.
CREATE TABLE "_reference_codes" (
  "code" TEXT PRIMARY KEY,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION reloop_allocate_reference(prefix TEXT) RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  positions CONSTANT INTEGER[] := ARRAY[0,1,2,3,4,5,9,10,11,12,13,14];
  entropy BYTEA;
  body TEXT;
  candidate TEXT;
  claimed TEXT;
  attempt INTEGER;
  i INTEGER;
BEGIN
  FOR attempt IN 1..5 LOOP
    entropy := uuid_send(gen_random_uuid());
    body := '';
    -- Exclude the UUID version/variant bytes. Each selected byte is uniform;
    -- modulo 32 is unbiased because 32 divides 256 exactly (60 random bits).
    FOR i IN 1..12 LOOP
      body := body || substr(alphabet, (get_byte(entropy, positions[i]) % 32) + 1, 1);
    END LOOP;
    candidate := prefix || '-' || substr(body,1,4) || '-' || substr(body,5,4) || '-' || substr(body,9,4);
    claimed := NULL;
    INSERT INTO "_reference_codes" (code) VALUES (candidate)
      ON CONFLICT DO NOTHING RETURNING code INTO claimed;
    IF claimed IS NOT NULL THEN RETURN claimed; END IF;
  END LOOP;
  RAISE EXCEPTION 'Reference code allocation exhausted' USING ERRCODE = 'P0001';
END;
$$;
CREATE FUNCTION reloop_assign_reference() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Ignore externally supplied codes: only this database assigns identity.
    NEW.reference_code := reloop_allocate_reference(TG_ARGV[0]);
  ELSIF OLD.reference_code IS NULL THEN
    NEW.reference_code := reloop_allocate_reference(TG_ARGV[0]);
  ELSIF NEW.reference_code IS DISTINCT FROM OLD.reference_code THEN
    RAISE EXCEPTION 'reference_code is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "users" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "users_reference_code_key" ON "users"("reference_code");
ALTER TABLE "users" ADD CONSTRAINT "users_reference_code_format"
  CHECK (reference_code ~ '^USR-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "users_assign_reference" BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('USR');

ALTER TABLE "kyc_applications" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "kyc_applications_reference_code_key" ON "kyc_applications"("reference_code");
ALTER TABLE "kyc_applications" ADD CONSTRAINT "kyc_applications_reference_code_format"
  CHECK (reference_code ~ '^KYC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "kyc_applications_assign_reference" BEFORE INSERT OR UPDATE ON "kyc_applications"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('KYC');

ALTER TABLE "reports" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "reports_reference_code_key" ON "reports"("reference_code");
ALTER TABLE "reports" ADD CONSTRAINT "reports_reference_code_format"
  CHECK (reference_code ~ '^RPT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "reports_assign_reference" BEFORE INSERT OR UPDATE ON "reports"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('RPT');

ALTER TABLE "shop_change_requests" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "shop_change_requests_reference_code_key" ON "shop_change_requests"("reference_code");
ALTER TABLE "shop_change_requests" ADD CONSTRAINT "shop_change_requests_reference_code_format"
  CHECK (reference_code ~ '^SCR-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "shop_change_requests_assign_reference" BEFORE INSERT OR UPDATE ON "shop_change_requests"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('SCR');

ALTER TABLE "bulk_action_runs" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "bulk_action_runs_reference_code_key" ON "bulk_action_runs"("reference_code");
ALTER TABLE "bulk_action_runs" ADD CONSTRAINT "bulk_action_runs_reference_code_format"
  CHECK (reference_code ~ '^BLK-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "bulk_action_runs_assign_reference" BEFORE INSERT OR UPDATE ON "bulk_action_runs"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('BLK');
