const { badRequest, forbidden, notFound } = require("@reloop/shared");
const productVideoRepository = require("./productVideoRepository");

const UPLOAD_ROLES = new Set(["SELLER", "ADMIN"]);

function requiredText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalText(value, fieldName) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string`);
  }
  return value.trim();
}

function listFeed({ skip, take }) {
  return productVideoRepository.listAvailable({ skip, take });
}

/**
 * Creates one feed clip for a product owned by the authenticated user.
 * sellerName intentionally comes from the verified access token, never from
 * req.body, so a client cannot publish a clip under another seller's name.
 */
async function createClip({ user, input = {} }) {
  if (!UPLOAD_ROLES.has(user.role)) {
    throw forbidden("only seller accounts can upload video reviews");
  }

  const videoUrl = requiredText(input.videoUrl, "videoUrl");
  const productId = requiredText(input.productId, "productId");
  const description = optionalText(input.description, "description");

  const product = await productVideoRepository.findProductOwner(productId);
  if (!product) throw notFound("product not found");
  if (product.sellerId !== user.id) {
    throw forbidden("you can only attach video clips to your own products");
  }

  return productVideoRepository.create({
    videoUrl,
    description,
    sellerId: user.id,
    sellerName: user.displayName || null,
    productId,
  });
}

module.exports = {
  listFeed,
  createClip,
};
