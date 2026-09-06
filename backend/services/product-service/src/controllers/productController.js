const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const productModel = require("../models/productModel");
const {
  buildCreateProductData,
  buildProductPatch,
} = require("./productPayload");
const sellerActivityClient = require("../services/sellerActivityClient");

const MIN_MEDIA_COUNT = 4;
const MAX_MEDIA_COUNT = 8;

function requireSellerRole(role) {
  if (!["SELLER", "ADMIN"].includes(role)) {
    throw forbidden("only seller accounts can list products for sale");
  }
}

/** ADMIN can list on a seller's behalf (moderation tooling) without having
 * gone through seller verification themselves. */
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

function validateCreateRequest({ title, price, category }) {
  if (!title || !price || !category) {
    throw badRequest("title, price, category are required");
  }
  if (!Number.isInteger(price) || price <= 0) {
    throw badRequest("price must be a positive whole number");
  }
}

/** Standardizes listing quality: at least a handful of angles, capped so the
 * gallery stays scannable. Client-side MediaUploader enforces the same
 * bounds; this is the authoritative check. */
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

async function requireProductOwner(productId, sellerId, action) {
  const product = await productModel.findById(productId);
  if (!product) throw notFound("product not found");
  if (product.sellerId !== sellerId) {
    throw forbidden(`only the seller can ${action} this listing`);
  }
}

async function feed(req, res, next) {
  try {
    const { category } = req.query;
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.list({
      category,
      status: "available",
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function search(req, res, next) {
  try {
    const { q, category } = req.query;
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.list({
      q,
      category,
      status: "available",
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

// Unlike search() above (locked to status="available" for public browsing),
// Admin needs to find a listing in ANY status — including "removed" ones, to
// restore them — so status is optional and passed through as-is.
async function adminSearch(req, res, next) {
  try {
    if (req.userRole !== "ADMIN") {
      throw forbidden("only admin accounts can use this search");
    }
    const { q, category, status } = req.query;
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.list({
      q,
      category,
      status,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) throw notFound("product not found");
    // Hidden products are invisible to buyers; the owner and admins can still
    // load them (so the edit page works) but the status is exposed so the
    // frontend can show a "currently hidden" badge.
    if (product.status === "hidden") {
      const requesterId = req.userId; // set by requireAuth; undefined for guests
      if (requesterId !== product.sellerId && req.userRole !== "ADMIN") {
        throw notFound("product not found");
      }
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function toggleVisibility(req, res, next) {
  try {
    await requireProductOwner(req.params.id, req.userId, "hide/show");
    const { visible } = req.body;
    if (typeof visible !== "boolean") {
      throw badRequest("visible (boolean) is required");
    }
    const product = await productModel.setVisibility(req.params.id, visible);
    if (!product) throw notFound("product not found");
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function bySeller(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    // If the requester is the owner of the store, show them their hidden products too.
    const isOwner = req.userId && req.userId === req.params.sellerId;
    console.log(`[bySeller] sellerId=${req.params.sellerId}, req.userId=${req.userId}, isOwner=${isOwner}`);
    const allowedStatuses = isOwner ? ["available", "hidden"] : "available";
    const { items, total } = await productModel.listBySeller(
      req.params.sellerId,
      { status: allowedStatuses, skip: pagination.skip, take: pagination.take },
    );
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const categories = await productModel.listCategories();
    res.json({ items: categories.map((c) => c.name) });
  } catch (err) {
    next(err);
  }
}

async function listConditions(req, res, next) {
  try {
    const conditions = await productModel.listConditions();
    res.json({
      items: conditions.map((c) => ({ value: c.value, label: c.label })),
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    requireSellerRole(req.userRole);
    requireVerifiedSeller(req.userRole, req.kycVerified, req.kycStatus);
    validateCreateRequest(req.body);
    requireValidMediaCount(req.body.media);
    await requireKnownCondition(req.body.condition);
    await productModel.ensureCategory(req.body.category);

    const product = await productModel.create(
      buildCreateProductData(req.userId, req.body),
    );
    // Fire-and-forget: update lastActiveAt on the seller's profile so the
    // daily inactivity job doesn't flag them if they've just listed something.
    sellerActivityClient.recordActivity(req.userId);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    await requireProductOwner(req.params.id, req.userId, "edit");
    await requireKnownCondition(req.body.condition);
    if (req.body.media !== undefined) requireValidMediaCount(req.body.media);
    if (req.body.category !== undefined) {
      await productModel.ensureCategory(req.body.category);
    }

    const product = await productModel.update(
      req.params.id,
      buildProductPatch(req.body),
    );
    // Fire-and-forget: refreshes lastActiveAt so the inactivity job doesn't
    // flag an active seller who edits rather than creates listings.
    sellerActivityClient.recordActivity(req.userId);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await requireProductOwner(req.params.id, req.userId, "remove");
    await productModel.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.listBySeller(req.userId, {
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

/** Called by order-service with its internal token when an order changes the
 * listing lifecycle. This is intentionally separate from the seller-facing
 * PATCH /:id route, whose ownership checks must not apply to service calls. */
async function markStatusInternal(req, res, next) {
  try {
    const { status } = req.body;
    if (!["available", "reserved", "sold"].includes(status)) {
      throw badRequest("status must be one of available, reserved, sold");
    }
    const product = await productModel.update(req.params.id, { status });
    if (!product) throw notFound("product not found");
    res.json(product);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  feed,
  search,
  adminSearch,
  getOne,
  bySeller,
  listCategories,
  listConditions,
  create,
  update,
  remove,
  mine,
  markStatusInternal,
  toggleVisibility,
};
