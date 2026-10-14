BEGIN;

-- One row per selection. Category names are logical references to Product Service.
CREATE TABLE "buyer_preferences" (
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL,
    CONSTRAINT "buyer_preferences_pkey" PRIMARY KEY ("user_id", "kind", "category", "value"),
    CONSTRAINT "buyer_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "buyer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "buyer_preferences_kind_check" CHECK ("kind" IN ('CATEGORY', 'STYLE', 'BRAND', 'SIZE')),
    CONSTRAINT "buyer_preferences_category_check" CHECK ("kind" = 'SIZE' OR "category" = ''),
    CONSTRAINT "buyer_preferences_value_check" CHECK (length(btrim("value")) > 0)
);

-- Keep the old columns intact for historical readers. Never split a saved name
-- on commas: it may be a legitimate category or brand name.
INSERT INTO "buyer_preferences" ("user_id", "kind", "category", "value")
SELECT p."user_id", selection."kind", '', btrim(selection."value")
FROM "buyer_profiles" p
CROSS JOIN LATERAL (VALUES
    ('CATEGORY', p."favorite_category"),
    ('STYLE', p."style_preference"),
    ('BRAND', p."brand_preference"),
    ('SIZE', p."size_preference")
) AS selection("kind", "value")
WHERE selection."value" IS NOT NULL AND length(btrim(selection."value")) > 0;
-- Old size selections were not category-scoped. Preserve them as unassigned,
-- even when favorite_category exists; guessing could associate a shoe size with clothing.

COMMIT;
