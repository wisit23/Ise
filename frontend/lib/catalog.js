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
