const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "executive-search-test-token";
if (process.env.DATABASE_URL_AUTH)
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const {
  createSellerNameSearch,
} = require("../../order-service/src/features/metrics/sellerNameSearch");

test("executive seller search pages all sellers including suspended shops", async (context) => {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    context.skip("disposable PostgreSQL is unavailable");
    return;
  }
  const prefix = `ceo-search-${Date.now()}-`;
  const query = `${prefix}50%_`;
  const ids = Array.from(
    { length: 103 },
    (_, index) => `${prefix}${String(index).padStart(3, "0")}`,
  );
  const previousAuthUrl = process.env.AUTH_SERVICE_URL;
  let server;
  const post = (body, token = process.env.INTERNAL_SERVICE_TOKEN) => {
    const call = request(app).post("/executive/seller-search").send(body);
    return token ? call.set("x-internal-token", token) : call;
  };
  try {
    await prisma.user.createMany({
      data: ids.map((id, index) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "unused-internal-search",
        firstName: prefix,
        lastName: "Seller",
        role: "SELLER",
        status: index === 102 ? "SUSPENDED" : "ACTIVE",
      })),
    });
    await prisma.sellerProfile.createMany({
      data: ids.map((userId, index) => ({
        userId,
        shopName: index === 101 ? `${prefix}50-other` : `${query}${index}`,
      })),
    });
    assert.equal((await post({ q: query }, null)).status, 403);
    assert.equal((await post({ q: query }, "wrong-token")).status, 403);
    const first = await post({ q: query });
    assert.equal(first.status, 200);
    assert.equal(first.body.sellerIds.length, 100);
    assert.ok(first.body.nextCursor);
    const second = await post({ q: query, cursor: first.body.nextCursor });
    assert.equal(second.status, 200);
    assert.equal(second.body.nextCursor, null);
    assert.deepEqual(
      [...first.body.sellerIds, ...second.body.sellerIds],
      ids.filter((id, index) => index !== 101),
    );
    assert.ok(second.body.sellerIds.includes(ids[102]));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(
      await createSellerNameSearch().findUserIds(query),
      ids.filter((id, index) => index !== 101),
    );
    for (const body of [
      { q: "" },
      { q: "x".repeat(101) },
      { q: query, cursor: [] },
    ]) {
      assert.equal((await post(body)).status, 400);
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuthUrl;
    await prisma.sellerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
