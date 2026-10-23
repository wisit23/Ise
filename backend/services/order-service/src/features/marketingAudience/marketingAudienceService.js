const { badRequest } = require("@reloop/shared");
const repository = require("./marketingAudienceRepository");

const MAX_LOOKBACK_MS = 180 * 86400000;

function parseDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("invalid date range");
  return date;
}

function createMarketingAudienceService(audienceRepository = repository) {
  async function listPurchases(input = {}) {
    const now = new Date();
    const from = parseDate(input.from, new Date(now.getTime() - MAX_LOOKBACK_MS));
    const to = parseDate(input.to, now);
    const page = Number(input.page || 1);
    const limit = Number(input.limit || 500);
    if (from > to) throw badRequest("from must be before to");
    if (to.getTime() - from.getTime() > MAX_LOOKBACK_MS) {
      throw badRequest("date range must not exceed 180 days");
    }
    if (!Number.isInteger(page) || page < 1) throw badRequest("invalid page");
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw badRequest("limit must be between 1 and 1000");
    }
    const result = await audienceRepository.listPurchases({
      from,
      to,
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: result.orders
        .filter((order) => order.payments[0]?.paidAt)
        .map((order) => ({
          userId: order.buyerId,
          productId: order.productId,
          purchasedAt: order.payments[0].paidAt,
        })),
      total: result.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.total / limit)),
    };
  }
  return { listPurchases };
}

module.exports = {
  ...createMarketingAudienceService(),
  createMarketingAudienceService,
  MAX_LOOKBACK_MS,
};
