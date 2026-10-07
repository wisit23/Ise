const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { signAccessToken } = require("@reloop/shared");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const app = require("../../app");
// Bypass live session enforcement in this unit suite
app.locals.validateAccessSession = async () => {};

const {
  parseAndValidateRange,
  buildHourlyPeriods,
  findPeakHour,
  formatBangkokIsoBoundary,
  serializeUserAnalytics,
  getUserUsageAnalytics,
} = require("./activityMetrics");

test("activityMetrics unit tests - range validation", async () => {
  // 1. Valid range [from, to) with explicit Asia/Bangkok
  const range = parseAndValidateRange({
    from: "2026-06-01T00:00:00+07:00",
    to: "2026-06-02T00:00:00+07:00",
    timezone: "Asia/Bangkok",
  });
  assert.equal(range.from.toISOString(), "2026-05-31T17:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-06-01T17:00:00.000Z");
  assert.equal(range.timezone, "Asia/Bangkok");

  // 2. Date-only string YYYY-MM-DD parses as Bangkok midnight (00:00:00+07:00)
  const rangeDateOnly = parseAndValidateRange({
    from: "2026-06-01",
    to: "2026-06-02",
  });
  assert.equal(rangeDateOnly.from.toISOString(), "2026-05-31T17:00:00.000Z");
  assert.equal(rangeDateOnly.to.toISOString(), "2026-06-01T17:00:00.000Z");
  assert.equal(
    (rangeDateOnly.to.getTime() - rangeDateOnly.from.getTime()) / (1000 * 3600),
    24,
  );

  // 3. Unsupported timezone is rejected with 400
  assert.throws(
    () =>
      parseAndValidateRange({
        from: "2026-06-01",
        to: "2026-06-02",
        timezone: "America/New_York",
      }),
    (err) => err.status === 400 && err.message.includes("unsupported timezone"),
  );
  assert.throws(
    () =>
      parseAndValidateRange({
        from: "2026-06-01",
        to: "2026-06-02",
        timezone: "UTC",
      }),
    (err) => err.status === 400 && err.message.includes("unsupported timezone"),
  );

  // 4. Default range when from and to are omitted
  const def = parseAndValidateRange({});
  assert.ok(def.from instanceof Date);
  assert.ok(def.to instanceof Date);
  assert.ok(def.from < def.to);
  assert.equal(def.timezone, "Asia/Bangkok");

  // 5. One date missing throws 400
  assert.throws(
    () => parseAndValidateRange({ from: "2026-06-01T00:00:00.000Z" }),
    (err) => err.status === 400,
  );
  assert.throws(
    () => parseAndValidateRange({ to: "2026-06-02T00:00:00.000Z" }),
    (err) => err.status === 400,
  );

  // 6. Invalid date format throws 400
  assert.throws(
    () => parseAndValidateRange({ from: "invalid-date", to: "2026-06-02" }),
    (err) => err.status === 400,
  );
  assert.throws(
    () => parseAndValidateRange({ from: "2026-06-01", to: "invalid-date" }),
    (err) => err.status === 400,
  );

  // 7. from >= to throws 400
  assert.throws(
    () =>
      parseAndValidateRange({
        from: "2026-06-02T00:00:00+07:00",
        to: "2026-06-01T00:00:00+07:00",
      }),
    (err) => err.status === 400,
  );
  assert.throws(
    () =>
      parseAndValidateRange({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T00:00:00+07:00",
      }),
    (err) => err.status === 400,
  );

  // 8. Range exceeding 31 days throws 400
  assert.throws(
    () =>
      parseAndValidateRange({
        from: "2026-01-01T00:00:00+07:00",
        to: "2026-02-15T00:00:00+07:00",
      }),
    (err) => err.status === 400,
  );
});

test("activityMetrics unit tests - buildHourlyPeriods in Asia/Bangkok", () => {
  const from = new Date("2026-05-31T17:00:00.000Z"); // 2026-06-01 00:00:00 Bangkok
  const to = new Date("2026-05-31T22:00:00.000Z"); // 2026-06-01 05:00:00 Bangkok
  const periods = buildHourlyPeriods(from, to);

  assert.equal(periods.length, 5);
  assert.equal(periods[0], "2026-06-01T00:00:00+07:00");
  assert.equal(periods[4], "2026-06-01T04:00:00+07:00");
});

