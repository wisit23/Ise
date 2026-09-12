// Integration test against a real, disposable MongoDB replica set
// (reloop_chat). Skips cleanly when DATABASE_URL is unset/unreachable so
// `npm test` still passes on a machine with no Mongo running. Set
// REQUIRE_INTEGRATION=1 (the CI workflow does) to turn that skip into a hard
// failure instead — see support-service/test/ticket-lifecycle.integration.test.js
// for the pattern this follows.
//
// product-service isn't run here — global.fetch is mocked instead, the same
// isolation choice review-service's integration test makes for order-service
// (see its comment). This still exercises the REAL create-or-open logic and
// REAL MongoDB writes/unique-index race handling; only the cross-service HTTP
// call is faked.
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
// Bulk-seeding through the public API would otherwise trip the per-user send
// limit (see src/limits.js) — raised HERE rather than lowering the real limit,
// which stays exactly what production runs.
process.env.CHAT_RATE_LIMIT_SEND_MESSAGE ||= "100000";
process.env.CHAT_RATE_LIMIT_UPLOAD_ATTACHMENT ||= "100000";
process.env.CHAT_RATE_LIMIT_CREATE_CONVERSATION ||= "100000";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// The rate limiter opens a Redis connection lazily on the first limited
// request; without closing it the test process stays alive forever.
const { closeRateLimitClient } = require("../src/middleware/rateLimit");

const buyerId = `int-test-buyer-${Date.now()}`;
const sellerId = `int-test-seller-${Date.now()}`;
const strangerId = `int-test-stranger-${Date.now()}`;

const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const strangerToken = signAccessToken({ sub: strangerId, role: "BUYER" });

const PRODUCT_ID = `int-test-product-${Date.now()}`;
const OWN_PRODUCT_ID = `int-test-own-product-${Date.now()}`;
const MISSING_PRODUCT_ID = `int-test-missing-product-${Date.now()}`;

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

test("conversation create-or-open against a real MongoDB replica set", async (t) => {
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

  const originalFetch = global.fetch;
  const concurrentProductId = `${PRODUCT_ID}-concurrent`;
  // One stable mock for the whole test suite (instead of swapping
  // global.fetch per-test) — a prior version of this test replaced the mock
  // just for the concurrency case and never restored it, which silently
  // broke every test that ran after it.
  global.fetch = async (url) => {
    const str = String(url);
    if (str.endsWith(`/${PRODUCT_ID}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: PRODUCT_ID, sellerId }),
      };
    }
    if (str.endsWith(`/${OWN_PRODUCT_ID}`)) {
      // A listing the "buyer" themselves is selling — used to prove you
      // can't open a conversation with yourself.
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: OWN_PRODUCT_ID, sellerId: buyerId }),
      };
    }
    if (str.endsWith(`/${concurrentProductId}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: concurrentProductId, sellerId }),
      };
    }
    if (str.endsWith(`/${MISSING_PRODUCT_ID}`)) {
      return { ok: false, status: 404, json: async () => null };
    }
    return { ok: false, status: 500, json: async () => null };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  await t.test("guest (no bearer token) gets 401", async () => {
    const res = await request(app)
      .post("/conversations")
      .send({ contextType: "PRODUCT", productId: PRODUCT_ID });
    assert.equal(res.status, 401);
  });

  let firstId;
  await t.test(
    "creates a conversation and resolves seller server-side",
    async () => {
      const res = await request(app)
        .post("/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        // sellerId in the body is a forgery attempt — the server must never
        // read it. Only productId is legitimate input.
        .send({
          contextType: "PRODUCT",
          productId: PRODUCT_ID,
          sellerId: "forged-seller-id",
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.contextType, "PRODUCT");
      assert.equal(res.body.contextKey, `PRODUCT:${PRODUCT_ID}:${buyerId}`);
      const roles = res.body.participants.map((p) => [p.userId, p.role]);
      assert.deepEqual(
        new Set(roles.map((r) => r.join(":"))),
        new Set([`${buyerId}:BUYER`, `${sellerId}:SELLER`]),
      );
      firstId = res.body.id;
    },
  );

  await t.test(
    "create-or-open: a second call with the same context returns the SAME conversation",
    async () => {
      const res = await request(app)
        .post("/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ contextType: "PRODUCT", productId: PRODUCT_ID });
      assert.equal(res.status, 201);
      assert.equal(res.body.id, firstId);
    },
  );

  await t.test(
    "create-or-open under real concurrency: two simultaneous requests still yield ONE conversation",
    async () => {
      const [resA, resB] = await Promise.all([
        request(app)
          .post("/conversations")
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ contextType: "PRODUCT", productId: concurrentProductId }),
        request(app)
          .post("/conversations")
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ contextType: "PRODUCT", productId: concurrentProductId }),
      ]);
      assert.equal(resA.status, 201);
      assert.equal(resB.status, 201);
      assert.equal(resA.body.id, resB.body.id);

      const count = await prisma.conversation.count({
        where: {
          contextKey: `PRODUCT:${concurrentProductId}:${buyerId}`,
        },
      });
      assert.equal(
        count,
        1,
        "exactly one Conversation document must exist in MongoDB",
      );
    },
  );

  await t.test(
    "cannot open a conversation about your own listing",
    async () => {
      const res = await request(app)
        .post("/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ contextType: "PRODUCT", productId: OWN_PRODUCT_ID });
      assert.equal(res.status, 400);
    },
  );

  await t.test("404 when the product doesn't exist", async () => {
    const res = await request(app)
      .post("/conversations")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ contextType: "PRODUCT", productId: MISSING_PRODUCT_ID });
    assert.equal(res.status, 404);
  });

  await t.test(
    "only contextType PRODUCT is accepted on this public endpoint",
    async () => {
      const res = await request(app)
        .post("/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ contextType: "SUPPORT", ticketId: "t1" });
      assert.equal(res.status, 400);
    },
  );

  await t.test(
    "a stranger (not a participant) gets 403 reading the conversation",
    async () => {
      const res = await request(app)
        .get(`/conversations/${firstId}`)
        .set("Authorization", `Bearer ${strangerToken}`);
      assert.equal(res.status, 403);
    },
  );

  await t.test(
    "the buyer (a real participant) can read the conversation",
    async () => {
      const res = await request(app)
        .get(`/conversations/${firstId}`)
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.id, firstId);
    },
  );

  await t.test("guest gets 401 reading a conversation, not 403", async () => {
    const res = await request(app).get(`/conversations/${firstId}`);
    assert.equal(res.status, 401);
  });

  await t.test("a nonexistent conversation id is 404, not 403", async () => {
    const res = await request(app)
      .get("/conversations/000000000000000000000000")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(res.status, 404);
  });

  await t.test("inbox lists the buyer's conversation", async () => {
    const res = await request(app)
      .get("/conversations")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some((c) => c.id === firstId));
  });

  await t.test("inbox does NOT list it for a stranger", async () => {
    const res = await request(app)
      .get("/conversations")
      .set("Authorization", `Bearer ${strangerToken}`);
    assert.equal(res.status, 200);
    assert.ok(!res.body.items.some((c) => c.id === firstId));
  });
});

// Runs once after every test in this file, whether they passed, failed or
// skipped — the limiter's Redis connection is opened lazily on the first
// limited request and would otherwise hold the process open.
after(async () => {
  await closeRateLimitClient();
});
