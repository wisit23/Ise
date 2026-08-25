// Thin service-to-service client toward order-service, mirroring
// order-service's own productClient.js. Used only when an auction closes
// with a winning bid, to create the Order that the winner then pays for
// through the normal checkout flow.
const { AppError } = require("@reloop/shared");

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3003";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function createOrderFromAuction({
  auctionId,
  productId,
  productTitle,
  sellerId,
  buyerId,
  price,
}) {
  let res;
  try {
    res = await fetch(`${ORDER_SERVICE_URL}/internal/from-auction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        auctionId,
        productId,
        productTitle,
        sellerId,
        buyerId,
        price,
      }),
    });
  } catch {
    throw new AppError(502, "order-service is unreachable");
  }
  if (!res.ok) throw new AppError(502, "failed to create order from auction");
  return res.json();
}

module.exports = { createOrderFromAuction };
