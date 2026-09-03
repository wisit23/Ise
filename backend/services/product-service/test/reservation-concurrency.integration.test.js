const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}
process.env.INTERNAL_SERVICE_TOKEN ||= "reservation-integration-token";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const {
  cleanupExpired,
} = require("../src/features/reservations/reservationService");

const INTERNAL_HEADERS = {
  "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
};
const TEST_TITLE_PREFIX = "reservation-concurrency-test ";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function reserve(productId, buyerId) {
  return request(app)
    .post(`/${productId}/reservations`)
    .set(INTERNAL_HEADERS)
    .send({ buyerId });
}

test("only one buyer wins an atomic PostgreSQL reservation", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — push the product Prisma schema first";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const product = await prisma.product.create({
    data: {
      sellerId: "reservation-test-seller",
      title: `${TEST_TITLE_PREFIX}${Date.now()}`,
      price: 500,
      category: "test",
      tags: [],
    },
  });

  try {
    const attempts = await Promise.all([
      reserve(product.id, "buyer-a"),
      reserve(product.id, "buyer-b"),
    ]);
    assert.deepEqual(
      attempts.map((response) => response.status).sort(),
      [201, 409],
    );

    const winner = attempts.find((response) => response.status === 201);
    const persisted = await prisma.product.findUnique({
      where: { id: product.id },
    });
    assert.equal(persisted.status, "reserved");
    assert.equal(persisted.reservedBy, winner.body.reservedBy);
    assert.equal(persisted.reservationId, winner.body.reservationId);
    assert.ok(persisted.reservationExpiresAt > new Date());
    const reservationWindowMs =
      persisted.reservationExpiresAt.getTime() - Date.now();
    assert.ok(reservationWindowMs >= 595_000);
    assert.ok(reservationWindowMs <= 600_000);

    const publicProduct = await request(app).get(`/${product.id}`);
    assert.equal(publicProduct.status, 200);
    assert.equal(publicProduct.body.reservedBy, undefined);
    assert.equal(publicProduct.body.reservationId, undefined);
    assert.equal(publicProduct.body.reservationExpiresAt, undefined);

    await prisma.product.update({
      where: { id: product.id },
      data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
    });

    const nextReservation = await reserve(product.id, "buyer-c");
    assert.equal(nextReservation.status, 201);
    assert.notEqual(
      nextReservation.body.reservationId,
      winner.body.reservationId,
    );

    const staleRelease = await request(app)
      .delete(`/${product.id}/reservations/${winner.body.reservationId}`)
      .set(INTERNAL_HEADERS)
      .send({ buyerId: winner.body.reservedBy });
    assert.equal(staleRelease.status, 409);

    const staleConfirm = await request(app)
      .post(`/${product.id}/reservations/${winner.body.reservationId}/confirm`)
      .set(INTERNAL_HEADERS)
      .send({ buyerId: winner.body.reservedBy });
    assert.equal(staleConfirm.status, 409);

    await prisma.product.update({
      where: { id: product.id },
      data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
    });
    assert.equal(await cleanupExpired(), 1);

    const released = await prisma.product.findUnique({
      where: { id: product.id },
    });
    assert.equal(released.status, "available");
    assert.equal(released.reservedBy, null);
    assert.equal(released.reservationId, null);
    assert.equal(released.reservationExpiresAt, null);

    const finalReservation = await reserve(product.id, "buyer-d");
    assert.equal(finalReservation.status, 201);
    const confirmed = await request(app)
      .post(
        `/${product.id}/reservations/${finalReservation.body.reservationId}/confirm`,
      )
      .set(INTERNAL_HEADERS)
      .send({ buyerId: "buyer-d" });
    assert.equal(confirmed.status, 204);

    const sold = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(sold.status, "sold");
  } finally {
    await prisma.product.deleteMany({
      where: { title: { startsWith: TEST_TITLE_PREFIX } },
    });
    await prisma.$disconnect();
  }
});
