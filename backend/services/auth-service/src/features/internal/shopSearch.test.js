const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.INTERNAL_SERVICE_TOKEN ||= "shop-test-internal";
const { errorHandler } = require("@reloop/shared");
const routes = require("./internalRoutes");
const prisma = require("../../models/prismaClient");
const app = express();
app.use(express.json());
app.use("/internal", routes);
app.use(errorHandler);

test("shop lookup requires service credentials, not browser credentials", async () => {
  for (const headers of [{}, { Authorization: "Bearer browser-token" }]) {
    const response = await request(app).post("/internal/shops/search").set(headers).send({ q: "shop" });
    assert.equal(response.status, 403);
  }
});

test("shop lookup rejects missing/blank/non-string queries before database access", async () => {
  for (const q of [undefined, " ", 123, ["shop"]]) {
    const response = await request(app).post("/internal/shops/search")
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN).send({ q });
    assert.equal(response.status, 400);
  }
});

test("shop lookup searches active shop names only and returns ids without private data", async (t) => {
  const original = prisma.sellerProfile.findMany;
  t.after(() => { prisma.sellerProfile.findMany = original; });
  prisma.sellerProfile.findMany = async (args) => {
    assert.deepEqual(args.where, {
      shopName: { contains: "Shop\\_100\\%", mode: "insensitive" },
      user: { status: "ACTIVE" },
    });
    assert.deepEqual(args.select, { userId: true });
    return [{ userId: "seller-1" }];
  };
  const response = await request(app).post("/internal/shops/search")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN).send({ q: " Shop_100% " });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { sellerIds: ["seller-1"] });
});
