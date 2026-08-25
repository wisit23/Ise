const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const agentToken = signAccessToken({
  sub: "int-test-help-agent",
  role: "SUPPORT",
});
const buyerToken = signAccessToken({
  sub: "int-test-help-buyer",
  role: "BUYER",
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

test("help article draft -> publish flow and search visibility", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_SUPPORT not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/support-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const uniqueWord = `probeword${Date.now()}`;

  const createRes = await request(app)
    .post("/help")
    .set("Authorization", `Bearer ${agentToken}`)
    .send({
      title: `บทความทดสอบ ${uniqueWord}`,
      body: "เนื้อหาทดสอบระบบค้นหา",
      category: "OTHER",
    });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.status, "DRAFT");
  const id = createRes.body.id;

  // A draft must not appear in public search yet.
  const searchBeforePublish = await request(app)
    .get("/help")
    .query({ q: uniqueWord });
  assert.equal(
    searchBeforePublish.body.items.some((a) => a.id === id),
    false,
  );

  // A buyer cannot publish it.
  const buyerPublishRes = await request(app)
    .patch(`/help/${id}/publish`)
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(buyerPublishRes.status, 403);

  const publishRes = await request(app)
    .patch(`/help/${id}/publish`)
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.status, "PUBLISHED");

  // Now it must be findable by trigram search on the unique word.
  const searchAfterPublish = await request(app)
    .get("/help")
    .query({ q: uniqueWord });
  assert.equal(searchAfterPublish.status, 200);
  assert.equal(
    searchAfterPublish.body.items.some((a) => a.id === id),
    true,
  );
});
