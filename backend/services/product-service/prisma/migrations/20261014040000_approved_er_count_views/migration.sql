BEGIN;
CREATE TABLE count_views (
  viewer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT count_views_pkey PRIMARY KEY (viewer_id, product_id),
  CONSTRAINT count_views_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
);
COMMIT;
