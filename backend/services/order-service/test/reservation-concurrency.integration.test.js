const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

const { signAccessToken } = require("@reloop/shared");
const productPrisma = require("../../product-service/src/models/prismaClient");
const orderPrisma = require("../src/models/prismaClient");
const productApp = require("../../product-service/src/app");

const TEST_TITLE_PREFIX = "buy-002-integration ";

async function databasesAreReachable() {
  if (!process.env.DATABASE_URL_PRODUCT || !process.env.DATABASE_URL_ORDER) {
    return false;
  }
  try {
    await productPrisma.$queryRaw`SELECT 1`;
    await orderPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitFor(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for reservation expiry worker");
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, "exit");
}

test("only one of two buyers reserves a product and expiry cannot unlock a newer reservation", async (t) => {
  if (!(await databasesAreReachable())) {
    const message =
      "DATABASE_URL_PRODUCT/DATABASE_URL_ORDER not set or databases unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const productServer = await listen(productApp);
  const address = productServer.address();
  process.env.PRODUCT_SERVICE_URL = `http://127.0.0.1:${address.port}`;
  const orderApp = require("../src/app");

  const title = `${TEST_TITLE_PREFIX}${Date.now()}`;
  const product = await productPrisma.product.create({
    data: {
      sellerId: "seller-1",
      title,
      price: 1200,
      category: "Jacket",
      tags: [],
    },
  });
  const buyers = ["buyer-a", "buyer-b"];
  const tokens = Object.fromEntries(
    buyers.map((buyerId) => [
      buyerId,
      signAccessToken({ sub: buyerId, role: "BUYER" }),
    ]),
  );

  try {
    const attempts = await Promise.all(
      buyers.map((buyerId) =>
        request(orderApp)
          .post("/")
          .set("Authorization", `Bearer ${tokens[buyerId]}`)
          .send({ productId: product.id }),
      ),
    );
    assert.deepEqual(
      attempts.map((result) => result.status).sort(),
      [201, 409],
    );

    const winner = attempts.find((result) => result.status === 201).body;
    const winnerId = winner.buyerId;
    const loserId = buyers.find((buyerId) => buyerId !== winnerId);
    assert.equal(winner.status, "pending_payment");
    assert.ok(winner.reservationId);
    assert.ok(new Date(winner.reservationExpiresAt) > new Date());

    const reservedProduct = await productPrisma.product.findUnique({
      where: { id: product.id },
    });
    assert.equal(reservedProduct.status, "reserved");
    assert.equal(reservedProduct.reservedBy, winnerId);
    assert.equal(reservedProduct.reservationId, winner.reservationId);

    const retry = await request(orderApp)
      .post("/")
      .set("Authorization", `Bearer ${tokens[winnerId]}`)
      .send({ productId: product.id });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.id, winner.id);
    assert.equal(
      await orderPrisma.order.count({ where: { productId: product.id } }),
      1,
    );

    await productPrisma.product.update({
      where: { id: product.id },
      data: { reservationExpiresAt: new Date(Date.now() - 1000) },
    });

    const takeover = await request(orderApp)
      .post("/")
      .set("Authorization", `Bearer ${tokens[loserId]}`)
      .send({ productId: product.id });
    assert.equal(takeover.status, 201);
    assert.notEqual(takeover.body.reservationId, winner.reservationId);

    await request(productApp)
      .delete(
        `/internal/products/${product.id}/reservations/${winner.reservationId}`,
      )
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .expect(204);

    const afterStaleRelease = await productPrisma.product.findUnique({
      where: { id: product.id },
    });
    assert.equal(afterStaleRelease.status, "reserved");
    assert.equal(afterStaleRelease.reservedBy, loserId);
    assert.equal(afterStaleRelease.reservationId, takeover.body.reservationId);

    await productPrisma.product.update({
      where: { id: product.id },
      data: { reservationExpiresAt: new Date(Date.now() - 1000) },
    });

    const workerProcess = spawn(
      process.execPath,
      [path.resolve(__dirname, "../../product-service/src/server.js")],
      {
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL_PRODUCT,
          PRODUCT_PORT: "0",
        },
        stdio: "ignore",
      },
    );

    try {
      await waitFor(async () => {
        const current = await productPrisma.product.findUnique({
          where: { id: product.id },
        });
        return current.status === "available";
      });
    } finally {
      await stopChild(workerProcess);
    }

    const afterExpirySweep = await productPrisma.product.findUnique({
      where: { id: product.id },
    });
    assert.equal(afterExpirySweep.status, "available");
    assert.equal(afterExpirySweep.reservationId, null);
    assert.equal(afterExpirySweep.reservedBy, null);
    assert.equal(afterExpirySweep.reservationExpiresAt, null);
  } finally {
    await orderPrisma.order.deleteMany({
      where: { productTitle: { startsWith: TEST_TITLE_PREFIX } },
    });
    await productPrisma.product.deleteMany({
      where: { title: { startsWith: TEST_TITLE_PREFIX } },
    });
    await close(productServer);
    await orderPrisma.$disconnect();
    await productPrisma.$disconnect();
  }
});
