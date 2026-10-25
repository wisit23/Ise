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

ALTER TABLE "basket" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "basket_reference_code_key" ON "basket"("reference_code");
ALTER TABLE "basket" ADD CONSTRAINT "basket_reference_code_format"
  CHECK (reference_code ~ '^BSK-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "basket_assign_reference" BEFORE INSERT OR UPDATE ON "basket"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('BSK');

ALTER TABLE "checkouts" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "checkouts_reference_code_key" ON "checkouts"("reference_code");
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_reference_code_format"
  CHECK (reference_code ~ '^CHK-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "checkouts_assign_reference" BEFORE INSERT OR UPDATE ON "checkouts"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('CHK');

ALTER TABLE "orders" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "orders_reference_code_key" ON "orders"("reference_code");
ALTER TABLE "orders" ADD CONSTRAINT "orders_reference_code_format"
  CHECK (reference_code ~ '^ORD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "orders_assign_reference" BEFORE INSERT OR UPDATE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('ORD');

ALTER TABLE "payment" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "payment_reference_code_key" ON "payment"("reference_code");
ALTER TABLE "payment" ADD CONSTRAINT "payment_reference_code_format"
  CHECK (reference_code ~ '^PAY-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "payment_assign_reference" BEFORE INSERT OR UPDATE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('PAY');

ALTER TABLE "shipping" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "shipping_reference_code_key" ON "shipping"("reference_code");
ALTER TABLE "shipping" ADD CONSTRAINT "shipping_reference_code_format"
  CHECK (reference_code ~ '^SHP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "shipping_assign_reference" BEFORE INSERT OR UPDATE ON "shipping"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('SHP');

ALTER TABLE "hold" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "hold_reference_code_key" ON "hold"("reference_code");
ALTER TABLE "hold" ADD CONSTRAINT "hold_reference_code_format"
  CHECK (reference_code ~ '^HLD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "hold_assign_reference" BEFORE INSERT OR UPDATE ON "hold"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('HLD');

ALTER TABLE "dispute_case" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "dispute_case_reference_code_key" ON "dispute_case"("reference_code");
ALTER TABLE "dispute_case" ADD CONSTRAINT "dispute_case_reference_code_format"
  CHECK (reference_code ~ '^DSP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "dispute_case_assign_reference" BEFORE INSERT OR UPDATE ON "dispute_case"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('DSP');
