const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const defaultRepository = require("./campaignRepository");
const defaultPrisma = require("../../models/prismaClient");
const defaultChatClient = require("../auctions/chatClient");
const defaultAudienceService = require("../interestAudience/interestAudienceService");
const defaultAudienceRepository = require("../interestAudience/interestAudienceRepository");
const { lockCampaign } = require("./campaignBudget");
const { recordMarketingAudit } = require("../audit/marketingAuditService");
const {
  validateSegmentRule,
  matchesSegment,
} = require("../segments/segmentRule");

const CAMPAIGN_BUDGET_EXHAUSTED_MESSAGE =
  "วงเงินส่วนลดของคูปองนี้ถูกใช้ครบแล้ว";
const CHECKOUT_BUDGET_EXHAUSTED_MESSAGE =
  "วงเงินส่วนลดของคูปองนี้ถูกใช้ครบแล้ว กรุณาเลือกคูปองอื่นหรือดำเนินการต่อโดยไม่ใช้คูปอง";
const VOUCHER_BUDGET_INSUFFICIENT_MESSAGE =
  "โค้ดนี้ใช้ไม่ได้กับสินค้านี้ เพราะวงเงินส่วนลดของแคมเปญคงเหลือไม่เพียงพอ";

function availableCampaignBudget(campaign) {
  if (campaign.budget === null || campaign.budget === undefined) return null;
  return Math.max(
    0,
    Number(campaign.budget) -
      Number(campaign.spentBudget || 0) -
      Number(campaign.reservedBudget || 0),
  );
}

function campaignUnavailableMessage(campaign, { checkout = false } = {}) {
  if (campaign?.endReason === "BUDGET_EXHAUSTED") {
    return checkout
      ? CHECKOUT_BUDGET_EXHAUSTED_MESSAGE
      : CAMPAIGN_BUDGET_EXHAUSTED_MESSAGE;
  }
  if (campaign?.endReason === "ADMIN_CLOSED") {
    return "คูปองถูกปิดโดย Trust and Safety";
  }
  if (campaign?.endReason === "USAGE_LIMIT_REACHED") {
    return "สิทธิ์คูปองถูกใช้ครบแล้ว";
  }
  return "คูปองหมดอายุแล้ว";
}

const TRANSITIONS = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["published", "ended"],
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

function audienceCriteriaKey(criteria) {
  return JSON.stringify(
    criteria
      ? defaultAudienceService.normalizeAudienceCriteria(criteria)
      : null,
  );
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

  if (!isUpdate) {
    if (!input.startsAt || !input.endsAt) {
      throw badRequest("กรุณาระบุทั้งวันเวลาเริ่มต้นและสิ้นสุดของแคมเปญ");
    }
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw badRequest("รูปแบบวันเวลาเริ่มต้นหรือสิ้นสุดไม่ถูกต้อง");
    }
    if (end <= start) {
      throw badRequest("วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น");
    }
    const now = new Date();
    // ตอนสร้าง Draft ห้ามกำหนดช่วงเวลาที่สิ้นสุดไปแล้ว
    if (end.getTime() <= now.getTime()) {
      throw badRequest(
        "ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้ วันเวลาสิ้นสุดต้องอยู่ในอนาคต",
      );
    }
    // ห้ามกำหนด startsAt ย้อนหลังโดยไม่มีเหตุผล (อนุญาต clock skew ไม่เกิน 60 วินาที)
    if (start.getTime() < now.getTime() - 60000) {
      throw badRequest("ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้");
    }
  } else {
    if (
      input.startsAt !== undefined &&
      isNaN(new Date(input.startsAt).getTime())
    ) {
      throw badRequest("รูปแบบวันเวลาเริ่มต้นไม่ถูกต้อง");
    }
    if (input.endsAt !== undefined && isNaN(new Date(input.endsAt).getTime())) {
      throw badRequest("รูปแบบวันเวลาสิ้นสุดไม่ถูกต้อง");
    }
  }

  if (input.targetSegment !== undefined && input.targetSegment !== null) {
    validateSegmentRule(input.targetSegment);
  }
  if (input.audienceCriteria !== undefined && input.audienceCriteria !== null) {
    defaultAudienceService.normalizeAudienceCriteria(input.audienceCriteria);
  }
  if (input.targetSegment && input.audienceCriteria) {
    throw badRequest(
      "เลือกกลุ่มเป้าหมายได้เพียงแบบโปรไฟล์เดิมหรือแบบคะแนนความสนใจอย่างใดอย่างหนึ่ง",
    );
  }
}

