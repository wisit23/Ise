const { badRequest, conflict } = require("@reloop/shared");
const defaultPrisma = require("../../models/prismaClient");

function createCampaignMetricsService(
  prismaClient = defaultPrisma,
  options = {},
) {
  // In-memory storage is strictly reserved for explicitly injected unit-test adapters:
  // requires options.isTestAdapter === true or options.inMemory === true (or prismaClient explicitly flagged).
  // Neither defaultPrisma nor custom clients automatically fall back to memory based on client identity.
  const isExplicitTestAdapter =
    options.isTestAdapter === true ||
    options.inMemory === true ||
    Boolean(
      prismaClient &&
      (prismaClient.isTestAdapter || prismaClient._isTestAdapter),
    );
  const isProductionPath = !isExplicitTestAdapter;

  const memoryAttributions = new Map();

  function hasPrismaAttributionModel(client) {
    return Boolean(
      client &&
      client.campaignAttribution &&
      typeof client.campaignAttribution.findFirst === "function" &&
      typeof client.campaignAttribution.create === "function",
    );
  }

  function assertProductionPrismaModel() {
    if (isProductionPath && !hasPrismaAttributionModel(prismaClient)) {
      throw new Error(
        "campaignAttribution model is required on Prisma client in production path",
      );
    }
  }

  function validateDateRange(from, to) {
    let fromDate = null;
    let toDate = null;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        throw badRequest("invalid 'from' date format");
      }
    }
    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        throw badRequest("invalid 'to' date format");
      }
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw badRequest("'from' date cannot be after 'to' date");
    }

    return { fromDate, toDate };
  }

  async function recordOrderCompletedEvent(event) {
    if (!event) {
      throw badRequest("event is required");
    }

    assertProductionPrismaModel();

    // Support both flattened payload and standard envelope ({ eventId, eventType, payload: { ... } })
    const payload = event.payload || event;
    const eventId = event.eventId || payload.eventId;
    const orderId = payload.orderId || event.aggregateId || event.orderId;
    const campaignId =
      payload.campaignId !== undefined ? payload.campaignId : event.campaignId;

    if (!eventId || !orderId) {
      throw badRequest("eventId and orderId are required");
    }

    // If no campaign attached to this completed order, it is not an attribution fact
    if (!campaignId) {
      return { recorded: false, reason: "no_campaign" };
    }

    function amount(value,label){
      if(value===undefined || value===null || !/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw badRequest(label+" must be a non-negative baht amount with at most two decimal places");
      const n=Number(value);if(!Number.isFinite(n)||n>9999999999.99)throw badRequest(label+" exceeds supported money range");return n;
    }
    const grossAmount=amount(payload.grossAmount ?? event.grossAmount,"grossAmount");
    const discountAmount=amount(payload.discountAmount ?? event.discountAmount ?? 0,"discountAmount");
    const netAmount=amount(payload.netAmount ?? event.netAmount ?? (Math.round(grossAmount*100)-Math.round(discountAmount*100))/100,"netAmount");
    function assertBalances(){if(Math.round(discountAmount*100)>Math.round(grossAmount*100) || Math.round(netAmount*100)!==Math.round(grossAmount*100)-Math.round(discountAmount*100))throw badRequest("campaign attribution amounts do not reconcile");}

    const rawCompletedAt =
      payload.completedAt || event.occurredAt || event.completedAt;
    const hasExplicitCompletedAt = Boolean(rawCompletedAt);
    const completedAt = rawCompletedAt ? new Date(rawCompletedAt) : new Date();

    function assertMatchingAttribution(existing, incoming) {
      // 1. Identity conflict: Reusing existing eventId with different orderId is 409
      // even when all monetary fields match.
      if (
        existing.eventId === incoming.eventId &&
        existing.orderId !== incoming.orderId
      ) {
        throw conflict(
          `Campaign attribution conflict: eventId "${incoming.eventId}" is already associated with orderId "${existing.orderId}", cannot reuse with orderId "${incoming.orderId}"`,
        );
      }

      // 2. Monetary & immutable attribution attributes check
      const isMatch =
        existing.campaignId === incoming.campaignId &&
        Number(existing.grossAmount) === Number(incoming.grossAmount) &&
        Number(existing.discountAmount) === Number(incoming.discountAmount) &&
        Number(existing.netAmount) === Number(incoming.netAmount) &&
        (!hasExplicitCompletedAt ||
          !existing.completedAt ||
          new Date(existing.completedAt).getTime() ===
            new Date(incoming.completedAt).getTime());

      if (!isMatch) {
        throw conflict(
          `Campaign attribution conflict for order "${incoming.orderId}" or event "${incoming.eventId}": incoming attribution fields do not match existing immutable attribution`,
        );
      }
    }

    const incomingAttributes = {
      orderId,
      eventId,
      campaignId,
      grossAmount,
      discountAmount,
      netAmount,
      completedAt,
    };

    // 1. Persistent PostgreSQL Path (Production & Integration Tests)
    if (hasPrismaAttributionModel(prismaClient)) {
      // Check existing by eventId or orderId for idempotent deduplication before transaction
      const existing = await prismaClient.campaignAttribution.findFirst({
        where: {
          OR: [{ eventId }, { orderId }],
        },
      });
      if (existing) {
        assertMatchingAttribution(existing, incomingAttributes);
        return { recorded: true, deduplicated: true, fact: existing };
      }

      assertBalances();
      const runTx =
        typeof prismaClient.$transaction === "function"
          ? (fn) => prismaClient.$transaction(fn, { maxWait: 10_000 })
          : (fn) => fn(prismaClient);

      try {
        const txResult = await runTx(async (tx) => {
          // Re-check existing in tx for race safety
          const inTxExisting = await tx.campaignAttribution.findFirst({
            where: {
              OR: [{ eventId }, { orderId }],
            },
          });
          if (inTxExisting) {
            assertMatchingAttribution(inTxExisting, incomingAttributes);
            return { recorded: true, deduplicated: true, fact: inTxExisting };
          }

          const fact = await tx.campaignAttribution.create({
            data: {
              eventId,
              orderId,
              campaignId,
              grossAmount,
              discountAmount,
              netAmount,
              completedAt,
            },
          });

          // Budget is committed when payment succeeds in completeVoucher.
          // Attribution may arrive later and must never charge the budget twice.

          return { recorded: true, fact };
        });

        return txResult;
      } catch (err) {
        if (err.code === "P2002") {
          // Unique constraint race: retrieve the existing fact
          const raceExisting = await prismaClient.campaignAttribution.findFirst(
            {
              where: {
                OR: [{ eventId }, { orderId }],
              },
            },
          );
          if (raceExisting) {
            assertMatchingAttribution(raceExisting, incomingAttributes);
            return { recorded: true, deduplicated: true, fact: raceExisting };
          }
        }
        // Do NOT swallow DB errors in live DB mode: propagate so caller/outbox retries
        throw err;
      }
    }

    // 2. In-memory store fallback (only for explicitly injected test adapters)
    for (const item of memoryAttributions.values()) {
      if (item.eventId === eventId || item.orderId === orderId) {
        assertMatchingAttribution(item, incomingAttributes);
        return { recorded: true, deduplicated: true, fact: item };
      }
    }

    assertBalances();
    const factRecord = {
      eventId,
      orderId,
      campaignId,
      grossAmount,
      discountAmount,
      netAmount,
      completedAt,
    };
    memoryAttributions.set(eventId, factRecord);

    return { recorded: true, fact: factRecord };
  }

  async function getAttributionFacts({
    campaignId = null,
    fromDate = null,
    toDate = null,
  } = {}) {
    if (hasPrismaAttributionModel(prismaClient)) {
      const where = {};
      if (campaignId) where.campaignId = campaignId;
      if (fromDate || toDate) {
        where.completedAt = {};
        if (fromDate) where.completedAt.gte = fromDate;
        if (toDate) where.completedAt.lt = toDate;
      }
      return prismaClient.campaignAttribution.findMany({
        where,
        orderBy: { completedAt: "asc" },
      });
    }

    assertProductionPrismaModel();

    // In-memory query fallback (only for explicitly injected test adapters)
    let facts = Array.from(memoryAttributions.values());
    if (campaignId) {
      facts = facts.filter((f) => f.campaignId === campaignId);
    }
    if (fromDate) {
      facts = facts.filter((f) => new Date(f.completedAt) >= fromDate);
    }
    if (toDate) {
      facts = facts.filter((f) => new Date(f.completedAt) < toDate);
    }
    return facts;
  }

  async function getCampaignMetrics({ campaign, campaignId, from, to }) {
    const { fromDate, toDate } = validateDateRange(from, to);

    const targetId = campaignId || campaign?.id;
    if (!targetId) throw badRequest("campaignId is required");

    let camp = campaign;
    if (!camp && prismaClient && prismaClient.campaign) {
      camp = await prismaClient.campaign.findUnique({
        where: { id: targetId },
        include: { _count: { select: { vouchers: true } } },
      });
    }

    const facts = await getAttributionFacts({
      campaignId: targetId,
      fromDate,
      toDate,
    });

    const completedOrders = facts.length;
    const grossRevenue = facts.reduce((sum, f) => sum + Math.round(Number(f.grossAmount)*100), 0)/100;
    const totalDiscount = facts.reduce((sum, f) => sum + Math.round(Number(f.discountAmount)*100), 0)/100;
    const netRevenue = facts.reduce((sum, f) => sum + Math.round(Number(f.netAmount)*100), 0)/100;

    let claimedCount = camp?.usedCount ?? (camp?._count?.vouchers || 0);
    if ((fromDate || toDate) && prismaClient?.userVoucher?.count) {
      const claimedAt = {};
      if (fromDate) claimedAt.gte = fromDate;
      if (toDate) claimedAt.lt = toDate;
      claimedCount = await prismaClient.userVoucher.count({
        where: { campaignId: targetId, claimedAt },
      });
    }
    const redeemedCount = completedOrders;
    const conversionRate =
      claimedCount > 0
        ? Number(((redeemedCount / claimedCount) * 100).toFixed(2))
        : 0;

    return {
      campaignId: targetId,
      campaignCode: camp?.code || null,
      campaignName: camp?.name || null,
      claimedCount,
      redeemedCount,
      completedOrders,
      grossRevenue,
      totalDiscount,
      netRevenue,
      conversionRate,
      from: from || null,
      to: to || null,
    };
  }

  async function getOverviewMetrics({ from, to }) {
    const { fromDate, toDate } = validateDateRange(from, to);
    const facts = await getAttributionFacts({ fromDate, toDate });

    let totalCampaigns = 0;
    let totalClaimed = 0;

    if ((fromDate || toDate) && prismaClient?.userVoucher?.count) {
      const claimedAt = {};
      if (fromDate) claimedAt.gte = fromDate;
      if (toDate) claimedAt.lt = toDate;
      totalClaimed = await prismaClient.userVoucher.count({
        where: { claimedAt },
      });
      totalCampaigns = await prismaClient.campaign.count();
    } else if (prismaClient && prismaClient.campaign) {
      const camps = await prismaClient.campaign.findMany({
        select: { usedCount: true },
      });
      totalCampaigns = camps.length;
      totalClaimed = camps.reduce((s, c) => s + (c.usedCount || 0), 0);
    }

    const completedOrders = facts.length;
    const grossRevenue = facts.reduce((sum, f) => sum + Math.round(Number(f.grossAmount)*100), 0)/100;
    const totalDiscount = facts.reduce((sum, f) => sum + Math.round(Number(f.discountAmount)*100), 0)/100;
    const netRevenue = facts.reduce((sum, f) => sum + Math.round(Number(f.netAmount)*100), 0)/100;
    const totalRedeemed = completedOrders;

    const overallConversionRate =
      totalClaimed > 0
        ? Number(((totalRedeemed / totalClaimed) * 100).toFixed(2))
        : 0;

    return {
      totalCampaigns,
      totalClaimed,
      totalRedeemed,
      completedOrders,
      grossRevenue,
      totalDiscount,
      netRevenue,
      overallConversionRate,
      from: from || null,
      to: to || null,
    };
  }

  async function getSalesTrends({ campaignId, from, to }) {
    const { fromDate, toDate } = validateDateRange(from, to);
    const facts = await getAttributionFacts({ campaignId, fromDate, toDate });

    // Group by YYYY-MM-DD
    const dayMap = new Map();
    for (const fact of facts) {
      const dateKey = new Date(fact.completedAt).toISOString().split("T")[0];
      const existing = dayMap.get(dateKey) || {
        date: dateKey,
        completedOrders: 0,
        grossRevenue: 0,
        totalDiscount: 0,
        netRevenue: 0,
      };
      existing.completedOrders += 1;
      existing.grossRevenue = (Math.round(existing.grossRevenue*100)+Math.round(Number(fact.grossAmount)*100))/100;
      existing.totalDiscount = (Math.round(existing.totalDiscount*100)+Math.round(Number(fact.discountAmount)*100))/100;
      existing.netRevenue = (Math.round(existing.netRevenue*100)+Math.round(Number(fact.netAmount)*100))/100;
      dayMap.set(dateKey, existing);
    }

    const series = Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return {
      campaignId: campaignId || null,
      from: from || null,
      to: to || null,
      series,
    };
  }

  async function getAuctionActivityMetrics({ from, to }) {
    const { fromDate, toDate } = validateDateRange(from, to);
    const activityWindow = {};
    if (fromDate) activityWindow.gte = fromDate;
    if (toDate) activityWindow.lt = toDate;
    const hasWindow = fromDate || toDate;

    if (
      !prismaClient?.bid?.findMany ||
      !prismaClient?.product?.findMany ||
      !prismaClient?.auctionItem?.findMany ||
      !prismaClient?.auctionItem?.groupBy
    ) {
      if (isProductionPath) {
        throw new Error(
          "bid, product and auctionItem Prisma models are required for dashboard auction metrics",
        );
      }
      return {
        distinctBidders: 0,
        activeStores: 0,
        statusCounts: {},
        from: from || null,
        to: to || null,
      };
    }

    const [bidders, productSellers, auctionSellers, statusRows] =
      await Promise.all([
        prismaClient.bid.findMany({
          where: hasWindow ? { createdAt: activityWindow } : {},
          distinct: ["bidderId"],
          select: { bidderId: true },
        }),
        prismaClient.product.findMany({
          where: hasWindow ? { createdAt: activityWindow } : {},
          distinct: ["sellerId"],
          select: { sellerId: true },
        }),
        prismaClient.auctionItem.findMany({
          where: hasWindow ? { updatedAt: activityWindow } : {},
          distinct: ["sellerId"],
          select: { sellerId: true },
        }),
        prismaClient.auctionItem.groupBy({
          by: ["status"],
          where: hasWindow ? { updatedAt: activityWindow } : {},
          _count: { _all: true },
        }),
      ]);

    const activeSellerIds = new Set(
      [...productSellers, ...auctionSellers]
        .map((item) => item.sellerId)
        .filter(Boolean),
    );
    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [row.status, row._count?._all || 0]),
    );

    return {
      distinctBidders: bidders.length,
      activeStores: activeSellerIds.size,
      statusCounts,
      from: from || null,
      to: to || null,
    };
  }

  async function getCampaignComparison({ campaignIds, from, to }) {
    validateDateRange(from, to);

    let ids = campaignIds;
    if (typeof ids === "string") {
      ids = ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      // If no campaign IDs given, load all campaigns
      if (prismaClient && prismaClient.campaign) {
        const all = await prismaClient.campaign.findMany({
          select: { id: true },
          take: 20,
        });
        ids = all.map((c) => c.id);
      } else {
        ids = [];
      }
    }

    const comparisons = [];
    for (const id of ids) {
      const metric = await getCampaignMetrics({ campaignId: id, from, to });
      comparisons.push(metric);
    }

    return {
      comparisons,
      from: from || null,
      to: to || null,
    };
  }

  function resetMemory() {
    memoryAttributions.clear();
  }

  return {
    ensureTable: async () => {},
    validateDateRange,
    recordOrderCompletedEvent,
    getAttributionFacts,
    getCampaignMetrics,
    getOverviewMetrics,
    getSalesTrends,
    getAuctionActivityMetrics,
    getCampaignComparison,
    resetMemory,
  };
}

module.exports = createCampaignMetricsService();
module.exports.createCampaignMetricsService = createCampaignMetricsService;
