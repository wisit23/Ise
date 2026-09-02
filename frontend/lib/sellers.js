// A product card needs to show who is selling it (shop name, verified badge,
// rating) but the feed endpoint only returns `sellerId` — that data lives in
// two other services. A grid of 12+ cards would otherwise fire 24+ requests
// for the same handful of sellers, so every fetch here is memoized per id
// (same pattern as fetchCategories()/fetchConditions() in ./catalog.js).
import { apiFetch } from "./api";

const summaryPromises = new Map();
const ratingPromises = new Map();

/** Resolves to { shopName, firstName, lastName, kycStatus } for one seller. */
export function fetchSellerSummary(sellerId) {
  if (!sellerId) return Promise.resolve(null);
  if (!summaryPromises.has(sellerId)) {
    summaryPromises.set(
      sellerId,
      apiFetch(`/api/auth/users/${sellerId}/public`).catch((err) => {
        summaryPromises.delete(sellerId);
        throw err;
      }),
    );
  }
  return summaryPromises.get(sellerId);
}

/** Resolves to { total, averageRating } for one seller. */
export function fetchSellerRating(sellerId) {
  if (!sellerId) return Promise.resolve({ total: 0, averageRating: 0 });
  if (!ratingPromises.has(sellerId)) {
    ratingPromises.set(
      sellerId,
      apiFetch(`/api/reviews/by-seller/${sellerId}/summary`).catch((err) => {
        ratingPromises.delete(sellerId);
        throw err;
      }),
    );
  }
  return ratingPromises.get(sellerId);
}
