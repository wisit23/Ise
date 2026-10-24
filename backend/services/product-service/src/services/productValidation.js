const { badRequest, forbidden } = require("@reloop/shared");
const productModel = require("../models/productModel");

const MIN_MEDIA_COUNT = 4;
const MAX_MEDIA_COUNT = 8;
const MAX_DATABASE_PRICE = 2147483647;

function requireSellerRole(role) {
  if (!["SELLER", "ADMIN"].includes(role)) {
    throw forbidden("only seller accounts can list products for sale");
  }
}

/**
 * ADMIN can list on a seller's behalf (moderation tooling) without having
 * gone through seller verification themselves.
 */
function requireVerifiedSeller(role, kycVerified, kycStatus) {
  if (role !== "SELLER") return;

  if (kycStatus === "EXPIRED") {
    throw forbidden(
      "your ID card has expired — please re-submit seller verification before listing",
    );
  }
  if (kycStatus === "INACTIVE_EXPIRED") {
    throw forbidden(
      "your seller account has been inactive for over 1 year — please re-submit seller verification before listing",
    );
  }
  if (!kycVerified) {
    throw forbidden(
      "seller account must complete identity verification before listing products",
    );
  }
}

function validatePrice(price) {
  if (
    typeof price !== "number" ||
    !Number.isInteger(price) ||
    price <= 0 ||
    price > MAX_DATABASE_PRICE
  ) {
    throw badRequest(
      "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
    );
  }
  return price;
}

function validateCreateRequest({ title, price, category }) {
  if (!title || price === undefined || price === null || !category) {
    throw badRequest("title, price, category are required");
  }
  validatePrice(price);
}

/**
 * Standardizes listing quality: at least a handful of angles, capped so the
 * gallery stays scannable. Client-side MediaUploader enforces the same
 * bounds; this is the authoritative check.
 */
function requireValidMediaCount(media) {
  const count = Array.isArray(media) ? media.length : 0;
  if (count < MIN_MEDIA_COUNT || count > MAX_MEDIA_COUNT) {
    throw badRequest(
      `media must include between ${MIN_MEDIA_COUNT} and ${MAX_MEDIA_COUNT} photos/videos (got ${count})`,
    );
  }
}

async function requireKnownCondition(value) {
  if (value === undefined) return;

  const conditions = await productModel.listConditions();
  if (!conditions.some((condition) => condition.value === value)) {
    throw badRequest("condition is not a recognized value");
  }
}

module.exports = {
  MIN_MEDIA_COUNT,
  MAX_MEDIA_COUNT,
  MAX_DATABASE_PRICE,
  requireSellerRole,
  requireVerifiedSeller,
  validateCreateRequest,
  validatePrice,
  requireValidPrice: validatePrice,
  requireValidMediaCount,
  requireKnownCondition,
};
