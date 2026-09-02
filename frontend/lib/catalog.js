// Categories and conditions used to be hardcoded arrays in this file's place
// (frontend/lib/constants.js). They're real data now — product-service owns
// `categories`/`conditions` tables, this just fetches and caches them.
import { apiFetch } from "./api";

let categoriesPromise = null;
let conditionsPromise = null;
let categoryPreviewsPromise = null;

/** Resolves to string[] of category names. */
export function fetchCategories() {
  if (!categoriesPromise) {
    categoriesPromise = apiFetch("/api/products/categories")
      .then((data) => data.items)
      .catch((err) => {
        categoriesPromise = null;
        throw err;
      });
  }
  return categoriesPromise;
}

/** Resolves to { value, label }[]. */
export function fetchConditions() {
  if (!conditionsPromise) {
    conditionsPromise = apiFetch("/api/products/conditions")
      .then((data) => data.items)
      .catch((err) => {
        conditionsPromise = null;
        throw err;
      });
  }
  return conditionsPromise;
}

/** Resolves to `{ name, count, coverUrl }[]`, busiest category first, with
 * empty ones dropped.
 *
 * The categories table lists every category ever created, including ones
 * nobody has listed anything under yet — browsing to one of those is a dead
 * end. There is no endpoint for per-category totals, so this asks the feed
 * for each category with `limit=1`: the response carries both the `total`
 * and the newest listing, whose photo becomes the tile's cover. Real
 * merchandise as the category art, at no extra request. */
export function fetchCategoryPreviews() {
  if (!categoryPreviewsPromise) {
    categoryPreviewsPromise = fetchCategories()
      .then((categories) =>
        Promise.all(
          categories.map((name) =>
            apiFetch(
              `/api/products/feed?category=${encodeURIComponent(name)}&limit=1`,
            )
              .then((data) => ({
                name,
                count: data.total,
                coverUrl: data.items?.[0]?.media?.[0]?.url || null,
              }))
              .catch(() => ({ name, count: 0, coverUrl: null })),
          ),
        ),
      )
      .then((rows) =>
        rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
      )
      .catch((err) => {
        categoryPreviewsPromise = null;
        throw err;
      });
  }
  return categoryPreviewsPromise;
}
