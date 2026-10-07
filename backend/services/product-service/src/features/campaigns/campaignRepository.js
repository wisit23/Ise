const prisma = require("../../models/prismaClient");
const { recordAudit } = require("../audit/marketingAuditRepository");

/**
 * Database access for the Campaign and Voucher Wallet feature.
 * Layering: route -> controller -> service -> repository -> PostgreSQL (reloop_product).
 */
function createCampaignRepository(prismaClient) {
  function transaction(fn) {
    return prismaClient.$transaction(fn);
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
          select: { vouchers: true },
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
    };
  }

  function findByCode(code, { tx } = {}) {
    const client = tx || prismaClient;
    return client.campaign.findUnique({
      where: { code },
    });
  }

  function updateCampaign(id, data, { tx } = {}) {
    const client = tx || prismaClient;
    return client.campaign.update({
      where: { id },
      data,
    });
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
            data: { status: "ended" },
          });
          await tx.userVoucher.updateMany({
            where: {
              status: "CLAIMED",
              campaignId: camp.id,
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

    const [rawItems, total] = await Promise.all([
      prismaClient.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          _count: {
            select: { vouchers: true },
          },
        },
      }),
      prismaClient.campaign.count({ where }),
    ]);

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
    }));

    return { items, total };
  }

  async function listAvailableCampaigns(now = new Date()) {
    await autoExpireCampaigns(now);

    return prismaClient.campaign.findMany({
      where: {
        status: "published",
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    });
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

  function findVoucher(userId, campaignId) {
    return prismaClient.userVoucher.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      include: {
        campaign: true,
      },
    });
  }

  async function listUserVouchers(userId, { status } = {}) {
    await autoExpireCampaigns();
    return prismaClient.userVoucher.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        campaign: true,
      },
      orderBy: { claimedAt: "desc" },
    });
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

  async function releaseVoucher({ userId, campaignId, orderId }) {
    const voucher = await findVoucher(userId, campaignId);
    if (!voucher) return null;
    if (
      voucher.status === "CLAIMED" &&
      (voucher.usedOrderId === orderId || !orderId)
    ) {
      return prismaClient.userVoucher.update({
        where: {
          userId_campaignId: {
            userId,
            campaignId,
          },
        },
        data: {
          usedOrderId: null,
        },
        include: {
          campaign: true,
        },
      });
    }
    return voucher;
  }

  function completeVoucher({ userId, campaignId, orderId }) {
    return prismaClient.userVoucher.update({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedOrderId: orderId || undefined,
      },
      include: {
        campaign: true,
      },
    });
  }

  function findProduct(productId) {
    return prismaClient.product.findUnique({
      where: { id: productId },
    });
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

      const where = { id: campaignId };
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
        const err = new Error("campaign usage limit reached");
        err.statusCode = 409;
        throw err;
      }

      return tx.userVoucher.create({
        data: {
          campaignId,
          userId,
          status: "CLAIMED",
        },
        include: {
          campaign: true,
        },
      });
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
    createVoucher,
    findVoucher,
    listUserVouchers,
    incrementUsedCount,
    claimVoucherAtomic,
    holdVoucher,
    holdVoucherWithLock,
    releaseVoucher,
    completeVoucher,
    findProduct,
  };
}

module.exports = createCampaignRepository(prisma);
module.exports.createCampaignRepository = createCampaignRepository;
