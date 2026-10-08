const { badRequest, conflict } = require("@reloop/shared");
const defaultPrisma = require("../../models/prismaClient");
const { recordAudit } = require("../audit/marketingAuditRepository");

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

    const grossAmount =
      parseInt(
        payload.grossAmount !== undefined
          ? payload.grossAmount
          : event.grossAmount,
        10,
      ) || 0;
    const discountAmount =
      parseInt(
        payload.discountAmount !== undefined
          ? payload.discountAmount
          : event.discountAmount,
        10,
      ) || 0;
    const rawNet =
      payload.netAmount !== undefined && payload.netAmount !== null
        ? payload.netAmount
        : event.netAmount !== undefined && event.netAmount !== null
          ? event.netAmount
          : undefined;
    const netAmount =
      rawNet !== undefined
        ? parseInt(rawNet, 10)
        : Math.max(0, grossAmount - discountAmount);

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

      const runTx =
        typeof prismaClient.$transaction === "function"
          ? (fn) => prismaClient.$transaction(fn)
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

          // Atomic budget increment and threshold check
          if (campaignId && tx.campaign) {
            const camp = await tx.campaign.findUnique({
              where: { id: campaignId },
            });
            if (camp) {
              const updated = await tx.campaign.update({
                where: { id: campaignId },
                data: {
                  spentBudget: { increment: discountAmount },
                },
              });

              // Check if budget reached
              if (
                updated.budget !== null &&
                updated.budget !== undefined &&
                updated.spentBudget >= updated.budget &&
                updated.status !== "ended"
              ) {
                const endedCampaign = await tx.campaign.update({
                  where: { id: campaignId },
                  data: { status: "ended" },
                });

                if (tx.userVoucher) {
                  await tx.userVoucher.updateMany({
                    where: {
                      campaignId,
                      status: "CLAIMED",
                    },
                    data: { status: "EXPIRED" },
                  });
                }

                await recordAudit(
                  {
                    actorId: "SYSTEM",
                    actorRole: "SYSTEM",
                    action: "CAMPAIGN_END",
                    entityType: "CAMPAIGN",
                    entityId: campaignId,
                    previousState: updated,
                    newState: endedCampaign,
                    metadata: { reason: "BUDGET_REACHED" },
                    idempotencyKey: `CAMPAIGN_END_BUDGET:${campaignId}`,
                  },
                  { tx },
                );
              }
            }
          }

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

    if (campaignId && prismaClient && prismaClient.campaign) {
      if (typeof prismaClient.campaign.findUnique === "function") {
        const camp = await prismaClient.campaign.findUnique({
          where: { id: campaignId },
        });
        if (camp) {
          camp.spentBudget = (camp.spentBudget || 0) + discountAmount;
          if (
            camp.budget !== null &&
            camp.budget !== undefined &&
            camp.spentBudget >= camp.budget &&
            camp.status !== "ended"
          ) {
            camp.status = "ended";
            if (
              prismaClient.userVoucher &&
              typeof prismaClient.userVoucher.updateMany === "function"
            ) {
              await prismaClient.userVoucher.updateMany({
                where: { campaignId, status: "CLAIMED" },
                data: { status: "EXPIRED" },
              });
            }
          }
        }
      }
    }

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
        if (toDate) where.completedAt.lte = toDate;
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
      facts = facts.filter((f) => new Date(f.completedAt) <= toDate);
    }
    return facts;
  }

  async function getCampaignMetrics({ campaign, campaignId, from, to }) {
    const { fromDate, toDate } = validateDateRange(from, to);

    const targetId = campaignId || campaign?.id;
    if (!targetId) throw badRequest("campaignId is required");

    let camp = campaign;
    if (!camp && prismaClient && prismaClient.campaign) {
      try {
        camp = await prismaClient.campaign.findUnique({
          where: { id: targetId },
          include: { _count: { select: { vouchers: true } } },
        });
      } catch {
        camp = null;
      }
    }

    const facts = await getAttributionFacts({
      campaignId: targetId,
      fromDate,
      toDate,
    });

    const completedOrders = facts.length;
    const grossRevenue = facts.reduce((sum, f) => sum + f.grossAmount, 0);
    const totalDiscount = facts.reduce((sum, f) => sum + f.discountAmount, 0);
    const netRevenue = facts.reduce((sum, f) => sum + f.netAmount, 0);

    const claimedCount = camp?.usedCount ?? (camp?._count?.vouchers || 0);
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

    if (prismaClient && prismaClient.campaign) {
      try {
        const camps = await prismaClient.campaign.findMany({
          select: { usedCount: true },
        });
        totalCampaigns = camps.length;
        totalClaimed = camps.reduce((s, c) => s + (c.usedCount || 0), 0);
      } catch {
        totalCampaigns = 0;
        totalClaimed = 0;
      }
    }

    const completedOrders = facts.length;
    const grossRevenue = facts.reduce((sum, f) => sum + f.grossAmount, 0);
    const totalDiscount = facts.reduce((sum, f) => sum + f.discountAmount, 0);
    const netRevenue = facts.reduce((sum, f) => sum + f.netAmount, 0);
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
      existing.grossRevenue += fact.grossAmount;
      existing.totalDiscount += fact.discountAmount;
      existing.netRevenue += fact.netAmount;
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
        try {
          const all = await prismaClient.campaign.findMany({
            select: { id: true },
            take: 20,
          });
          ids = all.map((c) => c.id);
        } catch {
          ids = [];
        }
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
    getCampaignComparison,
    resetMemory,
  };
}

module.exports = createCampaignMetricsService();
module.exports.createCampaignMetricsService = createCampaignMetricsService;
