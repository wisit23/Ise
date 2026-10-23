const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

app.locals.validateAccessSession = async () => {};

const authBaseUrl =
  process.env.AUTH_SERVICE_INTERNAL_URL ||
  process.env.AUTH_SERVICE_URL ||
  "http://auth-service:3001";

async function authRequest(path, { token, method = "GET", body } = {}) {
  const response = await fetch(new URL(path, authBaseUrl), {
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

async function login(email) {
  return authRequest("/login", {
    method: "POST",
    body: { email, password: "password123" },
  });
}

test("UR-13 uses Auth's persisted buyer profile end-to-end", async (t) => {
  if (process.env.REQUIRE_INTEGRATION !== "1") {
    t.skip("set REQUIRE_INTEGRATION=1 to run cross-service persistence test");
    return;
  }

  const [buyer, marketing] = await Promise.all([
    login("buyer.demo@example.com"),
    login("marketing@example.com"),
  ]);
  const buyerToken = buyer.accessToken;
  const marketingToken = marketing.accessToken;
  const originalProfile = await authRequest("/me/style-profile", {
    token: buyerToken,
  });
  let campaignId;

  t.after(async () => {
    if (campaignId) {
      await prisma.userVoucher.deleteMany({ where: { campaignId } });
      await prisma.campaign.deleteMany({ where: { id: campaignId } });
    }
    await authRequest("/me/style-profile", {
      token: buyerToken,
      method: "PATCH",
      body: originalProfile,
    });
    await prisma.$disconnect();
  });

  await authRequest("/me/style-profile", {
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

  await authRequest("/me/style-profile", {
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

  await authRequest("/me/style-profile", {
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
