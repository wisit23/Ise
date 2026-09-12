const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const defaultRepository = require("./campaignRepository");

const TRANSITIONS = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["published"],
  published: ["ended"],
  ended: [],
  rejected: [],
};

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

function assertTransition(campaign, to) {
  if (!canTransition(campaign.status, to)) {
    throw conflict(`cannot move campaign from ${campaign.status} to ${to}`);
  }
}

function assertMarketingOrAdmin(user) {
  if (!user || !user.role || !["MARKETING", "ADMIN"].includes(user.role)) {
    throw forbidden("insufficient permissions: MARKETING or ADMIN required");
  }
}

function validateCampaignInput(input, { isUpdate = false } = {}) {
  if (!isUpdate || input.code !== undefined) {
    if (!input.code || typeof input.code !== "string") {
      throw badRequest("campaign code is required");
    }
    const cleanCode = input.code.trim();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleanCode)) {
      throw badRequest(
        "invalid campaign code: must be 3-30 alphanumeric characters, hyphens or underscores",
      );
    }
  }

  if (!isUpdate || input.name !== undefined) {
    if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
      throw badRequest("campaign name is required");
    }
  }

  const discountType = input.discountType || (isUpdate ? undefined : "PERCENT");
  if (discountType !== undefined && !["PERCENT", "FIXED"].includes(discountType)) {
    throw badRequest("discountType must be PERCENT or FIXED");
  }

  if (!isUpdate || input.discountValue !== undefined) {
    const val = Number(input.discountValue);
    if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
      throw badRequest("discountValue must be a positive integer");
    }
    const type = discountType || "PERCENT";
    if (type === "PERCENT" && (val < 1 || val > 100)) {
      throw badRequest("percent discountValue must be between 1 and 100");
    }
  }

  if (input.minOrderPrice !== undefined) {
    const min = Number(input.minOrderPrice);
    if (isNaN(min) || min < 0 || !Number.isInteger(min)) {
      throw badRequest("minOrderPrice must be a non-negative integer");
    }
  }

  if (input.maxDiscount !== undefined && input.maxDiscount !== null) {
    const max = Number(input.maxDiscount);
    if (isNaN(max) || max <= 0 || !Number.isInteger(max)) {
      throw badRequest("maxDiscount must be a positive integer");
    }
  }

  if (input.budget !== undefined && input.budget !== null) {
    const b = Number(input.budget);
    if (isNaN(b) || b <= 0 || !Number.isInteger(b)) {
      throw badRequest("budget must be a positive integer");
    }
  }

  if (input.usageLimit !== undefined && input.usageLimit !== null) {
    const u = Number(input.usageLimit);
    if (isNaN(u) || u <= 0 || !Number.isInteger(u)) {
      throw badRequest("usageLimit must be a positive integer");
    }
  }

  if (input.startsAt !== undefined && input.endsAt !== undefined) {
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw badRequest("invalid startsAt or endsAt date format");
    }
    if (end <= start) {
      throw badRequest("endsAt must be after startsAt");
    }
  } else if (!isUpdate) {
    if (!input.startsAt || !input.endsAt) {
      throw badRequest("both startsAt and endsAt dates are required");
    }
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw badRequest("invalid startsAt or endsAt date format");
    }
    if (end <= start) {
      throw badRequest("endsAt must be after startsAt");
    }
  }
}

