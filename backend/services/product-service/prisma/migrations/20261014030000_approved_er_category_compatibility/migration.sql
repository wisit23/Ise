BEGIN;
-- Legacy direct Product writers (notably the seed) still supply category.
-- Defer until nested Prisma creates finish so the primary link cannot collide.
CREATE FUNCTION products_ensure_primary_category() RETURNS trigger AS $$
DECLARE category_key TEXT; current_name TEXT;
BEGIN
 SELECT category INTO current_name FROM products WHERE id=NEW.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO categories(id,name,created_at) VALUES(gen_random_uuid()::text,current_name,NEW.created_at)
 ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO category_key;
 INSERT INTO product_categories(product_id,category_id) VALUES(NEW.id,category_key) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER products_primary_category_trigger AFTER INSERT ON products
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION products_ensure_primary_category();

-- Install the existing seed-owned search projection for migration-only installs too.
-- This does not introduce a new counting trigger or change search semantics.
CREATE OR REPLACE FUNCTION products_set_search_text() RETURNS trigger AS $$
BEGIN
 NEW.search_text := concat_ws(' ',NEW.title,NEW.description,NEW.category,NEW.brand,NEW.condition,NEW.location,NEW.size,array_to_string(NEW.tags,' '));
 NEW.search_vector :=
  setweight(to_tsvector('simple',coalesce(NEW.title,'')),'A') ||
  setweight(to_tsvector('simple',coalesce(array_to_string(NEW.tags,' '),'')),'A') ||
  setweight(to_tsvector('simple',coalesce(NEW.category,'')),'B') ||
  setweight(to_tsvector('simple',coalesce(NEW.brand,'')),'B') ||
  setweight(to_tsvector('simple',coalesce(NEW.description,'')),'C') ||
  setweight(to_tsvector('simple',concat_ws(' ',NEW.brand,NEW.condition,NEW.location,NEW.size)),'D');
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER products_search_text_trigger BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION products_set_search_text();
UPDATE products SET updated_at=updated_at;
COMMIT;
