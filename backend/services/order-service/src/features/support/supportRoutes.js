const { Router } = require("express");
const {
  requireAuth,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const supportService = require("./supportService");

const router = Router();

router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await supportService.search({
      role: req.userRole,
      orderId: req.query.orderId,
      buyerId: req.query.buyerId,
      sellerId: req.query.sellerId,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
