const test = require("node:test");
const assert = require("node:assert/strict");
const hourlyTrend = require("./dashboardHourlyTrend");

test("today groups real timestamps into 24 UTC hours and excludes other days and future events", () => {
  const now = new Date("2026-10-17T12:30:00Z");
  const dates = [
    "2026-10-16T23:59:59Z",
    "2026-10-17T00:00:00Z",
    "2026-10-17T09:01:00Z",
    "2026-10-17T09:59:59Z",
    "2026-10-17T12:30:00Z",
    "2026-10-17T12:31:00Z",
    "2026-10-18T00:00:00Z",
  ];
  const result = hourlyTrend(
    dates.map((date) => ({ createdAt: new Date(date) })),
    now,
  );
  assert.equal(result.length, 24);
  assert.deepEqual(result[0], { hour: "00:00", count: 1 });
  assert.deepEqual(result[9], { hour: "09:00", count: 2 });
  assert.deepEqual(result[12], { hour: "12:00", count: 1 });
  assert.deepEqual(result[23], { hour: "23:00", count: 0 });
  assert.equal(
    result.reduce((sum, row) => sum + row.count, 0),
    4,
  );
});

test("an empty day preserves all hourly labels with zero counts", () => {
  const result = hourlyTrend([], new Date("2026-10-17T00:00:00Z"));
  assert.equal(result.length, 24);
  assert.ok(result.every((row) => row.count === 0));
});
