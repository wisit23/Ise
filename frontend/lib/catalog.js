// Categories and conditions used to be hardcoded arrays in this file's place
// (frontend/lib/constants.js). They're real data now — product-service owns
// `categories`/`conditions` tables, this just fetches and caches them.
import { apiFetch } from "./api";

let categoriesPromise = null;
let conditionsPromise = null;

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

/** Resolves to { [category]: liveListingCount }.
 *
 * The categories table lists every category ever created, including ones
 * nobody has listed anything under yet — browsing to one of those is a dead
 * end. There is no single endpoint for per-category totals, so this asks the
 * feed for each category's `total` with `limit=1` (cheap: no item payload)
 * and lets the caller filter out the zeros. */
export function fetchCategoryCounts() {
  return fetchCategories().then((categories) =>
    Promise.all(
      categories.map((category) =>
        apiFetch(
          `/api/products/feed?category=${encodeURIComponent(category)}&limit=1`,
        )
          .then((data) => [category, data.total])
          .catch(() => [category, 0]),
      ),
    ).then((pairs) => Object.fromEntries(pairs)),
  );
}
