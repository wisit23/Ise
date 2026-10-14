const repository = require("./recommendationRepository");
const styleProfileClient = require("./styleProfileClient");
const behaviorRepository = require("./behaviorRepository");
const purchaseHistoryClient = require("./purchaseHistoryClient");
const { normalizeProfile, hasPreferences } = require("./recommendationRules");
const { isCustomerAccount } = require("@reloop/shared");

function createRecommendationService({
  products = repository,
  profiles = styleProfileClient,
  behaviors = behaviorRepository,
  purchases = purchaseHistoryClient,
} = {}) {
  async function list({
    userId,
    roles = [],
    authorization,
    skip,
    take,
    filters = {},
    seed,
  }) {
    let profile = normalizeProfile();
    let behavior = {};
    const unavailableSources = [];
    let fallbackReason = userId ? "no-profile" : "guest";
    if (userId && isCustomerAccount(roles)) {
      const [saved, activity, orders] = await Promise.allSettled([
        profiles.get(authorization),
        behaviors.get(userId),
        purchases.get(authorization),
      ]);
      if (saved.status === "fulfilled") profile = normalizeProfile(saved.value);
      else unavailableSources.push("profile");
      if (activity.status === "fulfilled") behavior = activity.value;
      else unavailableSources.push("activity");
      if (orders.status === "fulfilled") {
        try {
          behavior.purchases = await behaviors.purchases(orders.value);
        } catch {
          unavailableSources.push("purchases");
        }
      } else unavailableSources.push("purchases");
      const active =
        hasPreferences(profile) ||
        Object.values(behavior).some((rows) => rows.length > 0);
      fallbackReason = active
        ? null
        : unavailableSources.length
          ? "profile-unavailable"
          : "no-profile";
    } else if (userId) {
      fallbackReason = "non-customer";
    }
    const result = await products.list({
      profile,
      behavior,
      userId,
      skip,
      take,
      filters,
      seed,
    });
    if (!fallbackReason && result.matchedTotal === 0)
      fallbackReason = "no-matches";
    return {
      ...result,
      personalized: !fallbackReason,
      fallbackReason,
      unavailableSources,
    };
  }
  return { list };
}

module.exports = createRecommendationService();
module.exports.createRecommendationService = createRecommendationService;
