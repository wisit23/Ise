const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveMetricRange,
  resolveExecutiveRange,
  allowedValue,
  buildSeriesPeriods,
  fillSeriesGaps,
} = require("./executiveMetrics");

const iso = (dates) => dates.map((d) => d.toISOString());

test("date-only bounds are local midnight in the requested zone", () => {
  const range = resolveMetricRange({
    from: "2026-10-01",
    to: "2026-11-01",
    timezone: "Asia/Bangkok",
  });
  assert.equal(range.from.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(range.timezone, "Asia/Bangkok");
});

test("timezone defaults to Asia/Bangkok", () => {
  const range = resolveMetricRange({ from: "2026-01-01", to: "2026-01-02" });
  assert.equal(range.timezone, "Asia/Bangkok");
  assert.equal(range.from.toISOString(), "2025-12-31T17:00:00.000Z");
});

test("full ISO instants are still accepted unchanged", () => {
  const range = resolveMetricRange({
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-11-01T00:00:00.000Z",
  });
  assert.equal(range.from.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("the default range is the current month in the requested zone", () => {
  const range = resolveMetricRange({ timezone: "Asia/Bangkok" });
  const bangkokNow = new Date(Date.now() + 7 * 3600 * 1000);
  const expectedFrom = new Date(
    Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), 1) -
      7 * 3600 * 1000,
  );
  assert.equal(range.from.toISOString(), expectedFrom.toISOString());
});

test("invalid zones and dates are rejected with 400", () => {
  for (const query of [
    { timezone: "Mars/Olympus" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "not-a-date", to: "2026-03-01" },
    { from: ["2026-01-01", "2026-02-01"], to: "2026-03-01" },
  ]) {
    assert.throws(
      () => resolveMetricRange(query),
      (err) => err.status === 400,
      JSON.stringify(query),
    );
  }
});

test("day series buckets start at local midnight", () => {
  const { from, to, timezone } = resolveMetricRange({
    from: "2026-10-01",
    to: "2026-10-04",
  });
  assert.deepEqual(
    iso(buildSeriesPeriods({ from, to, granularity: "day", timezone })),
    [
      "2026-09-30T17:00:00.000Z",
      "2026-10-01T17:00:00.000Z",
      "2026-10-02T17:00:00.000Z",
    ],
  );
});

test("month series buckets start on the local first of each month", () => {
  const { from, to, timezone } = resolveMetricRange({
    from: "2026-01-01",
    to: "2027-01-01",
  });
  const periods = iso(
    buildSeriesPeriods({ from, to, granularity: "month", timezone }),
  );
  assert.equal(periods.length, 12);
  assert.equal(periods[0], "2025-12-31T17:00:00.000Z");
  assert.equal(periods[1], "2026-01-31T17:00:00.000Z");
  assert.equal(periods[11], "2026-11-30T17:00:00.000Z");
});

test("UTC remains available as an explicit zone", () => {
  const { from, to, timezone } = resolveMetricRange({
    from: "2026-10-01",
    to: "2026-10-03",
    timezone: "UTC",
  });
  assert.deepEqual(
    iso(buildSeriesPeriods({ from, to, granularity: "day", timezone })),
    ["2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"],
  );
});

test("DST zones still land on local midnight", () => {
  // New York switches to daylight time on 2026-03-08.
  const { from, to, timezone } = resolveMetricRange({
    from: "2026-03-07",
    to: "2026-03-10",
    timezone: "America/New_York",
  });
  assert.deepEqual(
    iso(buildSeriesPeriods({ from, to, granularity: "day", timezone })),
    [
      "2026-03-07T05:00:00.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
  );
});

test("rows keyed by local bucket start fill the matching period", () => {
  const periods = buildSeriesPeriods({
    from: new Date("2026-09-30T17:00:00.000Z"),
    to: new Date("2026-10-02T17:00:00.000Z"),
    granularity: "day",
    timezone: "Asia/Bangkok",
  });
  const filled = fillSeriesGaps(
    periods,
    [{ period: new Date("2026-09-30T17:00:00.000Z"), gmv: 500 }],
    { gmv: 0 },
  );
  assert.deepEqual(filled, [
    { period: "2026-09-30T17:00:00.000Z", gmv: 500 },
    { period: "2026-10-01T17:00:00.000Z", gmv: 0 },
  ]);
});

test("day slots start every hour from local 00:00", () => {
  const { from, to } = resolveMetricRange({
    from: "2025-10-16",
    to: "2025-10-17",
  });
  const periods = buildSeriesPeriods({
    from,
    to,
    granularity: "hour",
    granularities: ["day", "month", "hour"],
  });

  // Bangkok is UTC+7, so local midnight is 17:00 UTC the day before.
  assert.equal(periods.length, 24);
  assert.deepEqual(
    periods.slice(0, 3).map((p) => p.toISOString()),
    [
      "2025-10-15T17:00:00.000Z",
      "2025-10-15T18:00:00.000Z",
      "2025-10-15T19:00:00.000Z",
    ],
  );
  // The last slot starts at 23:00 local.
  assert.equal(periods.at(-1).toISOString(), "2025-10-16T16:00:00.000Z");
});

test("day slots are refused unless the endpoint offers them", () => {
  const { from, to } = resolveMetricRange({
    from: "2025-10-16",
    to: "2025-10-17",
  });
  assert.throws(
    () => buildSeriesPeriods({ from, to, granularity: "hour" }),
    (err) => err.status === 400,
  );
});

test("an executive range must run forwards", () => {
  for (const query of [
    { from: "2025-10-16", to: "2025-10-16" },
    { from: "2025-10-17", to: "2025-10-16" },
  ]) {
    assert.throws(
      () => resolveExecutiveRange(query),
      (err) => err.status === 400,
    );
    // Other callers of resolveMetricRange keep their behaviour.
    assert.doesNotThrow(() => resolveMetricRange(query));
  }
  const { from, to } = resolveExecutiveRange({
    from: "2025-10-16",
    to: "2025-10-17",
  });
  assert.ok(from < to);
});

test("a filter value must be one the page offers", () => {
  const allowed = ["OPEN", "DECIDED"];
  assert.equal(allowedValue(undefined, allowed, "status"), undefined);
  assert.equal(allowedValue("", allowed, "status"), undefined);
  assert.equal(allowedValue("OPEN", allowed, "status"), "OPEN");
  for (const bad of ["open", "NOPE", ["OPEN"], {}]) {
    assert.throws(
      () => allowedValue(bad, allowed, "status"),
      (err) => err.status === 400,
    );
  }
});
