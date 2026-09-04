const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

const app = require("../../app");
const authService = require("../../services/authService");
const prisma = require("../../models/prismaClient");

test("POST /internal/users/display-names without the internal token is rejected", async () => {
  const res = await request(app)
    .post("/internal/users/display-names")
    .send({ userIds: ["anyone"] });
  assert.equal(res.status, 403);
});

test("a browser's bearer token is NOT accepted as an internal token", async () => {
  // The whole point of putting this behind /internal: a logged-in user must
  // not be able to walk the id space and rebuild the user directory.
  const res = await request(app)
    .post("/internal/users/display-names")
    .set("Authorization", "Bearer whatever")
    .send({ userIds: ["anyone"] });
  assert.equal(res.status, 403);
});

test("a non-array userIds is a 400, not a 500", async () => {
  const res = await request(app)
    .post("/internal/users/display-names")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send({ userIds: "not-an-array" });
  assert.equal(res.status, 400);
});

test("an empty batch short-circuits without touching the database", async () => {
  const res = await request(app)
    .post("/internal/users/display-names")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send({ userIds: [] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("more than 100 ids in one call is refused", async () => {
  const userIds = Array.from({ length: 101 }, (_, i) => `u${i}`);
  const res = await request(app)
    .post("/internal/users/display-names")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send({ userIds });
  assert.equal(res.status, 400);
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

test("getDisplayNames against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or Postgres unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const stamp = Date.now();
  const buyer = await prisma.user.create({
    data: {
      email: `display-buyer-${stamp}@test.local`,
      passwordHash: "x",
      firstName: "สมชาย",
      lastName: "นามสกุลจริง",
      role: "BUYER",
    },
  });
  const seller = await prisma.user.create({
    data: {
      email: `display-seller-${stamp}@test.local`,
      passwordHash: "x",
      firstName: "สมหญิง",
      lastName: "นามสกุลจริง",
      role: "SELLER",
      sellerProfile: { create: { shopName: "ร้านทดสอบ" } },
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [buyer.id, seller.id] } },
    });
  });

  await t.test("a buyer resolves to their first name only", async () => {
    const [entry] = await authService.getDisplayNames([buyer.id]);
    assert.equal(entry.displayName, "สมชาย");
    // NFR-SP-02: the surname must never leave the service.
    assert.ok(!JSON.stringify(entry).includes("นามสกุลจริง"));
  });

  await t.test("a shop owner resolves to the shop name", async () => {
    const [entry] = await authService.getDisplayNames([seller.id]);
    assert.equal(entry.displayName, "ร้านทดสอบ");
  });

  await t.test("unknown ids are omitted rather than throwing", async () => {
    const result = await authService.getDisplayNames([
      buyer.id,
      "no-such-user",
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].userId, buyer.id);
  });
});
