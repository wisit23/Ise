BEGIN;
-- Existing category strings are genuine setup data; retain their exact spelling.
INSERT INTO categories (id, name, created_at)
SELECT gen_random_uuid()::text, p.category, MIN(p.created_at)
FROM products p LEFT JOIN categories c ON c.name = p.category
WHERE c.id IS NULL GROUP BY p.category;

-- Do not invent labels/conditions when legacy data cannot be matched.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM products p LEFT JOIN conditions c ON c.value=p.condition WHERE c.id IS NULL) THEN
  RAISE EXCEPTION 'Product ER migration blocked: unmatched condition values; reconcile with approved setup data before retry';
 END IF;
END $$;
ALTER TABLE products ADD CONSTRAINT products_condition_fkey FOREIGN KEY (condition) REFERENCES conditions(value) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE TABLE product_categories (
 product_id TEXT NOT NULL,
 category_id TEXT NOT NULL,
 CONSTRAINT product_categories_pkey PRIMARY KEY (product_id, category_id),
 CONSTRAINT product_categories_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT product_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO product_categories(product_id,category_id)
SELECT p.id,c.id FROM products p JOIN categories c ON c.name=p.category;
COMMIT;
