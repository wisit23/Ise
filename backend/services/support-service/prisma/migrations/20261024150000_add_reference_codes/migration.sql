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

ALTER TABLE "support_tickets" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "support_tickets_reference_code_key" ON "support_tickets"("reference_code");
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reference_code_format"
  CHECK (reference_code ~ '^TKT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "support_tickets_assign_reference" BEFORE INSERT OR UPDATE ON "support_tickets"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('TKT');

ALTER TABLE "help_articles" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "help_articles_reference_code_key" ON "help_articles"("reference_code");
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_reference_code_format"
  CHECK (reference_code ~ '^HLP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "help_articles_assign_reference" BEFORE INSERT OR UPDATE ON "help_articles"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('HLP');

ALTER TABLE "sla_policies" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "sla_policies_reference_code_key" ON "sla_policies"("reference_code");
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_reference_code_format"
  CHECK (reference_code ~ '^SLA-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "sla_policies_assign_reference" BEFORE INSERT OR UPDATE ON "sla_policies"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('SLA');