function createCampaignService(repository = defaultRepository) {
  async function loadCampaign(id) {
    const campaign = await repository.findById(id);
    if (!campaign) throw notFound("campaign not found");
    return campaign;
  }

  async function createDraft({ user, input }) {
    assertMarketingOrAdmin(user);
    validateCampaignInput(input, { isUpdate: false });

    const code = input.code.trim().toUpperCase();
    const existing = await repository.findByCode(code);
    if (existing) {
      throw conflict(`campaign code "${code}" already exists`);
    }

    const data = {
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      discountType: input.discountType || "PERCENT",
      discountValue: parseInt(input.discountValue, 10),
      minOrderPrice:
        input.minOrderPrice !== undefined ? parseInt(input.minOrderPrice, 10) : 0,
      maxDiscount:
        input.maxDiscount !== undefined && input.maxDiscount !== null
          ? parseInt(input.maxDiscount, 10)
          : null,
      applicableCategory: input.applicableCategory?.trim() || null,
      budget:
        input.budget !== undefined && input.budget !== null
          ? parseInt(input.budget, 10)
          : null,
      usageLimit:
        input.usageLimit !== undefined && input.usageLimit !== null
          ? parseInt(input.usageLimit, 10)
          : null,
      status: "draft",
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      createdById: user.id,
      targetSegment: input.targetSegment || null,
    };

    return repository.createCampaign(data);
  }

  async function updateDraft({ user, campaignId, input }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);

    if (campaign.status !== "draft") {
      throw conflict("only draft campaigns can be edited");
    }

    validateCampaignInput(input, { isUpdate: true });

    const data = {};
    if (input.code !== undefined) {
      const code = input.code.trim().toUpperCase();
      if (code !== campaign.code) {
        const existing = await repository.findByCode(code);
        if (existing) {
          throw conflict(`campaign code "${code}" already exists`);
        }
      }
      data.code = code;
    }
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined)
      data.description = input.description?.trim() || null;
    if (input.discountType !== undefined) data.discountType = input.discountType;
    if (input.discountValue !== undefined)
      data.discountValue = parseInt(input.discountValue, 10);
    if (input.minOrderPrice !== undefined)
      data.minOrderPrice = parseInt(input.minOrderPrice, 10);
    if (input.maxDiscount !== undefined)
      data.maxDiscount =
        input.maxDiscount !== null ? parseInt(input.maxDiscount, 10) : null;
    if (input.applicableCategory !== undefined)
      data.applicableCategory = input.applicableCategory?.trim() || null;
    if (input.budget !== undefined)
      data.budget = input.budget !== null ? parseInt(input.budget, 10) : null;
    if (input.usageLimit !== undefined)
      data.usageLimit =
        input.usageLimit !== null ? parseInt(input.usageLimit, 10) : null;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
    if (input.targetSegment !== undefined) data.targetSegment = input.targetSegment;

    // Validate dates combination if either changed
    const newStart = data.startsAt || campaign.startsAt;
    const newEnd = data.endsAt || campaign.endsAt;
    if (newEnd <= newStart) {
      throw badRequest("endsAt must be after startsAt");
    }

    return repository.updateCampaign(campaignId, data);
  }

  async function deleteDraft({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);

    if (campaign.status !== "draft" && campaign.status !== "rejected") {
      throw conflict(
        `cannot delete campaign with status "${campaign.status}", only draft or rejected campaigns can be deleted`,
      );
    }

    return repository.deleteCampaign(campaignId);
  }

  async function submitForApproval({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "pending_approval");

    return repository.updateCampaign(campaignId, {
      status: "pending_approval",
    });
  }

  async function approveCampaign({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "approved");

    // Option 2 (Approved in Plan): Self-approval allowed for demo/evaluation.
    // Record approvedById and approvedAt for audit traceability.
    return repository.updateCampaign(campaignId, {
      status: "approved",
      approvedById: user.id,
      approvedAt: new Date(),
    });
  }

  async function rejectCampaign({ user, campaignId, reason }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "rejected");

    return repository.updateCampaign(campaignId, {
      status: "rejected",
      description: reason
        ? `${campaign.description || ""}\n[REJECT REASON]: ${reason}`.trim()
        : campaign.description,
    });
  }

  async function publishCampaign({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "published");

    return repository.updateCampaign(campaignId, {
      status: "published",
    });
  }

  async function endCampaign({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "ended");

    return repository.updateCampaign(campaignId, {
      status: "ended",
    });
  }

  async function getCampaign({ campaignId }) {
    return loadCampaign(campaignId);
  }

  async function listCampaigns({ user, status, search, skip, take }) {
    assertMarketingOrAdmin(user);
    return repository.listCampaigns({ status, search, skip, take });
  }

  async function listAvailablePublicCampaigns() {
    return repository.listAvailableCampaigns();
  }

  async function claimVoucher({ user, campaignId }) {
    if (!user || !user.id) {
      throw badRequest("user authentication required");
    }

    const campaign = await loadCampaign(campaignId);
    if (campaign.status !== "published") {
      throw conflict("campaign is not published");
    }

    const now = new Date();
    if (now < campaign.startsAt) {
      throw badRequest("campaign has not started yet");
    }
    if (now > campaign.endsAt) {
      throw badRequest("campaign has expired");
    }

    if (campaign.usageLimit && campaign.usedCount >= campaign.usageLimit) {
      throw badRequest("campaign usage limit reached");
    }

    const existing = await repository.findVoucher(user.id, campaignId);
    if (existing) {
      throw conflict("voucher already claimed by user");
    }

    try {
      const voucher = await repository.createVoucher({
        campaignId,
        userId: user.id,
      });
      await repository.incrementUsedCount(campaignId);
      return voucher;
    } catch (err) {
      // P2002: Unique constraint failed on the fields: (user_id, campaign_id)
      if (err.code === "P2002") {
        throw conflict("voucher already claimed by user");
      }
      throw err;
    }
  }

  async function getMyVouchers({ user, status }) {
    if (!user || !user.id) {
      throw badRequest("user authentication required");
    }
    return repository.listUserVouchers(user.id, { status });
  }

  async function getApplicableVouchers({ user, price, category }) {
    if (!user || !user.id) {
      throw badRequest("user authentication required");
    }
    if (price === undefined || price === null || isNaN(Number(price))) {
      throw badRequest("price is required and must be a number");
    }

    const orderPrice = Number(price);
    if (orderPrice < 0) {
      throw badRequest("price cannot be negative");
    }

    const vouchers = await repository.listUserVouchers(user.id, {
      status: "CLAIMED",
    });

    const now = new Date();
    const applicable = [];

    for (const v of vouchers) {
      if (v.usedOrderId) continue;
      const camp = v.campaign;
      if (!camp) continue;
      if (camp.status !== "published") continue;
      if (camp.startsAt > now || camp.endsAt < now) continue;
      if (orderPrice < camp.minOrderPrice) continue;

      if (camp.applicableCategory) {
        if (
          !category ||
          camp.applicableCategory.trim().toLowerCase() !==
            category.trim().toLowerCase()
        ) {
          continue;
        }
      }

      let estimatedDiscount = 0;
      if (camp.discountType === "PERCENT") {
        const rawDiscount = Math.round((orderPrice * camp.discountValue) / 100);
        estimatedDiscount = camp.maxDiscount
          ? Math.min(rawDiscount, camp.maxDiscount)
          : rawDiscount;
      } else if (camp.discountType === "FIXED") {
        estimatedDiscount = Math.min(camp.discountValue, orderPrice);
      }

      applicable.push({
        ...v,
        estimatedDiscount,
        finalPrice: Math.max(0, orderPrice - estimatedDiscount),
      });
    }

    // Sort highest discount first
    applicable.sort((a, b) => b.estimatedDiscount - a.estimatedDiscount);

    return applicable;
  }

  async function holdVoucher({ user, campaignId, orderId }) {
    if (!user || !user.id) throw badRequest("user authentication required");
    if (!campaignId) throw badRequest("campaignId is required");
    const voucher = await repository.findVoucher(user.id, campaignId);
    if (!voucher) throw notFound("voucher not found in user wallet");
    if (voucher.status !== "CLAIMED") {
      throw conflict(`voucher is already ${voucher.status}`);
    }
    if (voucher.usedOrderId && voucher.usedOrderId !== orderId) {
      throw conflict("voucher is already reserved for another order");
    }

    return repository.holdVoucher({ userId: user.id, campaignId, orderId });
  }

  async function releaseVoucher({ user, campaignId, orderId }) {
    if (!user || !user.id) throw badRequest("user authentication required");
    if (!campaignId) throw badRequest("campaignId is required");
    return repository.releaseVoucher({ userId: user.id, campaignId, orderId });
  }

  async function completeVoucher({ user, campaignId, orderId }) {
    if (!user || !user.id) throw badRequest("user authentication required");
    if (!campaignId) throw badRequest("campaignId is required");
    const voucher = await repository.findVoucher(user.id, campaignId);
    if (!voucher) throw notFound("voucher not found in user wallet");
    if (voucher.status === "USED") return voucher;
    return repository.completeVoucher({ userId: user.id, campaignId, orderId });
  }

  function startCampaignExpiryWorker(intervalMs = 30000) {
    const sweep = () => {
      repository.autoExpireCampaigns().catch((err) => {
        console.error("[product-service] campaign expiry sweep failed", err);
      });
    };
    sweep();
    const timer = setInterval(sweep, intervalMs);
    timer.unref();
    return timer;
  }

  return {
    createDraft,
    updateDraft,
    deleteDraft,
    submitForApproval,
    approveCampaign,
    rejectCampaign,
    publishCampaign,
    endCampaign,
    getCampaign,
    listCampaigns,
    listAvailablePublicCampaigns,
    claimVoucher,
    getMyVouchers,
    getApplicableVouchers,
    holdVoucher,
    releaseVoucher,
    completeVoucher,
    startCampaignExpiryWorker,
  };
}

module.exports = createCampaignService(defaultRepository);
module.exports.createCampaignService = createCampaignService;
