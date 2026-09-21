const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const defaultRepository = require("./campaignRepository");
const {
  validateSegmentRule,
  matchesSegment,
} = require("../segments/segmentRule");

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
  if (!user || !user.role || user.role !== "MARKETING") {
    throw forbidden("insufficient permissions: MARKETING role required");
  }
}

function validateCampaignInput(input, { isUpdate = false } = {}) {
  if (!isUpdate || input.code !== undefined) {
    if (!input.code || typeof input.code !== "string") {
      throw badRequest("campaign code is required");
    }
    const cleanCode = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(cleanCode)) {
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
  if (
    discountType !== undefined &&
    !["PERCENT", "FIXED"].includes(discountType)
  ) {
    throw badRequest("discountType must be PERCENT or FIXED");
  }

  if (!isUpdate || input.discountValue !== undefined) {
    const val = Number(input.discountValue);
    if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
      throw badRequest("discountValue must be a positive integer");
    }
    const type = discountType || (isUpdate ? undefined : "PERCENT");
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
  } else {
    if (
      input.startsAt !== undefined &&
      isNaN(new Date(input.startsAt).getTime())
    ) {
      throw badRequest("invalid startsAt date format");
    }
    if (input.endsAt !== undefined && isNaN(new Date(input.endsAt).getTime())) {
      throw badRequest("invalid endsAt date format");
    }
  }

  if (input.targetSegment !== undefined && input.targetSegment !== null) {
    validateSegmentRule(input.targetSegment);
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
        input.minOrderPrice !== undefined
          ? parseInt(input.minOrderPrice, 10)
          : 0,
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
    if (input.discountType !== undefined)
      data.discountType = input.discountType;
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
    if (input.targetSegment !== undefined)
      data.targetSegment = input.targetSegment;

    // Validate dates combination if either changed
    const newStart = data.startsAt
      ? new Date(data.startsAt)
      : new Date(campaign.startsAt);
    const newEnd = data.endsAt
      ? new Date(data.endsAt)
      : new Date(campaign.endsAt);
    if (newEnd <= newStart) {
      throw badRequest("endsAt must be after startsAt");
    }

    // Validate effective discount combination
    const effectiveType =
      data.discountType !== undefined
        ? data.discountType
        : campaign.discountType;
    const effectiveValue =
      data.discountValue !== undefined
        ? data.discountValue
        : campaign.discountValue;
    if (
      effectiveType === "PERCENT" &&
      (effectiveValue < 1 || effectiveValue > 100)
    ) {
      throw badRequest("percent discountValue must be between 1 and 100");
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

  async function getCampaign({ user, campaignId }) {
    const campaign = await loadCampaign(campaignId);

    const isMarketing = Boolean(
      user && (user.role === "MARKETING" || user.roles?.includes("MARKETING")),
    );

    if (!isMarketing) {
      const now = new Date();
      if (
        campaign.status !== "published" ||
        now < new Date(campaign.startsAt) ||
        now > new Date(campaign.endsAt)
      ) {
        throw notFound("campaign not found");
      }
    }

    return campaign;
  }

  async function listCampaigns({ user, status, search, skip, take }) {
    assertMarketingOrAdmin(user);
    return repository.listCampaigns({ status, search, skip, take });
  }

  async function listAvailablePublicCampaigns({ profile } = {}) {
    const campaigns = await repository.listAvailableCampaigns();
    return campaigns.filter((c) => matchesSegment(profile, c.targetSegment));
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
    if (now < new Date(campaign.startsAt)) {
      throw badRequest("campaign has not started yet");
    }
    if (now > new Date(campaign.endsAt)) {
      throw badRequest("campaign has expired");
    }

    const existing = await repository.findVoucher(user.id, campaignId);
    if (existing) {
      throw conflict("voucher already claimed by user");
    }

    if (
      campaign.usageLimit !== null &&
      campaign.usageLimit !== undefined &&
      campaign.usedCount >= campaign.usageLimit
    ) {
      throw conflict("campaign usage limit reached");
    }

    try {
      if (repository.claimVoucherAtomic) {
        return await repository.claimVoucherAtomic({
          userId: user.id,
          campaignId,
          usageLimit: campaign.usageLimit,
        });
      }

      const voucher = await repository.createVoucher({
        campaignId,
        userId: user.id,
      });
      await repository.incrementUsedCount(campaignId);
      return voucher;
    } catch (err) {
      if (
        err.status === 409 ||
        err.statusCode === 409 ||
        err.code === "P2002"
      ) {
        throw conflict(err.message || "voucher already claimed by user");
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

  async function getApplicableVouchers({ user, price, category, profile }) {
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
      if (!matchesSegment(profile, camp.targetSegment)) continue;

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

  async function validateAndCalculateDiscount({
    campaignId,
    userId,
    price,
    category,
  }) {
    if (!campaignId) throw badRequest("campaignId is required");
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      throw badRequest("valid price is required");
    }

    const campaign = await repository.findById(campaignId);
    if (!campaign) {
      throw notFound("campaign not found");
    }

    const now = new Date();
    if (campaign.status !== "published") {
      throw badRequest(`campaign is not active (status: ${campaign.status})`);
    }
    if (now < new Date(campaign.startsAt) || now > new Date(campaign.endsAt)) {
      throw badRequest("campaign is outside of its active date window");
    }

    if (userId) {
      const voucher = await repository.findVoucher(userId, campaignId);
      if (!voucher) {
        throw badRequest("user has not claimed this voucher");
      }
      if (voucher.status === "USED") {
        throw badRequest("voucher has already been used");
      }
      if (voucher.status === "EXPIRED") {
        throw badRequest("voucher has expired");
      }
    }

    if (campaign.minOrderPrice && numericPrice < campaign.minOrderPrice) {
      throw badRequest(
        `minimum order price of ฿${campaign.minOrderPrice.toLocaleString("th-TH")} required`,
      );
    }

    if (campaign.applicableCategory && category) {
      if (
        campaign.applicableCategory.trim().toLowerCase() !==
        category.trim().toLowerCase()
      ) {
        throw badRequest(
          `voucher is only applicable for category: ${campaign.applicableCategory}`,
        );
      }
    }

    let discountAmount = 0;
    if (campaign.discountType === "PERCENT") {
      const rawDiscount = Math.round(
        (numericPrice * campaign.discountValue) / 100,
      );
      discountAmount = campaign.maxDiscount
        ? Math.min(rawDiscount, campaign.maxDiscount)
        : rawDiscount;
    } else if (campaign.discountType === "FIXED") {
      discountAmount = Math.min(campaign.discountValue, numericPrice);
    }

    const finalPrice = Math.max(0, numericPrice - discountAmount);

    return {
      eligible: true,
      campaignId: campaign.id,
      campaignCode: campaign.code,
      discountAmount,
      finalPrice,
    };
  }

  async function quoteAndHold({ campaignId, userId, orderId, productId }) {
    if (!campaignId) throw badRequest("campaignId is required");
    if (!userId) throw badRequest("userId is required");
    if (!orderId) throw badRequest("orderId is required");
    if (!productId) throw badRequest("productId is required");

    // 1. Verify Voucher in DB before exposing product reservation details.
    const voucher = await repository.findVoucher(userId, campaignId);
    if (!voucher) {
      throw badRequest("user has not claimed this voucher");
    }
    if (voucher.status !== "CLAIMED") {
      throw badRequest(`voucher is already ${voucher.status}`);
    }
    if (voucher.usedOrderId && voucher.usedOrderId !== orderId) {
      throw conflict("voucher is currently held by another order");
    }

    // 2. Verify Product in DB
    const product = await repository.findProduct(productId);
    if (!product) {
      throw badRequest("product not found");
    }
    if (product.status !== "reserved") {
      throw badRequest(`product is not reserved (status: ${product.status})`);
    }
    if (product.reservedBy !== userId) {
      throw badRequest("product is not reserved by this buyer");
    }
    const now = new Date();
    if (
      !product.reservationExpiresAt ||
      new Date(product.reservationExpiresAt) <= now
    ) {
      throw badRequest("product reservation has expired");
    }

    // 3. Verify Campaign in DB
    const campaign = await repository.findById(campaignId);
    if (!campaign) {
      throw notFound("campaign not found");
    }
    if (campaign.status !== "published") {
      throw badRequest(`campaign is not active (status: ${campaign.status})`);
    }
    if (now < new Date(campaign.startsAt) || now > new Date(campaign.endsAt)) {
      throw badRequest("campaign is outside of its active date window");
    }
    if (campaign.minOrderPrice && product.price < campaign.minOrderPrice) {
      throw badRequest(
        `minimum order price of ฿${campaign.minOrderPrice.toLocaleString("th-TH")} required`,
      );
    }
    if (campaign.applicableCategory && product.category) {
      if (
        campaign.applicableCategory.trim().toLowerCase() !==
        product.category.trim().toLowerCase()
      ) {
        throw badRequest(
          `voucher is only applicable for category: ${campaign.applicableCategory}`,
        );
      }
    }

    // 4. Calculate discount
    let discountAmount = 0;
    if (campaign.discountType === "PERCENT") {
      const rawDiscount = Math.round(
        (product.price * campaign.discountValue) / 100,
      );
      discountAmount = campaign.maxDiscount
        ? Math.min(rawDiscount, campaign.maxDiscount)
        : rawDiscount;
    } else if (campaign.discountType === "FIXED") {
      discountAmount = Math.min(campaign.discountValue, product.price);
    }
    const finalPrice = Math.max(0, product.price - discountAmount);

    // 5. Concurrency protection: Atomic Hold
    const held = await repository.holdVoucherWithLock({
      userId,
      campaignId,
      orderId,
    });
    if (!held) {
      throw conflict(
        "voucher is currently held by another order or already used",
      );
    }

    return {
      campaignId: campaign.id,
      campaignCode: campaign.code,
      discountAmount,
      finalPrice,
    };
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
    validateAndCalculateDiscount,
    quoteAndHold,
    holdVoucher,
    releaseVoucher,
    completeVoucher,
    startCampaignExpiryWorker,
  };
}

module.exports = createCampaignService(defaultRepository);
module.exports.createCampaignService = createCampaignService;
