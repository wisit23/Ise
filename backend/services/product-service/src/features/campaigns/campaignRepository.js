const prisma = require("../../models/prismaClient");
const { recordAudit } = require("../audit/marketingAuditRepository");
const { lockCampaign } = require("./campaignBudget");

/**
 * Database access for the Campaign and Voucher Wallet feature.
 * Layering: route -> controller -> service -> repository -> PostgreSQL (reloop_product).
 */
function createCampaignRepository(prismaClient) {
  const SERIALIZABLE_RETRY_LIMIT = 3;

  function transaction(fn) {
    return prismaClient.$transaction(fn);
  }

  async function serializableTransaction(fn) {
    let lastError;
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await prismaClient.$transaction(fn, {
          isolationLevel: "Serializable",
        });
      } catch (error) {
        lastError = error;
        if (error?.code !== "P2034" || attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  function isBudgetUnavailable(campaign) {
    if (campaign.budget === null || campaign.budget === undefined) return false;
    const spentBudget = Number(campaign.spentBudget || 0);
    const reservedBudget = Number(campaign.reservedBudget || 0);
    if (spentBudget >= campaign.budget) return true;
    return (
      campaign.discountType === "FIXED" &&
      reservedBudget === 0 &&
      campaign.budget - spentBudget < Number(campaign.discountValue)
    );
  }

  async function endCampaignForBudget(tx, campaign) {
    if (!campaign || campaign.status === "ended" || !isBudgetUnavailable(campaign)) {
      return campaign;
    }
    const endedCampaign = await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "ended",
        endedAt: new Date(),
        endReason: "BUDGET_EXHAUSTED",
      },
    });
    await tx.userVoucher.updateMany({
      where: { campaignId: campaign.id, status: "CLAIMED", usedOrderId: null },
      data: { status: "EXPIRED" },
    });
    await recordAudit(
      {
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        action: "CAMPAIGN_END",
        entityType: "CAMPAIGN",
        entityId: campaign.id,
        previousState: campaign,
        newState: endedCampaign,
        metadata: { reason: "BUDGET_EXHAUSTED" },
        idempotencyKey: `CAMPAIGN_END_BUDGET:${campaign.id}`,
      },
      { tx },
    );
    return endedCampaign;
  }

  async function createCampaign(data, { tx } = {}) {
    const client = tx || prismaClient;
    const campaign = await client.campaign.create({
      data,
    });
    return {
      ...campaign,
      claimedCount: campaign.usedCount ?? 0,
      redeemedCount: 0,
    };
  }

  async function findById(id, { tx } = {}) {
    const client = tx || prismaClient;
    const campaign = await client.campaign.findUnique({
      where: { id },
      include: {
        _count: {
          select: { vouchers: true, audience: true },
        },
      },
    });
    if (!campaign) return null;

    let redeemedCount = 0;
    try {
      redeemedCount = await client.userVoucher.count({
        where: {
          campaignId: id,
          status: "USED",
        },
      });
    } catch {
      redeemedCount = 0;
    }

    return {
      ...campaign,
      claimedCount: campaign.usedCount ?? (campaign._count?.vouchers || 0),
      redeemedCount,
      audienceSize: campaign._count?.audience || 0,
    };
  }

  async function findByCode(code, { tx } = {}) {
    const client = tx || prismaClient;
    return client.campaign.findUnique({ where: { code } });
  }

  async function updateCampaign(id, data, { tx } = {}) {
    const client = tx || prismaClient;
    return client.campaign.update({ where: { id }, data });
  }

  async function deleteCampaign(id, { tx } = {}) {
    const client = tx || prismaClient;
    return client.campaign.delete({
      where: { id },
    });
  }

  async function autoExpireCampaigns(now = new Date()) {
    try {
      const expiredCampaigns = await prismaClient.campaign.findMany({
        where: {
          status: "published",
          endsAt: { lt: now },
        },
      });

      let count = 0;
      for (const camp of expiredCampaigns) {
        await prismaClient.$transaction(async (tx) => {
          const updated = await tx.campaign.update({
            where: { id: camp.id },
            data: {
              status: "ended",
              endedAt: now,
              endReason: "EXPIRED",
            },
          });
          await tx.userVoucher.updateMany({
            where: {
              status: "CLAIMED",
              campaignId: camp.id,
              usedOrderId: null,
            },
            data: { status: "EXPIRED" },
          });
          await recordAudit(
            {
              actorId: "SYSTEM",
              actorRole: "SYSTEM",
              action: "CAMPAIGN_END",
              entityType: "CAMPAIGN",
              entityId: camp.id,
              previousState: camp,
              newState: updated,
              metadata: { reason: "EXPIRED" },
              idempotencyKey: `CAMPAIGN_END:${camp.id}`,
            },
            { tx },
          );
        });
        count++;
      }

      return count;
    } catch (err) {
      console.warn("[product-service] autoExpireCampaigns error:", err.message);
      return 0;
    }
  }

  async function listCampaigns({ status, search, skip = 0, take = 20 }) {
    await autoExpireCampaigns();

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const now = new Date();
    let publishedPromise;
    let pendingPromise;

    if (status === "published") {
      publishedPromise = prismaClient.campaign.count({
        where: {
          ...where,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      });
      pendingPromise = Promise.resolve(0);
    } else if (status === "pending_approval") {
      publishedPromise = Promise.resolve(0);
      pendingPromise = Promise.resolve(null);
    } else if (status) {
      publishedPromise = Promise.resolve(0);
      pendingPromise = Promise.resolve(0);
    } else {
      publishedPromise = prismaClient.campaign.count({
        where: {
          ...where,
          status: "published",
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      });
      pendingPromise = prismaClient.campaign.count({
        where: {
          ...where,
          status: "pending_approval",
        },
      });
    }

    const [
      rawItems,
      total,
      pubCount,
      pendCount,
      voucherCount,
      usedCountAgg,
    ] = await Promise.all([
      prismaClient.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          _count: {
            select: { vouchers: true, audience: true },
          },
        },
      }),
      prismaClient.campaign.count({ where }),
      publishedPromise,
      pendingPromise,
      prismaClient.userVoucher
        .count({
          where: {
            campaign: where,
          },
        })
        .catch(() => 0),
      prismaClient.campaign
        .aggregate({
          where,
          _sum: { usedCount: true },
        })
        .catch(() => ({ _sum: { usedCount: 0 } })),
    ]);

    const published = pubCount !== null ? pubCount : 0;
    const pending =
      pendCount !== null ? pendCount : status === "pending_approval" ? total : 0;

    const campaignIds = rawItems.map((c) => c.id);
    let redeemedMap = new Map();
    if (campaignIds.length > 0) {
      try {
        const redeemedCounts = await prismaClient.userVoucher.groupBy({
          by: ["campaignId"],
          where: {
            campaignId: { in: campaignIds },
            status: "USED",
          },
          _count: { id: true },
        });
        redeemedMap = new Map(
          redeemedCounts.map((r) => [r.campaignId, r._count.id]),
        );
      } catch {
        redeemedMap = new Map();
      }
    }

    const items = rawItems.map((c) => ({
      ...c,
      claimedCount: c.usedCount ?? (c._count?.vouchers || 0),
      redeemedCount: redeemedMap.get(c.id) || 0,
      audienceSize: c._count?.audience || 0,
    }));

    const totalClaimed = Math.max(
      voucherCount,
      usedCountAgg?._sum?.usedCount || 0,
    );

    const summary = {
      total,
      published,
      pending,
      totalClaimed,
    };

    return { items, total, summary };
  }

  async function listAvailableCampaigns(now = new Date()) {
    await autoExpireCampaigns(now);

    const campaigns = await prismaClient.campaign.findMany({
      where: { status: "published", startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { createdAt: "desc" },
    });
    return campaigns;
  }

  function createVoucher({ campaignId, userId }) {
    return prismaClient.userVoucher.create({
      data: {
        campaignId,
        userId,
        status: "CLAIMED",
      },
      include: {
        campaign: true,
      },
    });
  }

  async function findVoucher(userId, campaignId) {
    return prismaClient.userVoucher.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      include: { campaign: true },
    });
  }

  async function listUserVouchers(userId, { status } = {}) {
    await autoExpireCampaigns();
    const vouchers = await prismaClient.userVoucher.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        campaign: true,
      },
      orderBy: { claimedAt: "desc" },
    });
    return vouchers;
  }

  function incrementUsedCount(campaignId) {
    return prismaClient.campaign.update({
      where: { id: campaignId },
      data: {
        usedCount: { increment: 1 },
      },
    });
  }

  function holdVoucher({ userId, campaignId, orderId }) {
    return prismaClient.userVoucher.update({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      data: {
        usedOrderId: orderId,
      },
      include: {
        campaign: true,
      },
    });
  }

  async function reserveVoucherBudget({
    userId,
    campaignId,
    orderId,
    discountAmount,
  }) {
    return serializableTransaction(async (tx) => {
      const voucher = await tx.userVoucher.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
      });
      if (!voucher || voucher.status !== "CLAIMED") {
        return { held: false, reason: "VOUCHER_UNAVAILABLE" };
      }

      const reservedDiscount = Number(voucher.reservedDiscount || 0);
      if (voucher.usedOrderId === orderId && reservedDiscount === discountAmount) {
        const existing = await tx.userVoucher.findUnique({
          where: { userId_campaignId: { userId, campaignId } },
          include: { campaign: true },
        });
        return { held: true, voucher: existing, deduplicated: true };
      }
      if (voucher.usedOrderId && voucher.usedOrderId !== orderId) {
        return { held: false, reason: "VOUCHER_HELD" };
      }
      if (reservedDiscount > 0 && reservedDiscount !== discountAmount) {
        return { held: false, reason: "RESERVATION_MISMATCH" };
      }

      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign || campaign.status !== "published") {
        return { held: false, reason: "CAMPAIGN_INACTIVE" };
      }
      const spentBudget = Number(campaign.spentBudget || 0);
      const campaignReservedBudget = Number(campaign.reservedBudget || 0);
      if (
        campaign.budget !== null &&
        campaign.budget !== undefined &&
        spentBudget + campaignReservedBudget + discountAmount > campaign.budget
      ) {
        await endCampaignForBudget(tx, campaign);
        return { held: false, reason: "BUDGET_EXHAUSTED" };
      }

      await tx.userVoucher.update({
        where: { userId_campaignId: { userId, campaignId } },
        data: {
          usedOrderId: orderId,
          reservedDiscount: discountAmount,
        },
      });
      if (discountAmount > 0) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: { reservedBudget: { increment: discountAmount } },
        });
      }
      const heldVoucher = await tx.userVoucher.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        include: { campaign: true },
      });
      return { held: true, voucher: heldVoucher };
    });
  }

  async function releaseVoucher({ userId, campaignId, orderId }) {
    return serializableTransaction(async (tx) => {
      const voucher = await tx.userVoucher.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
      });
      if (!voucher) return null;
      if (
        voucher.status !== "CLAIMED" ||
        (orderId && voucher.usedOrderId !== orderId)
      ) {
        return tx.userVoucher.findUnique({
          where: { userId_campaignId: { userId, campaignId } },
          include: { campaign: true },
        });
      }

      const reservedDiscount = Number(voucher.reservedDiscount || 0);
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      await tx.userVoucher.update({
        where: { userId_campaignId: { userId, campaignId } },
        data: {
          usedOrderId: null,
          reservedDiscount: 0,
          ...(campaign?.status === "ended" ? { status: "EXPIRED" } : {}),
        },
      });
      if (reservedDiscount > 0) {
        const updatedCampaign = await tx.campaign.update({
          where: { id: campaignId },
          data: { reservedBudget: { decrement: reservedDiscount } },
        });
        await endCampaignForBudget(tx, updatedCampaign);
      }
      return tx.userVoucher.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        include: { campaign: true },
      });
    });
  }

  async function completeVoucher({
    userId,
    campaignId,
    orderId,
    discountAmount = 0,
  }) {
    return serializableTransaction(async (tx) => {
      const voucher = await tx.userVoucher.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
      });
      if (!voucher) return null;
      if (voucher.status === "USED") {
        return tx.userVoucher.findUnique({
          where: { userId_campaignId: { userId, campaignId } },
          include: { campaign: true },
        });
      }
      if (voucher.status !== "CLAIMED" || voucher.usedOrderId !== orderId) {
        return null;
      }

      const reservedDiscount = Number(voucher.reservedDiscount || 0);
      const committedDiscount = reservedDiscount || Number(discountAmount || 0);
      const campaign = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          ...(reservedDiscount > 0
            ? { reservedBudget: { decrement: reservedDiscount } }
            : {}),
          ...(committedDiscount > 0
            ? { spentBudget: { increment: committedDiscount } }
            : {}),
        },
      });
      const completedVoucher = await tx.userVoucher.update({
        where: { userId_campaignId: { userId, campaignId } },
        data: {
          status: "USED",
          usedAt: new Date(),
          usedOrderId: orderId,
          reservedDiscount: 0,
        },
        include: { campaign: true },
      });

      await endCampaignForBudget(tx, campaign);
      return completedVoucher;
    });
  }

  async function findProduct(productId) {
    const product = await prismaClient.product.findUnique({
      where: { deletedAt: null, id: productId },
      include: { categoryLinks: { where: { deletedAt: null }, include: { category: true } } },
    });
    if (!product) return product;
    const { categoryLinks, ...fields } = product;
    return { ...fields, categories: categoryLinks.map((link) => link.category.name) };
  }

  async function holdVoucherWithLock({ userId, campaignId, orderId }) {
    const res = await prismaClient.userVoucher.updateMany({
      where: {
        userId,
        campaignId,
        status: "CLAIMED",
        OR: [{ usedOrderId: null }, { usedOrderId: orderId }],
      },
      data: {
        usedOrderId: orderId,
      },
    });
    return res.count > 0;
  }

  async function claimVoucherAtomic({ userId, campaignId, usageLimit }) {
    return prismaClient.$transaction(async (tx) => {
      await lockCampaign(tx, campaignId);
      const existing = await tx.userVoucher.findUnique({
        where: {
          userId_campaignId: { userId, campaignId },
        },
      });
      if (existing) {
        const err = new Error("voucher already claimed by user");
        err.statusCode = 409;
        throw err;
      }

      const camp = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!camp || camp.status !== "published") {
        const err = new Error(
          camp?.endReason === "BUDGET_EXHAUSTED"
            ? "วงเงินส่วนลดของคูปองนี้ถูกใช้ครบแล้ว"
            : camp?.endReason === "ADMIN_CLOSED"
              ? "คูปองถูกปิดโดยผู้ดูแล"
              : "คูปองหมดอายุแล้ว",
        );
        err.statusCode = 409;
        throw err;
      }
      if (
        camp.budget !== null &&
        camp.budget !== undefined &&
        Number(camp.spentBudget || 0) + Number(camp.reservedBudget || 0) >=
          camp.budget
      ) {
        const err = new Error("วงเงินส่วนลดของคูปองนี้ถูกใช้ครบแล้ว");
        err.statusCode = 409;
        throw err;
      }

      const where = { id: campaignId, status: "published" };
      if (usageLimit !== null && usageLimit !== undefined) {
        where.usedCount = { lt: usageLimit };
      }

      const updateResult = await tx.campaign.updateMany({
        where,
        data: {
          usedCount: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const err = new Error("สิทธิ์คูปองถูกใช้ครบแล้ว");
        err.statusCode = 409;
        throw err;
      }

      return tx.userVoucher.create({
        data: { campaignId, userId, status: "CLAIMED" },
        include: { campaign: true },
      });
    });
  }

  async function expireClaimedVouchers(campaignId, { tx } = {}) {
    const client = tx || prismaClient;
    return client.userVoucher.updateMany({
      where: {
        campaignId,
        status: "CLAIMED",
        usedOrderId: null,
      },
      data: {
        status: "EXPIRED",
      },
    });
  }

  return {
    transaction,
    createCampaign,
    findById,
    findByCode,
    updateCampaign,
    deleteCampaign,
    listCampaigns,
    listAvailableCampaigns,
    autoExpireCampaigns,
    expireClaimedVouchers,
    createVoucher,
    findVoucher,
    listUserVouchers,
    incrementUsedCount,
    claimVoucherAtomic,
    holdVoucher,
    holdVoucherWithLock,
    reserveVoucherBudget,
    releaseVoucher,
    completeVoucher,
    findProduct,
  };
}

module.exports = createCampaignRepository(prisma);
module.exports.createCampaignRepository = createCampaignRepository;
