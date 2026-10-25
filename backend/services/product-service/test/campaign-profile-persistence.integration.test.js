const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

async function authRequest(
  baseUrl,
  path,
  { token, method = "GET", body } = {},
) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, payload.error || `${method} ${path} failed`);
  return payload;
}

test("UR-13 uses Auth's persisted buyer profile end-to-end", async (t) => {
  if (process.env.REQUIRE_INTEGRATION !== "1") {
    t.skip("set REQUIRE_INTEGRATION=1 to run cross-service persistence test");
    return;
  }

  assert.ok(process.env.DATABASE_URL_AUTH, "DATABASE_URL_AUTH is required");
  assert.ok(
    process.env.DATABASE_URL_PRODUCT,
    "DATABASE_URL_PRODUCT is required",
  );
  const { once } = require("node:events");
  const { randomUUID } = require("node:crypto");
  const { signAccessToken } = require("@reloop/shared");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousAuthUrl = process.env.AUTH_SERVICE_INTERNAL_URL;
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
  const authPrisma = require("../../auth-service/src/models/prismaClient");
  const authApp = require("../../auth-service/src/app");
  // Signed fixture identities keep this focused on real cross-service profile
  // persistence, not login/session behavior (covered by the Auth suites).
  authApp.locals.validateAccessSession = async () => {};
  const buyerId = randomUUID();
  let prisma;
  let campaignId;
  const server = authApp.listen(0, "127.0.0.1");
  t.after(async () => {
    try {
      if (campaignId) {
        await prisma.userVoucher.deleteMany({ where: { campaignId } });
        await prisma.marketingAuditLog.deleteMany({
          where: { entityId: campaignId },
        });
        await prisma.campaign.deleteMany({ where: { id: campaignId } });
      }
      await authPrisma.buyerProfile.deleteMany({ where: { userId: buyerId } });
      await authPrisma.user.deleteMany({ where: { id: buyerId } });
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await Promise.all([authPrisma.$disconnect(), prisma?.$disconnect()]);
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousAuthUrl === undefined)
        delete process.env.AUTH_SERVICE_INTERNAL_URL;
      else process.env.AUTH_SERVICE_INTERNAL_URL = previousAuthUrl;
    }
  });
  await once(server, "listening");
  await authPrisma.$connect();
  const authBaseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.AUTH_SERVICE_INTERNAL_URL = authBaseUrl;
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
  prisma = require("../src/models/prismaClient");
  const app = require("../src/app");
  app.locals.validateAccessSession = async () => {};
  const marketingId = randomUUID();
  const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
  const marketingToken = signAccessToken({
    sub: marketingId,
    role: "MARKETING",
  });
  await authPrisma.user.create({
    data: {
      id: buyerId,
      email: `campaign-profile-${buyerId}@example.test`,
      passwordHash: "unused-signed-fixture",
      firstName: "Campaign",
      lastName: "Buyer",
      role: "BUYER",
      emailVerifiedAt: new Date(),
    },
  });

  const profileRequest = (path, options) =>
    authRequest(authBaseUrl, path, options);
  await profileRequest("/me/style-profile", {
    token: buyerToken,
    method: "PATCH",
    body: {
      categories: ["เสื้อ"],
      styles: ["Vintage"],
      brands: ["Uniqlo"],
      sizes: [{ category: "เสื้อ", values: ["M"] }],
      unassignedSizes: [],
    },
  });

  const suffix = Date.now().toString().slice(-10);
  const create = await request(app)
    .post("/campaigns")
    .set("Authorization", `Bearer ${marketingToken}`)
    .send({
      code: `UR13_${suffix}`,
      name: "UR-13 persisted profile verification",
      discountType: "FIXED",
      discountValue: 10,
      minOrderPrice: 100,
      budget: 50,
      usageLimit: 5,
      startsAt: new Date(Date.now() - 30000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      targetSegment: {
        type: "rules",
        rules: [
          { field: "styleTag", operator: "eq", value: "Vintage" },
          { field: "brandPreference", operator: "eq", value: "Uniqlo" },
          { field: "preferredSize", operator: "eq", value: "M" },
        ],
      },
    });
  assert.equal(create.status, 201, create.body.error);
  campaignId = create.body.id;

  for (const action of ["submit", "approve", "publish"]) {
    const response = await request(app)
      .post(`/campaigns/${campaignId}/${action}`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(response.status, 200, response.body.error);
  }

  const matching = await request(app)
    .get("/campaigns/available")
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(matching.status, 200);
  assert.equal(
    matching.body.some(({ id }) => id === campaignId),
    true,
  );

  await profileRequest("/me/style-profile", {
    token: buyerToken,
    method: "PATCH",
    body: { styles: ["Minimal"] },
  });
  const spoofed = await request(app)
    .get(
      `/campaigns/available?profile=${encodeURIComponent(JSON.stringify({ styles: ["Vintage"] }))}`,
    )
    .set("Authorization", `Bearer ${buyerToken}`)
    .set("x-buyer-preferences", JSON.stringify({ styles: ["Vintage"] }));
  assert.equal(spoofed.status, 200);
  assert.equal(
    spoofed.body.some(({ id }) => id === campaignId),
    false,
  );

  const hiddenDetail = await request(app)
    .get(`/campaigns/${campaignId}`)
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(hiddenDetail.status, 404);

  const hiddenFromGuest = await request(app).get(`/campaigns/${campaignId}`);
  assert.equal(hiddenFromGuest.status, 404);

  const rejectedClaim = await request(app)
    .post(`/campaigns/${campaignId}/claim`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ profile: { styles: ["Vintage"] } });
  assert.equal(rejectedClaim.status, 403);

  await profileRequest("/me/style-profile", {
    token: buyerToken,
    method: "PATCH",
    body: { styles: ["Vintage"] },
  });
  const claimed = await request(app)
    .post(`/campaigns/${campaignId}/claim`)
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(claimed.status, 201, claimed.body.error);

  const applicable = await request(app)
    .post("/campaigns/applicable")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      price: 200,
      profile: { styles: ["spoofed"] },
      includeUnavailable: true,
    });
  assert.equal(applicable.status, 200, applicable.body.error);
  assert.equal(
    applicable.body.applicable.some(
      ({ campaign }) => campaign.id === campaignId,
    ),
    true,
  );
});
