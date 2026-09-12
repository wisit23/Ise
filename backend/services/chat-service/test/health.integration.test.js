// Integration test against a real, disposable MongoDB replica set
// (reloop_chat). Skips cleanly when DATABASE_URL is unset/unreachable so
// `npm test` still passes on a machine with no Mongo running. Set
// REQUIRE_INTEGRATION=1 (the CI workflow does) to turn that skip into a hard
// failure instead — see support-service/test/ticket-lifecycle.integration.test.js
// for the pattern this follows.
//
// Unlike the other services' health checks (which answer `{status:"ok"}`
// unconditionally — see support-service/test/health.integration.test.js),
// chat-service's /health actively pings Mongo (see src/app.js) because
// CHAT-001's whole point is proving the replica set is reachable and usable,
// not just that the process is listening. So this test needs a real Mongo,
// not a database-free smoke test.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

test("GET /health reports db:ok against a real Mongo replica set", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_CHAT not set or MongoDB unreachable — set it to a disposable replica-set " +
      "database (see docs/featureplan/chat/plan.md CHAT-001) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "chat-service");
  assert.equal(res.body.db, "ok");
});

test("GET /health returns 503 with db:unreachable when Mongo is unreachable", async () => {
  const originalUrl = process.env.DATABASE_URL;
  // A syntactically valid but unreachable URL — proves the health check
  // actually round-trips to Mongo rather than always answering "ok".
  process.env.DATABASE_URL =
    "mongodb://localhost:1/reloop_chat_unreachable?directConnection=true&serverSelectionTimeoutMS=500";

  // The Prisma client already cached its connection string at construction,
  // so this test can't reuse the shared prisma instance — it needs a fresh
  // client bound to the broken URL to actually exercise a failed ping.
  delete require.cache[require.resolve("../src/models/prismaClient")];
  delete require.cache[require.resolve("../src/app")];
  const brokenApp = require("../src/app");

  try {
    const res = await request(brokenApp).get("/health");
    assert.equal(res.status, 503);
    assert.equal(res.body.db, "unreachable");
  } finally {
    process.env.DATABASE_URL = originalUrl;
    delete require.cache[require.resolve("../src/models/prismaClient")];
    delete require.cache[require.resolve("../src/app")];
  }
});
