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
const { parseCatalogFilters } = require("../features/catalog/catalogQuery");

const MIN_MEDIA_COUNT = 4;
const MAX_MEDIA_COUNT = 8;

function requireSellerRole(role) {
  if (!["SELLER", "ADMIN"].includes(role)) {
    throw forbidden("only seller accounts can list products for sale");
  }
}

/** ADMIN can list on a seller's behalf (moderation tooling) without having
 * gone through seller verification themselves. */
function requireVerifiedSeller(role, kycVerified) {
  if (role === "SELLER" && !kycVerified) {
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
    let filters;
    try {
      filters = parseCatalogFilters(req.query);
    } catch (err) {
      throw badRequest(err.message);
    }
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.list({
      ...filters,
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
    let filters;
    try {
      filters = parseCatalogFilters(req.query);
    } catch (err) {
      throw badRequest(err.message);
    }
    const status =
      req.query.status === undefined
        ? undefined
        : String(req.query.status).trim();
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.list({
      ...filters,
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
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function bySeller(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const { items, total } = await productModel.listBySeller(
      req.params.sellerId,
      { status: "available", skip: pagination.skip, take: pagination.take },
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

async function listFilterOptions(req, res, next) {
  try {
    res.json(await productModel.listFilterOptions());
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    requireSellerRole(req.userRole);
    requireVerifiedSeller(req.userRole, req.kycVerified);
    validateCreateRequest(req.body);
    requireValidMediaCount(req.body.media);
    await requireKnownCondition(req.body.condition);
    await productModel.ensureCategory(req.body.category);

    const product = await productModel.create(
      buildCreateProductData(req.userId, req.body),
    );
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

    res.json(
      await productModel.update(req.params.id, buildProductPatch(req.body)),
    );
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
  listFilterOptions,
  create,
  update,
  remove,
  mine,
  markStatusInternal,
};
