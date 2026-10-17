const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const platformMetrics = require("./platformMetrics");
const { getFirstSale } = require("./metricsController");

function run(firstSaleAt) {
  const original = platformMetrics.getFirstSaleAt;
  platformMetrics.getFirstSaleAt = async () => firstSaleAt;
  return new Promise((resolve, reject) => {
    getFirstSale({}, { json: resolve }, (err) => reject(err));
  }).finally(() => {
    platformMetrics.getFirstSaleAt = original;
  });
}

test("reports the first sale as an ISO instant", async () => {
  const body = await run(new Date("2026-03-10T05:00:00.000Z"));
  assert.deepEqual(body.data, { firstSaleAt: "2026-03-10T05:00:00.000Z" });
  assert.equal(body.meta.definitionVersion, "v1");
});

test("reports null, not a made-up date, while nothing has sold", async () => {
  const body = await run(null);
  assert.deepEqual(body.data, { firstSaleAt: null });
});

test("passes a failure on instead of answering", async () => {
  const original = platformMetrics.getFirstSaleAt;
  platformMetrics.getFirstSaleAt = async () => {
    throw new Error("database down");
  };
  try {
    await assert.rejects(
      new Promise((resolve, reject) => {
        getFirstSale({}, { json: resolve }, reject);
      }),
      /database down/,
    );
  } finally {
    platformMetrics.getFirstSaleAt = original;
  }
});
