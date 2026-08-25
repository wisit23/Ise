const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const fs = require("fs");
const path = require("path");
const { STORAGE_DIR } = require("../src/features/disputes/evidenceStorage");

const buyerId = `int-test-evidence-buyer-${Date.now()}`;
const sellerId = `int-test-evidence-seller-${Date.now()}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const strangerToken = signAccessToken({
  sub: `int-test-evidence-stranger-${Date.now()}`,
  role: "BUYER",
});
const agentToken = signAccessToken({ sub: "int-test-evidence-agent", role: "CUSTOMER_SERVICE" });

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("dispute evidence: private storage, authz on view, audit trail", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_ORDER not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/order-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId,
      productId: `int-test-evidence-product-${Date.now()}`,
      productTitle: "evidence test product",
      price: 800,
      status: "completed",
    },
  });
  const openRes = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ reason: "สินค้าชำรุด แนบรูปประกอบ" });
  const disputeId = openRes.body.id;

  const uploadRes = await request(app)
    .post(`/disputes/${disputeId}/evidence`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .attach("file", Buffer.from("fake-jpeg-bytes"), {
      filename: "damage.jpg",
      contentType: "image/jpeg",
    });
  assert.equal(uploadRes.status, 201);
  const evidenceId = uploadRes.body.id;

  // storageKey is an opaque generated filename, not derived from the
  // original filename — the row lives outside product-service's uploads/
  // tree entirely (STORAGE_DIR resolves under order-service, not
  // product-service), so this asserts the file was never made public.
  assert.notEqual(uploadRes.body.storageKey, "damage.jpg");
  assert.ok(
    fs.existsSync(path.join(STORAGE_DIR, uploadRes.body.storageKey)),
    "uploaded file must land in order-service's private STORAGE_DIR, not product-service's public uploads/",
  );

  // A stranger cannot view it.
  const strangerViewRes = await request(app)
    .get(`/disputes/${disputeId}/evidence/${evidenceId}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(strangerViewRes.status, 403);

  // No token at all — rejected before reaching the file.
  const noAuthRes = await request(app).get(
    `/disputes/${disputeId}/evidence/${evidenceId}`,
  );
  assert.equal(noAuthRes.status, 401);

  // The uploader (buyer) can view it and gets the actual bytes back.
  const buyerViewRes = await request(app)
    .get(`/disputes/${disputeId}/evidence/${evidenceId}`)
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(buyerViewRes.status, 200);
  // superagent only populates `.text` for text-ish content types; image/jpeg
  // comes back as a Buffer in `.body` instead.
  assert.equal(Buffer.from(buyerViewRes.body).toString(), "fake-jpeg-bytes");

  // An agent can view it too.
  const agentViewRes = await request(app)
    .get(`/disputes/${disputeId}/evidence/${evidenceId}`)
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(agentViewRes.status, 200);

  // Every successful view is audit-logged (NFR-SP-03) — the stranger's
  // rejected attempt and the missing-token attempt are not.
  const viewLogs = await prisma.disputeAuditLog.findMany({
    where: { disputeId, action: "VIEW_EVIDENCE" },
  });
  assert.equal(viewLogs.length, 2); // buyer's view + agent's view
});
