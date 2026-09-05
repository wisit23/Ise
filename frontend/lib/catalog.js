// Categories and conditions used to be hardcoded arrays in this file's place
// (frontend/lib/constants.js). They're real data now — product-service owns
// `categories`/`conditions` tables, this just fetches and caches them.
import { apiFetch } from "./api";

let categoriesPromise = null;
let conditionsPromise = null;
let activeCategoriesPromise = null;

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

/** Resolves to `{ name, count }[]` — only categories that actually have
 * something listed, busiest first.
 *
 * The categories table lists every category ever created, including ones
 * nobody has listed anything under yet, and browsing to one of those is a
 * dead end. There is no endpoint for per-category totals, so this asks the
 * feed for each category with `limit=1`: cheap, and the response carries the
 * `total` this needs. */
export function fetchActiveCategories() {
  if (!activeCategoriesPromise) {
    activeCategoriesPromise = fetchCategories()
      .then((categories) =>
        Promise.all(
          categories.map((name) =>
            apiFetch(
              `/api/products/feed?category=${encodeURIComponent(name)}&limit=1`,
            )
              .then((data) => ({ name, count: data.total }))
              .catch(() => ({ name, count: 0 })),
          ),
        ),
      )
      .then((rows) =>
        rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
      )
      .catch((err) => {
        activeCategoriesPromise = null;
        throw err;
      });
  }
  return activeCategoriesPromise;
}
