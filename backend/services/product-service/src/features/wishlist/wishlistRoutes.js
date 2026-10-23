const { Router } = require("express");
const {
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability,
  CAPABILITY,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const { createWishlistService } = require("./wishlistService");
const prisma = require("../../models/prismaClient");
const { toApiShape } = require("../../models/productModel");
const service = createWishlistService(prisma);
const router = Router();

router.use(
  requireAuth,
  requireCustomerAccount,
  requireCommerceCapability(CAPABILITY.BUYER),
);
router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const { items, total } = await service.list(req.userId, pagination);
    res.json(paginatedResponse(items.map(toApiShape), total, pagination));
  } catch (error) {
    next(error);
  }
});
for (const [method, action] of [
  ["get", "read"],
  ["put", "save"],
  ["delete", "remove"],
]) {
  router[method]("/:productId", async (req, res, next) => {
    try {
      res.json(await service[action](req.userId, req.params.productId));
    } catch (error) {
      next(error);
    }
  });
}
module.exports = router;
