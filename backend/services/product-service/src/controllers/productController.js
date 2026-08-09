const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const productModel = require("../models/productModel");

function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];
  return media
    .filter((m) => m && typeof m.url === "string" && m.url)
    .map((m) => ({
      url: m.url,
      type: m.type === "video" ? "video" : "image",
    }));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .filter((t) => typeof t === "string" && t.trim())
        .map((t) => t.trim().toLowerCase()),
    ),
  ].slice(0, 20);
}

async function isValidCondition(value) {
  const conditions = await productModel.listConditions();
  return conditions.some((c) => c.value === value);
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
    if (!["SELLER", "ADMIN"].includes(req.userRole)) {
      throw forbidden("only seller accounts can list products for sale");
    }

    const {
      title,
      description,
      price,
      category,
      condition,
      size,
      tags,
      media,
      location,
    } = req.body;
    if (!title || !price || !category) {
      throw badRequest("title, price, category are required");
    }
    if (!Number.isInteger(price) || price <= 0) {
      throw badRequest("price must be a positive whole number");
    }
    if (condition !== undefined && !(await isValidCondition(condition))) {
      throw badRequest("condition is not a recognized value");
    }

    await productModel.ensureCategory(category);

    const product = await productModel.create({
      sellerId: req.userId,
      title,
      description: description || "",
      price,
      category,
      condition: condition || "Good",
      size: size || "Free size",
      tags: normalizeTags(tags),
      media: normalizeMedia(media),
      location: location || "",
    });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) throw notFound("product not found");
    if (product.sellerId !== req.userId) {
      throw forbidden("only the seller can edit this listing");
    }

    const {
      title,
      description,
      price,
      category,
      condition,
      size,
      tags,
      media,
      location,
      status,
    } = req.body;
    if (condition !== undefined && !(await isValidCondition(condition))) {
      throw badRequest("condition is not a recognized value");
    }
    if (category !== undefined) await productModel.ensureCategory(category);

    const patch = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (price !== undefined) patch.price = price;
    if (category !== undefined) patch.category = category;
    if (condition !== undefined) patch.condition = condition;
    if (size !== undefined) patch.size = size;
    if (tags !== undefined) patch.tags = normalizeTags(tags);
    if (media !== undefined) patch.media = normalizeMedia(media);
    if (location !== undefined) patch.location = location;
    if (status !== undefined) patch.status = status;

    res.json(await productModel.update(req.params.id, patch));
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) throw notFound("product not found");
    if (product.sellerId !== req.userId) {
      throw forbidden("only the seller can remove this listing");
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
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

/** Swipe feed ("ปัดดูสินค้า") — public, anyone can watch without an account. */
async function videoFeed(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await productModel.listVideoFeed({
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

/** Sellers attach a short review clip to one of their own listings. */
async function createVideoClip(req, res, next) {
  try {
    if (!["SELLER", "ADMIN"].includes(req.userRole)) {
      throw forbidden("only seller accounts can upload video reviews");
    }

    const { videoUrl, description, productId, sellerName } = req.body;
    if (!videoUrl || !productId) {
      throw badRequest("videoUrl and productId are required");
    }

    const product = await productModel.findById(productId);
    if (!product) throw notFound("product not found");
    if (product.sellerId !== req.userId) {
      throw forbidden("you can only attach video clips to your own products");
    }

    const clip = await productModel.createVideoClip({
      videoUrl,
      description: description || "",
      sellerId: req.userId,
      sellerName: sellerName || null,
      productId,
    });
    res.status(201).json(clip);
  } catch (err) {
    next(err);
  }
}

/** Called by order-service (service-to-service, internal token) when an order is placed/cancelled. */
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
  getOne,
  bySeller,
  listCategories,
  listConditions,
  create,
  update,
  remove,
  mine,
  markStatusInternal,
  videoFeed,
  createVideoClip,
};
