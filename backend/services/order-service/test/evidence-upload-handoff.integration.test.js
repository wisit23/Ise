const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER)
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { createOrder, deleteOrder } = require("./fixtures");
const { absolutePath } = require("../src/features/disputes/evidenceStorage");
app.locals.validateAccessSession = async () => {};
require("../src/services/authClient").setMockUserResolver(async (id) => ({
  id,
  role: "BUYER",
  roles: ["BUYER"],
  status: "ACTIVE",
}));

function token(id, role) {
  return signAccessToken({
    sub: id,
    role,
    roles: [role],
    permissions: permissionsForRoles([role]),
  });
}
test.after(() => prisma.$disconnect());

test("multipart buyer/seller images survive CS escalation and stream unchanged to T&S", async (t) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw err;
    t.skip("database unavailable");
    return;
  }
  const buyer = randomUUID(),
    seller = randomUUID(),
    cs = randomUUID(),
    safety = randomUUID();
  const order = await createOrder(prisma, {
    data: {
      buyerId: buyer,
      sellerId: seller,
      productId: randomUUID(),
      price: 890,
      status: "completed",
      version: 0,
    },
  });
  const uploadedFiles = [];
  t.after(async () => {
    await deleteOrder(prisma, order.id);
    await Promise.all(
      uploadedFiles.map((file) =>
        fs.unlink(absolutePath(file.storageKey)).catch((err) => {
          if (err.code !== "ENOENT") throw err;
        }),
      ),
    );
  });
  const opened = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${token(buyer, "BUYER")}`)
    .send({
      disputeType: "ITEM_NOT_AS_DESCRIBED",
      reason: "Integration: actual multipart upload",
    });
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  const id = opened.body.id;
  // Valid PNG bytes travel through multipart middleware and private disk storage.
  const image = process.env.EVIDENCE_TEST_IMAGE
    ? await fs.readFile(process.env.EVIDENCE_TEST_IMAGE)
    : Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
        "base64",
      );
  for (const [uploader, role] of [
    [buyer, "BUYER"],
    [seller, "SELLER"],
  ]) {
    const upload = await request(app)
      .post(`/disputes/${id}/evidence`)
      .set("Authorization", `Bearer ${token(uploader, role)}`)
      .attach("file", image, {
        filename: "actual-upload.png",
        contentType: "image/png",
      });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    uploadedFiles.push(upload.body);
    assert.deepEqual(
      await fs.readFile(absolutePath(upload.body.storageKey)),
      image,
    );
  }
  const detail = await request(app)
    .get(`/disputes/${id}`)
    .set("Authorization", `Bearer ${token(cs, "CUSTOMER_SERVICE")}`);
  const claimed = await request(app)
    .post(`/disputes/${id}/claim`)
    .set("Authorization", `Bearer ${token(cs, "CUSTOMER_SERVICE")}`)
    .send({ version: detail.body.version });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  const escalated = await request(app)
    .post(`/disputes/${id}/escalate`)
    .set("Authorization", `Bearer ${token(cs, "CUSTOMER_SERVICE")}`)
    .send({
      version: claimed.body.version,
      reason: "CS hands uploaded evidence to T&S for financial review",
    });
  assert.equal(escalated.status, 200, JSON.stringify(escalated.body));
  const safetyDetail = await request(app)
    .get(`/disputes/${id}`)
    .set("Authorization", `Bearer ${token(safety, "TRUST_AND_SAFETY")}`);
  assert.equal(safetyDetail.status, 200);
  assert.equal(safetyDetail.body.evidence.length, 2);
  for (const file of uploadedFiles) {
    const url = `/disputes/${id}/evidence/${file.id}`;
    const viewed = await request(app)
      .get(url)
      .set("Authorization", `Bearer ${token(safety, "TRUST_AND_SAFETY")}`);
    assert.equal(viewed.status, 200, JSON.stringify(viewed.body));
    assert.match(viewed.headers["content-type"], /image\/png/);
    assert.deepEqual(viewed.body, image);
    assert.equal((await request(app).get(url)).status, 401);
    assert.equal(
      (
        await request(app)
          .get(url)
          .set("Authorization", `Bearer ${token(randomUUID(), "BUYER")}`)
      ).status,
      403,
    );
  }
  const logs = await prisma.disputeAuditLog.count({
    where: {
      disputeEvidenceId: { in: uploadedFiles.map((file) => file.id) },
      actorId: safety,
      action: "VIEW_EVIDENCE",
    },
  });
  assert.equal(logs, 2);
  await fs.unlink(absolutePath(uploadedFiles[0].storageKey));
  const missing = await request(app)
    .get(`/disputes/${id}/evidence/${uploadedFiles[0].id}`)
    .set("Authorization", `Bearer ${token(safety, "TRUST_AND_SAFETY")}`);
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /evidence file is missing/);
});
