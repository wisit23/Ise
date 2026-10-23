const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { errorHandler } = require("@reloop/shared");
const { createRecommendationService } = require("./recommendationService");
const { createRecommendationRoutes } = require("./recommendationRoutes");

function appFor(shops, capture) {
  const service = createRecommendationService({
    shops,
    products: { async list(args) { capture(args); return { items: [], total: 0, matchedTotal: 0 }; } },
  });
  const app = express();
  app.use("/recommendations", createRecommendationRoutes(service));
  app.use(errorHandler);
  return app;
}

test("recommendations resolves shops before pagination and ignores client-supplied seller ids", async () => {
  let called = false;
  const app = appFor({ async findSellerIds(q) { assert.equal(q, "ร้านดาบ"); called = true; return ["trusted-owner"]; } }, (args) => {
    assert.ok(called);
    assert.deepEqual(args.filters, { q: "ร้านดาบ", maxPrice: 200, matchingSellerIds: ["trusted-owner"] });
    assert.equal(args.skip, 2);
    assert.equal(args.take, 2);
  });
  const response = await request(app).get("/recommendations").query({ q: " ร้านดาบ ", maxPrice: 200, page: 2, limit: 2, matchingSellerIds: ["forged"] });
  assert.equal(response.status, 200);
});

test("browsing without a query never calls shop lookup", async () => {
  const app = appFor({ findSellerIds: () => assert.fail("unexpected lookup") }, () => {});
  assert.equal((await request(app).get("/recommendations")).status, 200);
});

test("auth outage keeps keyword search available and reports missing shop source", async () => {
  const app = appFor({ async findSellerIds() { throw new Error("offline"); } }, ({ filters }) => {
    assert.equal(filters.q, "ดาบ");
    assert.deepEqual(filters.matchingSellerIds, []);
  });
  const response = await request(app).get("/recommendations").query({ q: "ดาบ" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.unavailableSources, ["shops"]);
});