function validateCampaignFinancialRules({
  discountType,
  discountValue,
  minOrderPrice,
  budget,
  usageLimit,
}) {
  if (
    discountType === "FIXED" &&
    Number(discountValue) >= Number(minOrderPrice || 0)
  ) {
    throw badRequest(
      "ส่วนลดคงที่ต้องน้อยกว่ายอดซื้อขั้นต่ำ เพื่อไม่ให้ยอดชำระเป็นศูนย์หรือติดลบ",
    );
  }
  if (
    discountType === "FIXED" &&
    budget !== null &&
    budget !== undefined &&
    usageLimit !== null &&
    usageLimit !== undefined &&
    Number(budget) < Number(usageLimit) * Number(discountValue)
  ) {
    throw badRequest(
      "งบประมาณต้องไม่น้อยกว่าจำนวนสิทธิ์คูณส่วนลดคงที่ต่อครั้ง",
    );
  }
}

function createCampaignService(
  repository = defaultRepository,
  prismaClient = defaultPrisma,
  dependencies = {},
) {
  const audienceService = dependencies.audienceService || defaultAudienceService;
  const audienceRepository =
    dependencies.audienceRepository || defaultAudienceRepository;
  const chatClient = dependencies.chatClient || defaultChatClient;
  function runInTransaction(fn) {
    if (repository.transaction) {
      return repository.transaction(fn);
    }
    return prismaClient.$transaction(fn);
  }

  async function loadCampaign(id, { tx } = {}) {
    const campaign = await repository.findById(id, { tx });
    if (!campaign) throw notFound("campaign not found");
    return campaign;
  }

  async function isAudienceEligible(campaign, userId, profile) {
    if (campaign.audienceCriteria) {
      return audienceRepository.isCampaignAudienceMember(campaign.id, userId);
    }
    return matchesSegment(profile, campaign.targetSegment);
  }

  async function createDraft({ user, input }) {
    assertMarketingOrAdmin(user);
    validateCampaignInput(input, { isUpdate: false });
    validateCampaignFinancialRules({
      discountType: input.discountType || "PERCENT",
      discountValue: Number(input.discountValue),
      minOrderPrice: Number(input.minOrderPrice || 0),
      budget: input.budget ?? null,
      usageLimit: input.usageLimit ?? null,
    });

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
      audienceCriteria: input.audienceCriteria
        ? audienceService.normalizeAudienceCriteria(input.audienceCriteria)
        : null,
    };

    return runInTransaction(async (tx) => {
      const campaign = await repository.createCampaign(data, { tx });
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_CREATE",
          entityType: "CAMPAIGN",
          entityId: campaign.id,
          previousState: null,
          newState: campaign,
        },
        { tx },
      );
      return campaign;
    });
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
    if (input.audienceCriteria !== undefined) {
      data.audienceCriteria = input.audienceCriteria
        ? audienceService.normalizeAudienceCriteria(input.audienceCriteria)
        : null;
    }
    const effectiveTargetSegment = Object.hasOwn(data, "targetSegment")
      ? data.targetSegment
      : campaign.targetSegment;
    const effectiveAudienceCriteria = Object.hasOwn(data, "audienceCriteria")
      ? data.audienceCriteria
      : campaign.audienceCriteria;
    if (effectiveTargetSegment && effectiveAudienceCriteria) {
      throw badRequest(
        "เลือกกลุ่มเป้าหมายได้เพียงแบบโปรไฟล์เดิมหรือแบบคะแนนความสนใจอย่างใดอย่างหนึ่ง",
      );
    }

    // Validate dates combination if either changed
    const newStart = data.startsAt
      ? new Date(data.startsAt)
      : new Date(campaign.startsAt);
    const newEnd = data.endsAt
      ? new Date(data.endsAt)
      : new Date(campaign.endsAt);
    const now = new Date();
    if (newEnd.getTime() <= now.getTime()) {
      throw badRequest(
        "ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้ วันเวลาสิ้นสุดต้องอยู่ในอนาคต",
      );
    }
    if (newEnd <= newStart) {
      throw badRequest("วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น");
    }
    if (
      input.startsAt !== undefined &&
      newStart.getTime() < now.getTime() - 60000
    ) {
      throw badRequest("ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้");
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
    validateCampaignFinancialRules({
      discountType: effectiveType,
      discountValue: effectiveValue,
      minOrderPrice:
        data.minOrderPrice !== undefined
          ? data.minOrderPrice
          : campaign.minOrderPrice,
      budget: data.budget !== undefined ? data.budget : campaign.budget,
      usageLimit:
        data.usageLimit !== undefined ? data.usageLimit : campaign.usageLimit,
    });

    return runInTransaction(async (tx) => {
      const updated = await repository.updateCampaign(campaignId, data, { tx });
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_UPDATE",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: campaign,
          newState: updated,
        },
        { tx },
      );
      return updated;
    });
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
    validateCampaignFinancialRules(campaign);

    return runInTransaction(async (tx) => {
      const updated = await repository.updateCampaign(
        campaignId,
        {
          status: "pending_approval",
        },
        { tx },
      );
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_SUBMIT",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: campaign,
          newState: updated,
        },
        { tx },
      );
      return updated;
    });
  }

  async function approveCampaign({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "approved");

    // Option 2 (Approved in Plan): Self-approval allowed for demo/evaluation.
    // Record approvedById and approvedAt for audit traceability.
    return runInTransaction(async (tx) => {
      const updated = await repository.updateCampaign(
        campaignId,
        {
          status: "approved",
          approvedById: user.id,
          approvedAt: new Date(),
        },
        { tx },
      );
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_APPROVE",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: campaign,
          newState: updated,
        },
        { tx },
      );
      return updated;
    });
  }

  async function rejectCampaign({ user, campaignId, reason }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "rejected");

    return runInTransaction(async (tx) => {
      const updated = await repository.updateCampaign(
        campaignId,
        {
          status: "rejected",
          description: reason
            ? `${campaign.description || ""}\n[REJECT REASON]: ${reason}`.trim()
            : campaign.description,
        },
        { tx },
      );
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_REJECT",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: campaign,
          newState: updated,
          metadata: reason ? { reason } : null,
        },
        { tx },
      );
      return updated;
    });
  }

  async function publishCampaign({ user, campaignId }) {
    assertMarketingOrAdmin(user);
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "published");
    validateCampaignFinancialRules(campaign);

    const now = new Date();
    if (new Date(campaign.endsAt) <= now) {
      throw badRequest("ไม่สามารถเผยแพร่แคมเปญได้เนื่องจากแคมเปญหมดอายุแล้ว");
    }
    if (
      availableCampaignBudget(campaign) !== null &&
      availableCampaignBudget(campaign) <= 0
    ) {
      throw badRequest(
        "ไม่สามารถเผยแพร่แคมเปญได้เนื่องจากงบประมาณถูกใช้เต็มจำนวนแล้ว",
      );
    }

    const audienceSnapshot = campaign.audienceCriteria
      ? await audienceService.snapshot(campaign.audienceCriteria)
      : null;
    if (audienceSnapshot && audienceSnapshot.members.length === 0) {
      throw badRequest(
        "ไม่สามารถเผยแพร่แคมเปญได้ เนื่องจากไม่พบผู้ซื้อในช่วงคะแนนที่เลือก",
      );
    }

    const snapshotAt = audienceSnapshot ? new Date() : null;
    const result = await runInTransaction(async (tx) => {
      if (tx?.$queryRaw) {
        await lockCampaign(tx, campaignId);
      }
      const lockedCampaign = await loadCampaign(campaignId, { tx });
      assertTransition(lockedCampaign, "published");
      if (
        audienceCriteriaKey(lockedCampaign.audienceCriteria) !==
        audienceCriteriaKey(audienceSnapshot?.criteria)
      ) {
        throw conflict(
          "กลุ่มเป้าหมายของแคมเปญถูกแก้ไขระหว่างเผยแพร่ กรุณาลองใหม่อีกครั้ง",
        );
      }
      if (audienceSnapshot) {
        await audienceRepository.replaceCampaignAudience(
          campaignId,
          audienceSnapshot.members,
          { tx },
        );
      }
      const updated = await repository.updateCampaign(
        campaignId,
        {
          status: "published",
          ...(audienceSnapshot
            ? {
                audienceCriteria: audienceSnapshot.criteria,
                audienceSnapshotAt: snapshotAt,
              }
            : {}),
        },
        { tx },
      );
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_PUBLISH",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: lockedCampaign,
          newState: updated,
          metadata: audienceSnapshot
            ? {
                audienceSize: audienceSnapshot.members.length,
                scoreRange: {
                  min: audienceSnapshot.criteria.minScore,
                  max: audienceSnapshot.criteria.maxScore,
                },
              }
            : null,
        },
        { tx },
      );
      return updated;
    });

    let notificationResult = null;
    if (audienceSnapshot && chatClient?.notifyCampaignAudience) {
      try {
        notificationResult = await chatClient.notifyCampaignAudience({
          campaign: result,
          userIds: audienceSnapshot.members.map((member) => member.userId),
        });
      } catch {
        notificationResult = {
          deliveredCount: 0,
          failedCount: audienceSnapshot.members.length,
          warnings: ["ไม่สามารถส่งการแจ้งเตือนแคมเปญได้ในขณะนี้"],
        };
      }
    }

    return notificationResult
      ? {
          ...result,
          notifiedAudienceCount: notificationResult.deliveredCount,
          notificationWarnings: notificationResult.warnings,
        }
      : result;
  }

  async function endCampaign({ user, campaignId, reason }) {
    assertMarketingOrAdmin(user);
    const normalizedReason = typeof reason === "string" ? reason.trim() : "";
    if (!normalizedReason) {
      throw badRequest("กรุณาระบุเหตุผลที่ปิดแคมเปญ");
    }
    const campaign = await loadCampaign(campaignId);
    assertTransition(campaign, "ended");

    return runInTransaction(async (tx) => {
      const updated = await repository.updateCampaign(
        campaignId,
        {
          status: "ended",
          endedAt: new Date(),
          endReason: "ADMIN_CLOSED",
        },
        { tx },
      );
      if (repository.expireClaimedVouchers) {
        await repository.expireClaimedVouchers(campaignId, { tx });
      } else if (tx && tx.userVoucher) {
        await tx.userVoucher.updateMany({
          where: { campaignId, status: "CLAIMED" },
          data: { status: "EXPIRED" },
        });
      }
      await recordMarketingAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "CAMPAIGN_END",
          entityType: "CAMPAIGN",
          entityId: campaignId,
          previousState: campaign,
          newState: updated,
          metadata: { reason: normalizedReason },
        },
        { tx },
      );
      return updated;
    });
  }

  async function getCampaign({ user, campaignId, profile = null }) {
    const campaign = await loadCampaign(campaignId);

    const isMarketing = Boolean(
      user && (user.role === "MARKETING" || user.roles?.includes("MARKETING")),
    );

    if (!isMarketing) {
      const now = new Date();
      if (
        campaign.status !== "published" ||
        now < new Date(campaign.startsAt) ||
        now > new Date(campaign.endsAt) ||
        !(await isAudienceEligible(campaign, user?.id, profile))
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

  async function listAvailablePublicCampaigns({ userId, profile } = {}) {
    const campaigns = await repository.listAvailableCampaigns();
    const scoreTargetedIds = campaigns
      .filter((campaign) => campaign.audienceCriteria)
      .map((campaign) => campaign.id);
    const eligibleIds = await audienceRepository.eligibleCampaignIds(
      scoreTargetedIds,
      userId,
    );
    return campaigns.filter((campaign) =>
      campaign.audienceCriteria
        ? eligibleIds.has(campaign.id)
        : matchesSegment(profile, campaign.targetSegment),
    );
  }

  async function claimVoucher({ user, campaignId, profile = null }) {
    if (!user || !user.id) {
      throw badRequest("user authentication required");
    }

    const campaign = await loadCampaign(campaignId);
    if (campaign.status !== "published") {
      throw conflict(campaignUnavailableMessage(campaign));
    }

    const now = new Date();
    if (now < new Date(campaign.startsAt)) {
      throw badRequest("campaign has not started yet");
    }
    if (now > new Date(campaign.endsAt)) {
      throw badRequest("คูปองหมดอายุแล้ว");
    }
    if (!(await isAudienceEligible(campaign, user.id, profile))) {
      throw forbidden("บัญชีนี้ไม่อยู่ในกลุ่มเป้าหมายของคูปอง");
    }

    if (
      availableCampaignBudget(campaign) !== null &&
      availableCampaignBudget(campaign) <= 0
    ) {
      throw conflict(CAMPAIGN_BUDGET_EXHAUSTED_MESSAGE);
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
      throw conflict("สิทธิ์คูปองถูกใช้ครบแล้ว");
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

  async function getApplicableVouchers({
    user,
    price,
    category,
    profile,
    includeUnavailable = false,
  }) {
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
    const unavailable = [];

    function addUnavailable(voucher, reasonCode, reasonMessage) {
      if (!includeUnavailable) return;
      unavailable.push({
        ...voucher,
        eligible: false,
        reasonCode,
        reasonMessage,
      });
    }

    for (const v of vouchers) {
      if (v.usedOrderId) {
        addUnavailable(
          v,
          "VOUCHER_HELD",
          "โค้ดนี้ถูกใช้กับรายการสินค้าอื่นที่รอชำระเงินอยู่",
        );
        continue;
      }
      const camp = v.campaign;
      if (!camp) continue;
      if (camp.status !== "published") {
        addUnavailable(
          v,
          "CAMPAIGN_INACTIVE",
          campaignUnavailableMessage(camp),
        );
        continue;
      }
      if (camp.startsAt > now) {
        addUnavailable(v, "CAMPAIGN_NOT_STARTED", "คูปองยังไม่เริ่มใช้งาน");
        continue;
      }
      if (camp.endsAt < now) {
        addUnavailable(v, "CAMPAIGN_EXPIRED", "คูปองหมดอายุแล้ว");
        continue;
      }
      if (
        availableCampaignBudget(camp) !== null &&
        availableCampaignBudget(camp) <= 0
      ) {
        addUnavailable(
          v,
          "BUDGET_EXHAUSTED",
          CAMPAIGN_BUDGET_EXHAUSTED_MESSAGE,
        );
        continue;
      }
      if (orderPrice < camp.minOrderPrice) {
        addUnavailable(
          v,
          "MIN_ORDER_NOT_MET",
          `ต้องมียอดซื้อขั้นต่ำ ฿${Number(camp.minOrderPrice).toLocaleString("th-TH")} จึงจะใช้โค้ดนี้ได้`,
        );
        continue;
      }
      if (!(await isAudienceEligible(camp, user.id, profile))) {
        addUnavailable(
          v,
          "SEGMENT_MISMATCH",
          "บัญชีนี้ไม่อยู่ในกลุ่มเป้าหมายของคูปอง",
        );
        continue;
      }

      if (camp.applicableCategory) {
        if (
          !category ||
          camp.applicableCategory.trim().toLowerCase() !==
            category.trim().toLowerCase()
        ) {
          addUnavailable(
            v,
            "CATEGORY_MISMATCH",
            `โค้ดนี้ใช้ได้เฉพาะหมวด ${camp.applicableCategory}`,
          );
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

      const availableBudget = availableCampaignBudget(camp);
      if (availableBudget !== null && estimatedDiscount > availableBudget) {
        addUnavailable(
          v,
          "BUDGET_INSUFFICIENT",
          VOUCHER_BUDGET_INSUFFICIENT_MESSAGE,
        );
        continue;
      }

      const applicableVoucher = {
        ...v,
        estimatedDiscount,
        finalPrice: Math.max(0, orderPrice - estimatedDiscount),
      };
      applicable.push(
        includeUnavailable
          ? { ...applicableVoucher, eligible: true }
          : applicableVoucher,
      );
    }

    // Sort highest discount first
    applicable.sort((a, b) => b.estimatedDiscount - a.estimatedDiscount);

    return includeUnavailable ? { applicable, unavailable } : applicable;
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

  async function completeVoucher({
    user,
    campaignId,
    orderId,
    discountAmount = 0,
  }) {
    if (!user || !user.id) throw badRequest("user authentication required");
    if (!campaignId) throw badRequest("campaignId is required");
    const voucher = await repository.findVoucher(user.id, campaignId);
    if (!voucher) throw notFound("voucher not found in user wallet");
    if (voucher.status === "USED") return voucher;
    return repository.completeVoucher({
      userId: user.id,
      campaignId,
      orderId,
      discountAmount,
    });
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
      throw badRequest(campaignUnavailableMessage(campaign));
    }
    if (now < new Date(campaign.startsAt)) {
      throw badRequest("คูปองยังไม่เริ่มใช้งาน");
    }
    if (now > new Date(campaign.endsAt)) {
      throw badRequest("คูปองหมดอายุแล้ว");
    }
    if (
      availableCampaignBudget(campaign) !== null &&
      availableCampaignBudget(campaign) <= 0
    ) {
      throw badRequest(CHECKOUT_BUDGET_EXHAUSTED_MESSAGE);
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

    const availableBudget = availableCampaignBudget(campaign);
    if (availableBudget !== null && discountAmount > availableBudget) {
      throw conflict(CHECKOUT_BUDGET_EXHAUSTED_MESSAGE);
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
      if (voucher.status === "EXPIRED") {
        throw badRequest(
          campaignUnavailableMessage(voucher.campaign, { checkout: true }),
        );
      }
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
    if (product.moderatedAt || product.status === "removed") {
      throw badRequest("product is unavailable due to moderation");
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
      throw badRequest(
        campaignUnavailableMessage(campaign, { checkout: true }),
      );
    }
    if (now < new Date(campaign.startsAt)) {
      throw badRequest("คูปองยังไม่เริ่มใช้งาน");
    }
    if (now > new Date(campaign.endsAt)) {
      throw badRequest("คูปองหมดอายุแล้ว");
    }
    if (
      availableCampaignBudget(campaign) !== null &&
      availableCampaignBudget(campaign) <= 0
    ) {
      throw badRequest(CHECKOUT_BUDGET_EXHAUSTED_MESSAGE);
    }
    if (campaign.minOrderPrice && product.price < campaign.minOrderPrice) {
      throw badRequest(
        `minimum order price of ฿${campaign.minOrderPrice.toLocaleString("th-TH")} required`,
      );
    }
    if (campaign.applicableCategory && product.category) {
      if (
        !(product.categories || [product.category]).some(
          (name) =>
            name.trim().toLowerCase() ===
            campaign.applicableCategory.trim().toLowerCase(),
        )
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

    const availableBudget = availableCampaignBudget(campaign);
    if (availableBudget !== null && discountAmount > availableBudget) {
      throw conflict(CHECKOUT_BUDGET_EXHAUSTED_MESSAGE);
    }

    // 5. Concurrency protection: Atomic Hold
    const reservation = repository.reserveVoucherBudget
      ? await repository.reserveVoucherBudget({
          userId,
          campaignId,
          orderId,
          discountAmount,
        })
      : {
          held: await repository.holdVoucherWithLock({
            userId,
            campaignId,
            orderId,
          }),
        };
    if (!reservation.held) {
      if (reservation.reason === "BUDGET_EXHAUSTED") {
        throw conflict(CHECKOUT_BUDGET_EXHAUSTED_MESSAGE);
      }
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
