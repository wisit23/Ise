// Thin service-to-service client toward product-service. Kept isolated so the
// mock in-memory version and a future real one behave identically to callers.
const { AppError } = require("@reloop/shared");

const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function reservationRequest(path, { method, buyerId }) {
  let res;
  try {
    res = await fetch(`${PRODUCT_SERVICE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ buyerId }),
    });
  } catch {
    throw new AppError(503, "product-service is unreachable");
  }

  if (res.status === 404) throw new AppError(404, "product not found");
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new AppError(409, body.error || "product is already reserved");
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new AppError(400, body.error || "invalid reservation request");
  }
  if (!res.ok) throw new AppError(503, "product-service returned an error");
  return res.status === 204 ? null : res.json();
}

function reserveProduct(productId, buyerId) {
  return reservationRequest(`/${productId}/reservations`, {
    method: "POST",
    buyerId,
  });
}

function releaseReservation(productId, reservationId, buyerId) {
  return reservationRequest(`/${productId}/reservations/${reservationId}`, {
    method: "DELETE",
    buyerId,
  });
}

function confirmReservation(productId, reservationId, buyerId) {
  return reservationRequest(
    `/${productId}/reservations/${reservationId}/confirm`,
    { method: "POST", buyerId },
  );
}

module.exports = {
  reserveProduct,
  releaseReservation,
  confirmReservation,
};
