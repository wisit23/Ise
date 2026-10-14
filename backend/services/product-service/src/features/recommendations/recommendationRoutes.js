const { Router } = require("express");
const {
  requireAuth,
  parsePagination,
  paginatedResponse,
  requireCustomerAccount,
  badRequest,
} = require("@reloop/shared");
const service = require("./recommendationService");
const behaviorRepository = require("./behaviorRepository");
const { parseCatalogFilters } = require("../catalog/catalogQuery");

function optionalAuth(req, res, next) {
  if (req.headers.authorization) return requireAuth(req, res, next);
  req.userId = null;
  req.userRoles = [];
  next();
}

function createRecommendationRoutes(
  recommendations = service,
  behaviors = behaviorRepository,
) {
  const router = Router();
  router.post(
    "/search-events",
    requireAuth,
    requireCustomerAccount,
    async (req, res, next) => {
      try {
        await behaviors.recordSearch(req.userId, req.body?.query);
        res.set("Cache-Control", "private, no-store");
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/", optionalAuth, async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query, 8);
      const seed = req.query.seed;
      if (
        seed !== undefined &&
        (typeof seed !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(seed))
      ) {
        throw badRequest("Invalid feed seed");
      }
      let filters;
      try {
        filters = parseCatalogFilters(req.query);
      } catch (error) {
        throw badRequest(error.message);
      }
      const {
        items,
        total,
        matchedTotal,
        personalized,
        fallbackReason,
        unavailableSources,
      } = await recommendations.list({
        userId: req.userId,
        roles: req.userRoles,
        authorization: req.headers.authorization,
        skip: pagination.skip,
        take: pagination.take,
        filters,
        seed,
      });
      res.set("Cache-Control", "private, no-store");
      res.json({
        ...paginatedResponse(items, total, pagination),
        matchedTotal,
        personalized,
        fallbackReason,
        unavailableSources,
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = createRecommendationRoutes();
module.exports.createRecommendationRoutes = createRecommendationRoutes;
