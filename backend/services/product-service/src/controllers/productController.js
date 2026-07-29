const { badRequest, notFound, forbidden } = require("@reloop/shared");
const productModel = require("../models/productModel");

async function feed(req, res, next) {
  try {
    const { category } = req.query;
    const items = await productModel.list({ category, status: "available" });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function search(req, res, next) {
  try {
    const { q, category } = req.query;
    const items = await productModel.list({
      q,
      category,
      status: "available",
    });
    res.json({ items });
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

async function create(req, res, next) {
  try {
    if (!["SELLER", "ADMIN"].includes(req.userRole)) {
      throw forbidden("only seller accounts can list products for sale");
    }

    const { title, description, price, category, condition, size, images } =
      req.body;
    if (!title || !price || !category) {
      throw badRequest("title, price, category are required");
    }
    if (!Number.isInteger(price) || price <= 0) {
      throw badRequest("price must be a positive whole number");
    }

    const product = await productModel.create({
      sellerId: req.userId,
      title,
      description: description || "",
      price,
      category,
      condition: condition || "ไม่ระบุ",
      size: size || "Free size",
      images: Array.isArray(images) ? images : [],
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
      images,
      status,
    } = req.body;
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (price !== undefined) patch.price = price;
    if (category !== undefined) patch.category = category;
    if (condition !== undefined) patch.condition = condition;
    if (size !== undefined) patch.size = size;
    if (images !== undefined) patch.images = images;
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
    const items = await productModel.listBySeller(req.userId);
    res.json({ items });
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

// ฟังก์ชันวิดิโอ
async function getVideoFeed(req, res, next) {
  try {
    const videos = await productModel.getVideoFeed(); // เรียกผ่าน Model
    res.status(200).json({ videos });
  } catch (err) {
    next(err); // ส่งให้ระบบจัดการ Error กลาง
  }
}
async function createVideo(req, res, next) {
  try {
    if (!["SELLER", "ADMIN"].includes(req.userRole)) {
      throw forbidden("only seller accounts can upload video reviews");
    }

    const { videoUrl, description, productId } = req.body;
    if (!videoUrl || !productId) {
      throw badRequest("videoUrl and productId are required");
    }

    // ตรวจสอบว่าสินค้ามีอยู่จริงและเป็นของผู้ขายคนนี้หรือไม่
    const product = await productModel.findById(productId);
    if (!product) throw notFound("product not found");
    if (product.sellerId !== req.userId) {
      throw forbidden("you can only attach videos to your own products");
    }

    const video = await productModel.createVideo({
      videoUrl,
      description: description || "",
      sellerId: req.userId,
      sellerName: req.userName || req.userEmail || "Seller", // ดึงชื่อผู้ขายจาก Token/Auth
      productId,
    });

    res.status(201).json(video);
  } catch (err) {
    next(err);
  }
}
async function getMyProducts(req, res, next) {
  try {
    const products = await productModel.listBySeller(req.userId);;
    res.json({ items: products });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  feed,
  search,
  getOne,
  create,
  update,
  remove,
  mine,
  markStatusInternal,
  getVideoFeed,
  createVideo,
  getMyProducts,
};
