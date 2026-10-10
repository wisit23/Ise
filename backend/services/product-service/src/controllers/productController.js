const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const productModel = require("../models/productModel");
const auctionRepository = require("../features/auctions/auctionRepository");
const {
  buildCreateProductData,
  buildProductPatch,
} = require("./productPayload");
const { parseCatalogFilters } = require("../features/catalog/catalogQuery");
const sellerActivityClient = require("../services/sellerActivityClient");
const {
  requireSellerRole,
  requireVerifiedSeller,
  validateCreateRequest,
  requireValidMediaCount,
  requireKnownCondition,
} = require("../services/productValidation");

async function requireProductOwner(productId, sellerId, action, tx) {
  const product = await productModel.findById(productId, tx);
  if (!product) throw notFound("product not found");
  if (product.sellerId !== sellerId) {
    throw forbidden(`only the seller can ${action} this listing`);
  }
  return product;
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
    const allowedStatuses = isOwner
      ? ["available", "hidden", "sold"]
      : ["available", "sold"];
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
    const product = await requireProductOwner(
      req.params.id,
      req.userId,
      "edit",
    );
    if (product.status === "auction") {
      throw forbidden("cannot edit a product that is currently in an auction");
    }
    await requireKnownCondition(req.body.condition);
    if (req.body.media !== undefined) requireValidMediaCount(req.body.media);
    if (req.body.category !== undefined) {
      await productModel.ensureCategory(req.body.category);
    }

    const updated = await productModel.update(
      req.params.id,
      buildProductPatch(req.body),
    );
    // Fire-and-forget: refreshes lastActiveAt so the inactivity job doesn't
    // flag an active seller who edits rather than creates listings.
    sellerActivityClient.recordActivity(req.userId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const product = await requireProductOwner(
      req.params.id,
      req.userId,
      "remove",
    );
    if (product.status === "auction") {
      throw forbidden(
        "cannot remove a product that is currently in an auction",
      );
    }
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
      status: req.query.status,
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

async function relistAvailable(req, res, next) {
  try {
    const productId = req.params.id;
    const price = Number(req.body.price);
    if (!Number.isInteger(price) || price <= 0) {
      throw badRequest("ราคาขายใหม่ต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
    }
    const lockFn = auctionRepository.withProductLock
      ? (fn) => auctionRepository.withProductLock(productId, fn)
      : (fn) => fn(null);
    const updated = await lockFn(async (tx) => {
      const product = await requireProductOwner(
        productId,
        req.userId,
        "relist",
        tx,
      );
      if (product.status !== "auction_action_required") {
        throw badRequest(
          "เฉพาะสินค้าที่รอการดำเนินการหลังประมูลเท่านั้นที่สามารถนำกลับมาขายปกติได้",
        );
      }
      const activeAuction =
        await auctionRepository.findActiveAuctionByProductId(productId, tx);
      if (activeAuction) {
        throw badRequest(
          "สินค้านี้กำลังอยู่ในรายการประมูลที่ยังดำเนินการอยู่ ไม่สามารถนำกลับมาขายปกติได้",
        );
      }
      return productModel.update(
        productId,
        {
          price,
          status: "available",
        },
        tx,
      );
    });
    sellerActivityClient.recordActivity(req.userId);
    res.json(updated);
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
  toggleVisibility,
  relistAvailable,
  requireSellerRole,
  requireVerifiedSeller,
  validateCreateRequest,
  requireValidMediaCount,
  requireKnownCondition,
};
