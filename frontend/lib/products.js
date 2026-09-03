// An order row carries `productId` and `productTitle` but no photo, size or
// condition — those live in product-service. The cart and the order list
// both want them, and both render several rows at once, so every lookup is
// memoized per id (same pattern as ./sellers.js and ./catalog.js).
import { apiFetch } from "./api";

const productPromises = new Map();

/** Resolves to the full product, or null if it no longer exists. */
export function fetchProduct(productId) {
  if (!productId) return Promise.resolve(null);
  if (!productPromises.has(productId)) {
    productPromises.set(
      productId,
      apiFetch(`/api/products/${productId}`).catch((err) => {
        // A sold or removed listing is a normal outcome here: the order
        // outlives the product. Callers render a placeholder rather than
        // an error, so this resolves instead of rejecting.
        console.error("โหลดข้อมูลสินค้าไม่สำเร็จ:", err);
        return null;
      }),
    );
  }
  return productPromises.get(productId);
}
