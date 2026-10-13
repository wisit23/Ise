const prisma = require("../../models/prismaClient");
const { recordAudit } = require("../audit/marketingAuditRepository");
const { lockCampaign, withSpentBudget, withVoucherBudget } = require("./campaignBudget");

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
      ...(await withSpentBudget(client, campaign)),
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
      ...(await withSpentBudget(client, campaign)),
      claimedCount: campaign.usedCount ?? (campaign._count?.vouchers || 0),
      redeemedCount,
    };
  }

  async function findByCode(code, { tx } = {}) {
    const client = tx || prismaClient;
    return withSpentBudget(client, await client.campaign.findUnique({ where: { code } }));
  }

  async function updateCampaign(id, data, { tx } = {}) {
    const client = tx || prismaClient;
    return withSpentBudget(client, await client.campaign.update({ where: { id }, data }));
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

    const items = await Promise.all(rawItems.map(async (c) => ({
      ...(await withSpentBudget(prismaClient, c)),
      claimedCount: c.usedCount ?? (c._count?.vouchers || 0),
      redeemedCount: redeemedMap.get(c.id) || 0,
    })));

    return { items, total };
  }

  async function listAvailableCampaigns(now = new Date()) {
    await autoExpireCampaigns(now);

    const campaigns = await prismaClient.campaign.findMany({
      where: { status: "published", startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(campaigns.map((c) => withSpentBudget(prismaClient, c)));
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
    return withVoucherBudget(prismaClient, await prismaClient.userVoucher.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      include: { campaign: true },
    }));
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
    return Promise.all(vouchers.map((v) => withVoucherBudget(prismaClient, v)));
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

  async function findProduct(productId) {
    const product = await prismaClient.product.findUnique({
      where: { id: productId },
      include: { categoryLinks: { include: { category: true } } },
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

      const camp = await withSpentBudget(tx, await tx.campaign.findUnique({
        where: { id: campaignId },
      }));
      if (!camp || camp.status !== "published") {
        const err = new Error("แคมเปญไม่ได้เปิดใช้งานอยู่");
        err.statusCode = 409;
        throw err;
      }
      if (
        camp.budget !== null &&
        camp.budget !== undefined &&
        camp.spentBudget >= camp.budget
      ) {
        const err = new Error("งบประมาณแคมเปญถูกใช้เต็มจำนวนแล้ว");
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
        const err = new Error("campaign usage limit reached");
        err.statusCode = 409;
        throw err;
      }

      return withVoucherBudget(tx, await tx.userVoucher.create({
        data: { campaignId, userId, status: "CLAIMED" },
        include: { campaign: true },
      }));
    });
  }

  async function expireClaimedVouchers(campaignId, { tx } = {}) {
    const client = tx || prismaClient;
    return client.userVoucher.updateMany({
      where: {
        campaignId,
        status: "CLAIMED",
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
    createVoucher: async (input) => withVoucherBudget(prismaClient, await createVoucher(input)),
    findVoucher,
    listUserVouchers,
    incrementUsedCount,
    claimVoucherAtomic,
    holdVoucher: async (input) => withVoucherBudget(prismaClient, await holdVoucher(input)),
    holdVoucherWithLock,
    releaseVoucher: async (input) => withVoucherBudget(prismaClient, await releaseVoucher(input)),
    completeVoucher: async (input) => withVoucherBudget(prismaClient, await completeVoucher(input)),
    findProduct,
  };
}

module.exports = createCampaignRepository(prisma);
module.exports.createCampaignRepository = createCampaignRepository;
