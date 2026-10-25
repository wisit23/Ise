const { badRequest } = require("@reloop/shared");
const repository = require("./marketingAudienceRepository");
const { profileView: styleProfileView } = require("../styleProfile/styleProfileService");

function profileView(preferences = []) {
  const profile = { ...styleProfileView({ preferences }) };
  delete profile.unassignedSizes;
  return profile;
}

function pagination(input = {}) {
  const page = Number(input.page || 1);
  const limit = Number(input.limit || 250);
  if (!Number.isInteger(page) || page < 1) throw badRequest("invalid page");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw badRequest("limit must be between 1 and 500");
  }
  return { page, limit, skip: (page - 1) * limit };
}

function createMarketingAudienceService(audienceRepository = repository) {
  async function listBuyerProfiles(input) {
    const { page, limit, skip } = pagination(input);
    const result = await audienceRepository.listBuyerProfiles({ skip, take: limit });
    return {
      items: result.items.map((row) => ({
        userId: row.id,
        profile: profileView(row.buyerProfile?.preferences),
      })),
      total: result.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.total / limit)),
    };
  }
  return { listBuyerProfiles };
}

module.exports = {
  ...createMarketingAudienceService(),
  createMarketingAudienceService,
  profileView,
};
