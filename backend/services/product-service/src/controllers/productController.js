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

function requireSellerRole(role) {
  if (!["SELLER", "ADMIN"].includes(role)) {
    throw forbidden("only seller accounts can list products for sale");
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

async function create(req, res, next) {
  try {
    requireSellerRole(req.userRole);
    validateCreateRequest(req.body);
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
};
