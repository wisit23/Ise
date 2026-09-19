const { badRequest, notFound } = require("@reloop/shared");
const defaultPrisma = require("../../models/prismaClient");

function createCampaignMetricsService(prismaClient = defaultPrisma) {
  // In-memory store fallback for unit tests and local runs without DB
  const memoryAttributions = new Map();
  let tableEnsured = false;

  async function ensureTable() {
    if (tableEnsured) return;
    if (!prismaClient || typeof prismaClient.$executeRawUnsafe !== "function") {
      tableEnsured = true;
      return;
    }
    try {
      await prismaClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS campaign_attributions (
          event_id VARCHAR(64) PRIMARY KEY,
          order_id VARCHAR(64) UNIQUE NOT NULL,
          campaign_id VARCHAR(64) NOT NULL,
          gross_amount INT NOT NULL,
          discount_amount INT NOT NULL,
          net_amount INT NOT NULL,
          completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_campaign_attr_camp ON campaign_attributions(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_attr_date ON campaign_attributions(completed_at);
      `);
      tableEnsured = true;
    } catch {
      // Ignore if table already exists or DB mock
      tableEnsured = true;
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
    if (!event || !event.eventId || !event.orderId) {
      throw badRequest("eventId and orderId are required");
    }

    // If no campaign attached to this completed order, it is not an attribution fact
    if (!event.campaignId) {
      return { recorded: false, reason: "no_campaign" };
    }

    await ensureTable();

    const grossAmount = parseInt(event.grossAmount, 10) || 0;
    const discountAmount = parseInt(event.discountAmount, 10) || 0;
    const netAmount =
      event.netAmount !== undefined && event.netAmount !== null
        ? parseInt(event.netAmount, 10)
        : Math.max(0, grossAmount - discountAmount);
    const completedAt = event.completedAt ? new Date(event.completedAt) : new Date();

    // 1. In-memory check (for idempotent deduplication in tests)
    for (const item of memoryAttributions.values()) {
      if (item.eventId === event.eventId || item.orderId === event.orderId) {
        return { recorded: true, deduplicated: true, fact: item };
      }
    }

    const factRecord = {
      eventId: event.eventId,
      orderId: event.orderId,
      campaignId: event.campaignId,
      grossAmount,
      discountAmount,
      netAmount,
      completedAt,
    };
    memoryAttributions.set(event.eventId, factRecord);

    // 2. Persist in PostgreSQL
    if (prismaClient && typeof prismaClient.$executeRawUnsafe === "function") {
      try {
        await prismaClient.$executeRawUnsafe(
          `INSERT INTO campaign_attributions 
           (event_id, order_id, campaign_id, gross_amount, discount_amount, net_amount, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (event_id) DO NOTHING;`,
          event.eventId,
          event.orderId,
          event.campaignId,
          grossAmount,
          discountAmount,
          netAmount,
          completedAt,
        );
      } catch (err) {
        console.warn("[campaignMetrics] failed to persist attribution fact:", err.message);
      }
    }

    return { recorded: true, fact: factRecord };
  }

  async function getAttributionFacts({ campaignId = null, fromDate = null, toDate = null } = {}) {
    await ensureTable();

    if (prismaClient && typeof prismaClient.$queryRawUnsafe === "function") {
      try {
        const conditions = [];
        const params = [];
        let pIndex = 1;

        if (campaignId) {
          conditions.push(`campaign_id = $${pIndex++}`);
          params.push(campaignId);
        }
        if (fromDate) {
          conditions.push(`completed_at >= $${pIndex++}`);
          params.push(fromDate);
        }
        if (toDate) {
          conditions.push(`completed_at <= $${pIndex++}`);
          params.push(toDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const rows = await prismaClient.$queryRawUnsafe(
          `SELECT event_id AS "eventId", order_id AS "orderId", campaign_id AS "campaignId",
                  gross_amount AS "grossAmount", discount_amount AS "discountAmount", net_amount AS "netAmount",
                  completed_at AS "completedAt"
           FROM campaign_attributions ${whereClause}
           ORDER BY completed_at ASC;`,
          ...params,
        );
        if (Array.isArray(rows) && rows.length > 0) {
          return rows;
        }
      } catch {
        // Fall back to memory
      }
    }

    // In-memory query fallback
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
    const { fromDate, toDate } = validateDateRange(from, to);

    let ids = campaignIds;
    if (typeof ids === "string") {
      ids = ids.split(",").map((s) => s.trim()).filter(Boolean);
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
    ensureTable,
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
