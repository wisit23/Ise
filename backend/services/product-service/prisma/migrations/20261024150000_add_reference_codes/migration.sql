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

ALTER TABLE "products" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "products_reference_code_key" ON "products"("reference_code");
ALTER TABLE "products" ADD CONSTRAINT "products_reference_code_format"
  CHECK (reference_code ~ '^PRD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "products_assign_reference" BEFORE INSERT OR UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('PRD');

ALTER TABLE "product_videos" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "product_videos_reference_code_key" ON "product_videos"("reference_code");
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_reference_code_format"
  CHECK (reference_code ~ '^CLP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "product_videos_assign_reference" BEFORE INSERT OR UPDATE ON "product_videos"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('CLP');

ALTER TABLE "auction_items" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "auction_items_reference_code_key" ON "auction_items"("reference_code");
ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_reference_code_format"
  CHECK (reference_code ~ '^AUC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "auction_items_assign_reference" BEFORE INSERT OR UPDATE ON "auction_items"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('AUC');

ALTER TABLE "auction_rounds" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "auction_rounds_reference_code_key" ON "auction_rounds"("reference_code");
ALTER TABLE "auction_rounds" ADD CONSTRAINT "auction_rounds_reference_code_format"
  CHECK (reference_code ~ '^RND-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "auction_rounds_assign_reference" BEFORE INSERT OR UPDATE ON "auction_rounds"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('RND');

ALTER TABLE "bids" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "bids_reference_code_key" ON "bids"("reference_code");
ALTER TABLE "bids" ADD CONSTRAINT "bids_reference_code_format"
  CHECK (reference_code ~ '^BID-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "bids_assign_reference" BEFORE INSERT OR UPDATE ON "bids"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('BID');

ALTER TABLE "campaigns" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "campaigns_reference_code_key" ON "campaigns"("reference_code");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_reference_code_format"
  CHECK (reference_code ~ '^CMP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "campaigns_assign_reference" BEFORE INSERT OR UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('CMP');

ALTER TABLE "user_vouchers" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "user_vouchers_reference_code_key" ON "user_vouchers"("reference_code");
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_reference_code_format"
  CHECK (reference_code ~ '^VCH-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "user_vouchers_assign_reference" BEFORE INSERT OR UPDATE ON "user_vouchers"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('VCH');

ALTER TABLE "articles" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "articles_reference_code_key" ON "articles"("reference_code");
ALTER TABLE "articles" ADD CONSTRAINT "articles_reference_code_format"
  CHECK (reference_code ~ '^ART-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "articles_assign_reference" BEFORE INSERT OR UPDATE ON "articles"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('ART');

ALTER TABLE "reviews" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "reviews_reference_code_key" ON "reviews"("reference_code");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reference_code_format"
  CHECK (reference_code ~ '^REV-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "reviews_assign_reference" BEFORE INSERT OR UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('REV');