test("activityMetrics unit tests - findPeakHour with deterministic tie handling", () => {
  // 1. Single peak with count > 0
  const usage1 = [
    { hour: "2026-06-01T00:00:00+07:00", usageCount: 2 },
    { hour: "2026-06-01T01:00:00+07:00", usageCount: 10 },
    { hour: "2026-06-01T02:00:00+07:00", usageCount: 5 },
  ];
  const peak1 = findPeakHour(usage1);
  assert.equal(peak1.hour, "2026-06-01T01:00:00+07:00");
  assert.equal(peak1.usageCount, 10);

  // 2. Deterministic tie handling: when two hours tie for highest > 0, select the earliest
  const usage2 = [
    { hour: "2026-06-01T01:00:00+07:00", usageCount: 8 },
    { hour: "2026-06-01T02:00:00+07:00", usageCount: 15 },
    { hour: "2026-06-01T03:00:00+07:00", usageCount: 15 }, // ties hour 2
    { hour: "2026-06-01T04:00:00+07:00", usageCount: 3 },
  ];
  const peak2 = findPeakHour(usage2);
  assert.equal(peak2.hour, "2026-06-01T02:00:00+07:00");
  assert.equal(peak2.usageCount, 15);

  // 3. All zeros: returns { hour: null, usageCount: 0 }
  const usage3 = [
    { hour: "2026-06-01T00:00:00+07:00", usageCount: 0 },
    { hour: "2026-06-01T01:00:00+07:00", usageCount: 0 },
  ];
  const peak3 = findPeakHour(usage3);
  assert.deepEqual(peak3, { hour: null, usageCount: 0 });

  // 4. Empty array: returns { hour: null, usageCount: 0 }
  assert.deepEqual(findPeakHour([]), { hour: null, usageCount: 0 });

  // 5. Null and undefined
  assert.deepEqual(findPeakHour(null), { hour: null, usageCount: 0 });
  assert.deepEqual(findPeakHour(undefined), { hour: null, usageCount: 0 });
});

test("activityMetrics unit tests - serializeUserAnalytics excludes all PII and preserves boundary minutes/seconds", () => {
  const contaminatedInput = {
    range: {
      from: new Date("2026-05-31T17:30:00.000Z"), // 2026-06-01 00:30:00 Bangkok
      to: new Date("2026-05-31T19:15:45.000Z"), // 2026-06-01 02:15:45 Bangkok
      timezone: "Asia/Bangkok",
    },
    activeUsers: 5,
    newUsers: 2,
    peakHour: { hour: "2026-06-01T01:00:00+07:00", usageCount: 4 },
    hourlyUsage: [
      { hour: "2026-06-01T00:00:00+07:00", usageCount: 1 },
      { hour: "2026-06-01T01:00:00+07:00", usageCount: 4 },
      { hour: "2026-06-01T02:00:00+07:00", usageCount: 0 },
    ],
    // PII fields that must NEVER appear in serialized output
    email: "secret@example.com",
    phone: "0812345678",
    firstName: "Somchai",
    lastName: "Prasert",
    userId: "usr-123",
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
  };

  const serialized = serializeUserAnalytics(contaminatedInput);

  assert.equal(serialized.email, undefined);
  assert.equal(serialized.phone, undefined);
  assert.equal(serialized.firstName, undefined);
  assert.equal(serialized.lastName, undefined);
  assert.equal(serialized.userId, undefined);
  assert.equal(serialized.ipAddress, undefined);
  assert.equal(serialized.userAgent, undefined);

  assert.equal(serialized.activeUsers, 5);
  assert.equal(serialized.newUsers, 2);
  assert.equal(serialized.peakHour.hour, "2026-06-01T01:00:00+07:00");
  assert.equal(serialized.peakHour.usageCount, 4);

  // Range boundary must preserve actual instant, minutes and seconds in Asia/Bangkok
  assert.equal(serialized.range.from, "2026-06-01T00:30:00+07:00");
  assert.equal(serialized.range.to, "2026-06-01T02:15:45+07:00");
  assert.equal(serialized.range.timezone, "Asia/Bangkok");

  assert.equal(formatBangkokIsoBoundary(null), null);
  assert.equal(formatBangkokIsoBoundary(new Date("invalid")), null);

  // Hourly buckets must remain on the hour
  assert.equal(serialized.hourlyUsage[0].hour, "2026-06-01T00:00:00+07:00");
  assert.equal(serialized.hourlyUsage[1].hour, "2026-06-01T01:00:00+07:00");
});

