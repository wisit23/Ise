const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

// Mock live session validation for token fixtures
app.locals.validateAccessSession = async () => {};

const buyerToken = signAccessToken({
  sub: "mkt-pg-buyer-01",
  role: "BUYER",
  displayName: "Buyer Tester",
});

const marketingToken = signAccessToken({
  sub: "mkt-pg-lead-01",
  role: "MARKETING",
  displayName: "Marketing Lead Tester",
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Marketing Server-side Pagination & Pre-pagination Summary Aggregation Suite", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const roundPrefix = `rnd-${runId}`;
  const campPrefix = `cmp-${runId}`;
  const artPrefix = `art-${runId}`;

  // Track created fixtures for deterministic, non-destructive teardown
  const createdRoundIds = [];
  const createdCampaignIds = [];
  const createdArticleIds = [];
  const createdUserVoucherIds = [];

  // Capture baseline counts before creating fixtures
  const baselineRounds = await prisma.auctionRound.count();
  const baselineCampaigns = await prisma.campaign.count();
  const baselineArticles = await prisma.article.count();

  async function cleanupFixtures() {
    try {
      if (createdUserVoucherIds.length > 0) {
        await prisma.userVoucher.deleteMany({
          where: { id: { in: createdUserVoucherIds } },
        });
      }
      if (createdCampaignIds.length > 0) {
        await prisma.userVoucher.deleteMany({
          where: { campaignId: { in: createdCampaignIds } },
        });
        await prisma.campaign.deleteMany({
          where: { id: { in: createdCampaignIds } },
        });
      }
      await prisma.campaign.deleteMany({
        where: { code: { startsWith: campPrefix } },
      });

      if (createdRoundIds.length > 0) {
        await prisma.auctionRound.deleteMany({
          where: { id: { in: createdRoundIds } },
        });
      }
      await prisma.auctionRound.deleteMany({
        where: { title: { startsWith: roundPrefix } },
      });

      if (createdArticleIds.length > 0) {
        await prisma.article.deleteMany({
          where: { id: { in: createdArticleIds } },
        });
      }
      await prisma.article.deleteMany({
        where: { slug: { startsWith: artPrefix } },
      });
    } catch (err) {
      console.warn("Cleanup warning:", err.message);
    }
  }

  t.after(async () => {
    await cleanupFixtures();

    // Verify baseline counts after cleanup: zero residual fixtures and zero data loss
    const afterRounds = await prisma.auctionRound.count();
    const afterCampaigns = await prisma.campaign.count();
    const afterArticles = await prisma.article.count();

    assert.equal(
      afterRounds,
      baselineRounds,
      `Rounds count after cleanup must match baseline (${baselineRounds})`,
    );
    assert.equal(
      afterCampaigns,
      baselineCampaigns,
      `Campaigns count after cleanup must match baseline (${baselineCampaigns})`,
    );
    assert.equal(
      afterArticles,
      baselineArticles,
      `Articles count after cleanup must match baseline (${baselineArticles})`,
    );

    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });

  await cleanupFixtures();

  // 1. RBAC Tests
  await t.test("Auction Rounds: RBAC enforcement", async () => {
    const unauth = await request(app).get("/auctions/rounds");
    assert.equal(unauth.status, 401);

    const forbiddenRes = await request(app)
      .get("/auctions/rounds")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);
  });

  // 2. Auction Rounds Pagination Tests (server-side pagination without assuming empty DB)
  await t.test("Auction Rounds: server-side pagination with 0, 20, 21, and 45 items", async () => {
    // 1. Zero rounds check only if baseline is 0 (isolated context)
    if (baselineRounds === 0) {
      const zeroRes = await request(app)
        .get("/auctions/rounds?page=1&limit=20")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(zeroRes.status, 200);
      assert.equal(zeroRes.body.total, 0);
      assert.equal(zeroRes.body.totalPages, 1);
      assert.equal(zeroRes.body.items.length, 0);
    }

    // 2. Create 20 rounds
    const rounds20 = Array.from({ length: 20 }, (_, i) => ({
      title: `${roundPrefix}-r-${String(i + 1).padStart(2, "0")}`,
      submissionStartsAt: new Date(Date.now() - 3600000 * 24),
      submissionEndsAt: new Date(Date.now() - 3600000 * 12),
      auctionStartsAt: new Date(Date.now() - 3600000 * 12),
      auctionEndsAt: new Date(Date.now() + 3600000 * 24),
    }));
    for (const r of rounds20) {
      const created = await prisma.auctionRound.create({ data: r });
      createdRoundIds.push(created.id);
    }

    const expected20Total = baselineRounds + 20;
    const expected20Pages = Math.ceil(expected20Total / 20);

    const res20 = await request(app)
      .get("/auctions/rounds?page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res20.status, 200);
    assert.equal(res20.body.total, expected20Total);
    assert.equal(res20.body.totalPages, expected20Pages);
    assert.equal(res20.body.items.length, 20);

    // 3. Add 1 more round -> baseline + 21 rounds
    const round21 = await prisma.auctionRound.create({
      data: {
        title: `${roundPrefix}-r-21`,
        submissionStartsAt: new Date(Date.now() - 3600000 * 24),
        submissionEndsAt: new Date(Date.now() - 3600000 * 12),
        auctionStartsAt: new Date(Date.now() - 3600000 * 12),
        auctionEndsAt: new Date(Date.now() + 3600000 * 24),
      },
    });
    createdRoundIds.push(round21.id);

    const expected21Total = baselineRounds + 21;
    const expected21Pages = Math.ceil(expected21Total / 20);

    const res21P1 = await request(app)
      .get("/auctions/rounds?page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res21P1.status, 200);
    assert.equal(res21P1.body.total, expected21Total);
    assert.equal(res21P1.body.totalPages, expected21Pages);
    assert.equal(res21P1.body.items.length, 20);

    const res21P2 = await request(app)
      .get(`/auctions/rounds?page=${expected21Pages}&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res21P2.status, 200);
    assert.equal(res21P2.body.total, expected21Total);
    assert.equal(res21P2.body.totalPages, expected21Pages);
    assert.equal(
      res21P2.body.items.length,
      expected21Total - (expected21Pages - 1) * 20,
    );

    // 4. Add 24 more rounds -> baseline + 45 rounds total
    const rounds24More = Array.from({ length: 24 }, (_, i) => ({
      title: `${roundPrefix}-r-${String(i + 22).padStart(2, "0")}`,
      submissionStartsAt: new Date(Date.now() - 3600000 * 24),
      submissionEndsAt: new Date(Date.now() - 3600000 * 12),
      auctionStartsAt: new Date(Date.now() - 3600000 * 12),
      auctionEndsAt: new Date(Date.now() + 3600000 * 24),
    }));
    for (const r of rounds24More) {
      const created = await prisma.auctionRound.create({ data: r });
      createdRoundIds.push(created.id);
    }

    const expected45Total = baselineRounds + 45;
    const expected45Pages = Math.ceil(expected45Total / 20);

    const res45P1 = await request(app)
      .get("/auctions/rounds?page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res45P1.body.total, expected45Total);
    assert.equal(res45P1.body.totalPages, expected45Pages);
    assert.equal(res45P1.body.items.length, 20);

    const res45P2 = await request(app)
      .get("/auctions/rounds?page=2&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res45P2.body.total, expected45Total);
    assert.equal(res45P2.body.totalPages, expected45Pages);
    assert.equal(res45P2.body.items.length, 20);

    const res45Last = await request(app)
      .get(`/auctions/rounds?page=${expected45Pages}&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(res45Last.body.total, expected45Total);
    assert.equal(res45Last.body.totalPages, expected45Pages);
    assert.equal(
      res45Last.body.items.length,
      expected45Total - (expected45Pages - 1) * 20,
    );

    // 5. Existing caller contract: calling without page/limit returns ALL rounds for dropdowns
    const unpaginatedRes = await request(app)
      .get("/auctions/rounds")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(unpaginatedRes.status, 200);
    assert.equal(unpaginatedRes.body.items.length, expected45Total);
    assert.equal(unpaginatedRes.body.total, expected45Total);
  });

  // 3. Campaigns Summary & Filter Respect Tests
  await t.test("Campaigns: summary cards strictly respect filters and remain accurate across pages", async () => {
    const now = new Date();
    // Create 30 test campaigns with unique campPrefix:
    // 15 published & active (startsAt -1d, endsAt +1d)
    // 5 pending_approval
    // 5 draft
    // 5 ended (startsAt -2d, endsAt -1d)
    const campaignsData = Array.from({ length: 30 }, (_, i) => {
      let status = "draft";
      let startsAt = new Date(now.getTime() - 3600000 * 24);
      let endsAt = new Date(now.getTime() + 3600000 * 24);

      if (i < 15) {
        status = "published";
      } else if (i < 20) {
        status = "pending_approval";
      } else if (i < 25) {
        status = "draft";
      } else {
        status = "ended";
        startsAt = new Date(now.getTime() - 3600000 * 48);
        endsAt = new Date(now.getTime() - 3600000 * 24);
      }

      return {
        code: `${campPrefix}-${String(i + 1).padStart(2, "0")}`,
        name: `Campaign Test ${i + 1}`,
        status,
        discountType: "PERCENT",
        discountValue: 10,
        startsAt,
        endsAt,
        createdById: "mkt-pg-lead-01",
        usedCount: i + 1,
      };
    });

    for (const c of campaignsData) {
      const created = await prisma.campaign.create({ data: c });
      createdCampaignIds.push(created.id);
    }

    // Total claimed vouchers across all 30 test campaigns = sum(1..30) = 465
    const totalClaimedTest = (30 * 31) / 2;

    // 1. Search filter: search=campPrefix (isolates only this test run's 30 campaigns)
    const p1Res = await request(app)
      .get(`/campaigns?search=${campPrefix}&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(p1Res.status, 200);
    assert.equal(p1Res.body.total, 30);
    assert.equal(p1Res.body.totalPages, 2);
    assert.equal(p1Res.body.items.length, 20);
    assert.ok(p1Res.body.summary, "summary must be present in response");
    assert.equal(p1Res.body.summary.total, 30);
    assert.equal(p1Res.body.summary.published, 15);
    assert.equal(p1Res.body.summary.pending, 5);
    assert.equal(p1Res.body.summary.totalClaimed, totalClaimedTest);

    // Page 2: summary must be 100% IDENTICAL to Page 1
    const p2Res = await request(app)
      .get(`/campaigns?search=${campPrefix}&page=2&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(p2Res.status, 200);
    assert.equal(p2Res.body.total, 30);
    assert.equal(p2Res.body.totalPages, 2);
    assert.equal(p2Res.body.items.length, 10);
    assert.equal(p2Res.body.summary.total, p1Res.body.summary.total);
    assert.equal(p2Res.body.summary.published, p1Res.body.summary.published);
    assert.equal(p2Res.body.summary.pending, p1Res.body.summary.pending);
    assert.equal(p2Res.body.summary.totalClaimed, p1Res.body.summary.totalClaimed);

    // 2. Filter status=draft: published=0, pending=0, totalClaimed only from draft
    const draftRes = await request(app)
      .get(`/campaigns?search=${campPrefix}&status=draft&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(draftRes.status, 200);
    assert.equal(draftRes.body.total, 5);
    assert.equal(draftRes.body.totalPages, 1);
    assert.equal(draftRes.body.items.length, 5);
    assert.equal(draftRes.body.summary.total, 5);
    assert.equal(draftRes.body.summary.published, 0, "filter draft must produce published = 0");
    assert.equal(draftRes.body.summary.pending, 0, "filter draft must produce pending = 0");
    // usedCount for indices 20..24: 21 + 22 + 23 + 24 + 25 = 115
    assert.equal(draftRes.body.summary.totalClaimed, 115);

    // 3. Filter status=pending_approval: published=0, pending=5
    const pendingRes = await request(app)
      .get(`/campaigns?search=${campPrefix}&status=pending_approval&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingRes.body.total, 5);
    assert.equal(pendingRes.body.totalPages, 1);
    assert.equal(pendingRes.body.items.length, 5);
    assert.equal(pendingRes.body.summary.total, 5);
    assert.equal(pendingRes.body.summary.published, 0, "filter pending must produce published = 0");
    assert.equal(pendingRes.body.summary.pending, 5, "filter pending must produce pending = 5");

    // 4. Filter status=published: pending=0, published=15
    const publishedRes = await request(app)
      .get(`/campaigns?search=${campPrefix}&status=published&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(publishedRes.status, 200);
    assert.equal(publishedRes.body.total, 15);
    assert.equal(publishedRes.body.totalPages, 1);
    assert.equal(publishedRes.body.items.length, 15);
    assert.equal(publishedRes.body.summary.total, 15);
    assert.equal(publishedRes.body.summary.published, 15);
    assert.equal(publishedRes.body.summary.pending, 0, "filter published must produce pending = 0");

    // 5. Filter status=ended: published=0, pending=0
    const endedRes = await request(app)
      .get(`/campaigns?search=${campPrefix}&status=ended&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(endedRes.status, 200);
    assert.equal(endedRes.body.total, 5);
    assert.equal(endedRes.body.summary.total, 5);
    assert.equal(endedRes.body.summary.published, 0);
    assert.equal(endedRes.body.summary.pending, 0);
  });

  // 4. Articles Summary & Archived Respect Tests (Prisma & SQL Trigram paths)
  await t.test("Articles: summary strictly respects archived and filters in both Prisma and SQL paths", async () => {
    // Create 30 articles with artPrefix:
    // 15 published (category: "care")
    // 5 draft (category: "care")
    // 5 archived (category: "care")
    // 5 published (category: "sustainability")
    const articlesData = Array.from({ length: 30 }, (_, i) => {
      let status = "published";
      let category = "care";

      if (i < 15) {
        status = "published";
        category = "care";
      } else if (i < 20) {
        status = "draft";
        category = "care";
      } else if (i < 25) {
        status = "archived";
        category = "care";
      } else {
        status = "published";
        category = "sustainability";
      }

      return {
        slug: `${artPrefix}-${String(i + 1).padStart(2, "0")}`,
        title: `Eco Vintage Article ${artPrefix} ${i + 1}`,
        summary: `Summary of article ${i + 1}`,
        content: `Detailed content of article ${artPrefix} ${i + 1}`,
        category,
        status,
        authorId: "mkt-pg-lead-01",
        authorName: "Marketing Lead",
        searchText: `ecovintage ${artPrefix} article ${category} ${status} ${i + 1}`,
      };
    });

    for (const a of articlesData) {
      const created = await prisma.article.create({ data: a });
      createdArticleIds.push(created.id);
    }

    // --- Path A: SQL Search Path (q=artPrefix) ---
    // 1. All statuses matching search query
    const sqlAllP1 = await request(app)
      .get(`/articles/marketing/all?q=${artPrefix}&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(sqlAllP1.status, 200);
    assert.equal(sqlAllP1.body.total, 30);
    assert.equal(sqlAllP1.body.totalPages, 2);
    assert.equal(sqlAllP1.body.items.length, 20);
    assert.ok(sqlAllP1.body.summary);
    assert.equal(sqlAllP1.body.summary.total, 30);
    assert.equal(sqlAllP1.body.summary.published, 20); // 15 care + 5 sustainability
    assert.equal(sqlAllP1.body.summary.draft, 5);

    // Page 2 in SQL search: summary must match Page 1
    const sqlAllP2 = await request(app)
      .get(`/articles/marketing/all?q=${artPrefix}&page=2&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(sqlAllP2.status, 200);
    assert.equal(sqlAllP2.body.total, 30);
    assert.equal(sqlAllP2.body.summary.total, sqlAllP1.body.summary.total);
    assert.equal(sqlAllP2.body.summary.published, sqlAllP1.body.summary.published);
    assert.equal(sqlAllP2.body.summary.draft, sqlAllP1.body.summary.draft);

    // 2. CRITICAL: status=archived in SQL search path
    const sqlArchivedRes = await request(app)
      .get(`/articles/marketing/all?q=${artPrefix}&status=archived&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(sqlArchivedRes.status, 200);
    assert.equal(sqlArchivedRes.body.total, 5);
    assert.equal(sqlArchivedRes.body.items.length, 5);
    assert.equal(sqlArchivedRes.body.summary.total, 5);
    assert.equal(sqlArchivedRes.body.summary.published, 0, "SQL path archived must yield published = 0");
    assert.equal(sqlArchivedRes.body.summary.draft, 0, "SQL path archived must yield draft = 0");

    // 3. status=draft in SQL search path
    const sqlDraftRes = await request(app)
      .get(`/articles/marketing/all?q=${artPrefix}&status=draft&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(sqlDraftRes.status, 200);
    assert.equal(sqlDraftRes.body.total, 5);
    assert.equal(sqlDraftRes.body.summary.total, 5);
    assert.equal(sqlDraftRes.body.summary.published, 0, "SQL path draft must yield published = 0");
    assert.equal(sqlDraftRes.body.summary.draft, 5);

    // 4. status=published in SQL search path
    const sqlPublishedRes = await request(app)
      .get(`/articles/marketing/all?q=${artPrefix}&status=published&page=1&limit=20`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(sqlPublishedRes.status, 200);
    assert.equal(sqlPublishedRes.body.total, 20);
    assert.equal(sqlPublishedRes.body.summary.total, 20);
    assert.equal(sqlPublishedRes.body.summary.published, 20);
    assert.equal(sqlPublishedRes.body.summary.draft, 0, "SQL path published must yield draft = 0");

    // --- Path B: Prisma Path (no q search, category & status filters) ---
    // 5. status=archived with category=care in Prisma path
    const baselineCareArchived = await prisma.article.count({
      where: { category: "care", status: "archived", id: { notIn: createdArticleIds } },
    });
    const prismaArchivedRes = await request(app)
      .get("/articles/marketing/all?category=care&status=archived&page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(prismaArchivedRes.status, 200);
    assert.equal(prismaArchivedRes.body.total, baselineCareArchived + 5);
    assert.equal(prismaArchivedRes.body.summary.total, baselineCareArchived + 5);
    assert.equal(prismaArchivedRes.body.summary.published, 0, "Prisma path archived must yield published = 0");
    assert.equal(prismaArchivedRes.body.summary.draft, 0, "Prisma path archived must yield draft = 0");

    // 6. status=draft with category=care in Prisma path
    const baselineCareDraft = await prisma.article.count({
      where: { category: "care", status: "draft", id: { notIn: createdArticleIds } },
    });
    const prismaDraftRes = await request(app)
      .get("/articles/marketing/all?category=care&status=draft&page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(prismaDraftRes.status, 200);
    assert.equal(prismaDraftRes.body.total, baselineCareDraft + 5);
    assert.equal(prismaDraftRes.body.summary.total, baselineCareDraft + 5);
    assert.equal(prismaDraftRes.body.summary.published, 0, "Prisma path draft must yield published = 0");
    assert.equal(prismaDraftRes.body.summary.draft, baselineCareDraft + 5);

    // 7. status=published with category=care in Prisma path
    const baselineCarePublished = await prisma.article.count({
      where: { category: "care", status: "published", id: { notIn: createdArticleIds } },
    });
    const prismaPublishedRes = await request(app)
      .get("/articles/marketing/all?category=care&status=published&page=1&limit=20")
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(prismaPublishedRes.status, 200);
    assert.equal(prismaPublishedRes.body.total, baselineCarePublished + 15);
    assert.equal(prismaPublishedRes.body.summary.total, baselineCarePublished + 15);
    assert.equal(prismaPublishedRes.body.summary.published, baselineCarePublished + 15);
    assert.equal(prismaPublishedRes.body.summary.draft, 0, "Prisma path published must yield draft = 0");
  });
});