test("activityMetrics unit tests - getUserUsageAnalytics with DB queries & gap filling", async () => {
  const mockPrisma = {
    user: {
      count: async () => 3,
    },
    $queryRaw: async (strings) => {
      const sql = strings.join("");
      if (sql.includes("COUNT(DISTINCT user_id)::int AS count")) {
        return [{ count: 7 }];
      }
      if (sql.includes("date_trunc('hour'")) {
        return [
          { hour: "2026-06-01T01:00:00+07:00", usageCount: 4 },
          { hour: "2026-06-01T02:00:00+07:00", usageCount: 9 },
        ];
      }
      return [];
    },
  };

  const result = await getUserUsageAnalytics(
    {
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-01T04:00:00+07:00",
    },
    { prisma: mockPrisma },
  );

  assert.equal(result.activeUsers, 7);
  assert.equal(result.newUsers, 3);
  assert.equal(result.hourlyUsage.length, 4);
  assert.equal(result.hourlyUsage[0].hour, "2026-06-01T00:00:00+07:00");
  assert.equal(result.hourlyUsage[0].usageCount, 0); // gap filled
  assert.equal(result.hourlyUsage[1].hour, "2026-06-01T01:00:00+07:00");
  assert.equal(result.hourlyUsage[1].usageCount, 4);
  assert.equal(result.hourlyUsage[2].hour, "2026-06-01T02:00:00+07:00");
  assert.equal(result.hourlyUsage[2].usageCount, 9);
  assert.equal(result.hourlyUsage[3].hour, "2026-06-01T03:00:00+07:00");
  assert.equal(result.hourlyUsage[3].usageCount, 0); // gap filled

  assert.equal(result.peakHour.hour, "2026-06-01T02:00:00+07:00");
  assert.equal(result.peakHour.usageCount, 9);
  assert.equal(result.range.timezone, "Asia/Bangkok");
});

test("activityMetrics unit tests - database error is not swallowed", async () => {
  const failingPrisma = {
    user: {
      count: async () => {
        throw new Error("PostgreSQL connection timeout");
      },
    },
    $queryRaw: async () => [],
  };

  await assert.rejects(
    () =>
      getUserUsageAnalytics(
        {
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-06-02T00:00:00.000Z",
        },
        { prisma: failingPrisma },
      ),
    /PostgreSQL connection timeout/,
  );
});

test("marketing analytics endpoint authorization", async () => {
  const marketingToken = signAccessToken({
    sub: "mkt-user-1",
    role: "MARKETING",
    displayName: "Marketing Staff",
  });
  const buyerToken = signAccessToken({
    sub: "buyer-user-1",
    role: "BUYER",
    displayName: "Buyer",
  });
  const sellerToken = signAccessToken({
    sub: "seller-user-1",
    role: "SELLER",
    displayName: "Seller",
  });
  const multiRoleToken = signAccessToken({
    sub: "staff-multi-1",
    role: "MARKETING",
    roles: ["MARKETING"],
    permissions: ["analytics:read:marketing"],
    displayName: "Multi Role Staff",
  });

  // 1. Unauthenticated -> 401
  const resNoAuth = await request(app).get("/marketing/analytics/user-usage");
  assert.equal(resNoAuth.status, 401);

  // 2. Buyer -> 403
  const resBuyer = await request(app)
    .get("/marketing/analytics/user-usage")
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(resBuyer.status, 403);

  // 3. Seller -> 403
  const resSeller = await request(app)
    .get("/marketing/analytics/user-usage")
    .set("Authorization", `Bearer ${sellerToken}`);
  assert.equal(resSeller.status, 403);

  // 4. Invalid date query -> 400
  const resInvalid = await request(app)
    .get("/marketing/analytics/user-usage")
    .query({ from: "2026-06-02", to: "2026-06-01" })
    .set("Authorization", `Bearer ${marketingToken}`);
  assert.equal(resInvalid.status, 400);

  // 5. Multi-role marketing staff -> passes auth check, validates date -> 400
  const resMultiRole = await request(app)
    .get("/marketing/analytics/user-usage")
    .query({ from: "2026-06-02", to: "2026-06-01" })
    .set("Authorization", `Bearer ${multiRoleToken}`);
  assert.equal(resMultiRole.status, 400);
});
