const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const request = require("supertest");
const { signAccessToken } = require("@reloop/shared");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_AUTH ||
    "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_auth";
}

const prisma = require("../../services/auth-service/src/models/prismaClient");
const authApp = require("../../services/auth-service/src/app");

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Gateway to Auth-Service to PostgreSQL success path for UR-08 Marketing Analytics", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or PostgreSQL unreachable — test requires a real database";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  // Start auth-service on an ephemeral port
  authApp.locals.validateAccessSession = async () => {};
  const authServer = http.createServer(authApp);
  await new Promise((resolve) => authServer.listen(0, "127.0.0.1", resolve));
  const authPort = authServer.address().port;

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  delete require.cache[require.resolve("./app")];
  const gatewayApp = require("./app");
  gatewayApp.locals.validateAccessSession = async () => {};

  t.after(async () => {
    await new Promise((resolve) => authServer.close(resolve));
  });

  const marketingToken = signAccessToken({
    sub: "mkt-verified-1",
    role: "MARKETING",
    roles: ["MARKETING"],
    permissions: ["analytics:read:marketing"],
    displayName: "Marketing Lead",
  });

  const buyerToken = signAccessToken({
    sub: "buyer-verified-1",
    role: "BUYER",
    roles: ["BUYER"],
    displayName: "Regular Buyer",
  });

  // 1. Unauthenticated request through Gateway -> 401
  const resNoToken = await request(gatewayApp).get(
    "/api/auth/marketing/analytics/user-usage",
  );
  assert.equal(resNoToken.status, 401);
  assert.equal(resNoToken.body.error, "Missing bearer token");

  // 2. Client attempts header spoofing: sends x-user-role: MARKETING without valid token -> 401
  const resSpoofNoToken = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .set("x-user-role", "MARKETING")
    .set("x-user-id", "fake-admin");
  assert.equal(resSpoofNoToken.status, 401);

  // 3. Client attempts privilege escalation: sends BUYER token with spoofed x-user-role: MARKETING -> 403
  // Gateway must strip inbound x-user-* headers and verify from JWT
  const resBuyerSpoof = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .set("Authorization", `Bearer ${buyerToken}`)
    .set("x-user-role", "MARKETING");
  assert.equal(resBuyerSpoof.status, 403);
  assert.equal(resBuyerSpoof.body.error, "Forbidden");

  // 4. Authenticated request with verified MARKETING token and invalid date -> 400
  const resMarketingInvalidDate = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .query({
      from: "2026-06-02T00:00:00+07:00",
      to: "2026-06-01T00:00:00+07:00",
    }) // from >= to
    .set("Authorization", `Bearer ${marketingToken}`);
  assert.equal(resMarketingInvalidDate.status, 400);

  // 5. Authenticated request with unsupported timezone -> 400
  const resMarketingBadTz = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .query({
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-02T00:00:00+07:00",
      timezone: "America/New_York",
    })
    .set("Authorization", `Bearer ${marketingToken}`);
  assert.equal(resMarketingBadTz.status, 400);

  // 6. Success path: Gateway -> Auth Service -> PostgreSQL returns HTTP 200 OK
  const resSuccess = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .query({
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-02T00:00:00+07:00",
      timezone: "Asia/Bangkok",
    })
    .set("Authorization", `Bearer ${marketingToken}`);

  assert.equal(resSuccess.status, 200);

  // Assert expected fields: activeUsers, newUsers, peakHour, hourlyUsage, range
  assert.equal(typeof resSuccess.body.activeUsers, "number");
  assert.equal(typeof resSuccess.body.newUsers, "number");
  assert.ok(resSuccess.body.peakHour);
  assert.equal(typeof resSuccess.body.peakHour.usageCount, "number");
  assert.ok(Array.isArray(resSuccess.body.hourlyUsage));
  assert.equal(resSuccess.body.hourlyUsage.length, 24);

  // Assert range and timezone
  assert.equal(resSuccess.body.range.from, "2026-06-01T00:00:00+07:00");
  assert.equal(resSuccess.body.range.to, "2026-06-02T00:00:00+07:00");
  assert.equal(resSuccess.body.range.timezone, "Asia/Bangkok");

  // Assert hourly bucket timezone format (+07:00)
  for (const bucket of resSuccess.body.hourlyUsage) {
    assert.match(bucket.hour, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
    assert.equal(typeof bucket.usageCount, "number");
  }

  // Assert NO PII leaked in response
  assert.equal(resSuccess.body.email, undefined);
  assert.equal(resSuccess.body.phone, undefined);
  assert.equal(resSuccess.body.firstName, undefined);
  assert.equal(resSuccess.body.lastName, undefined);
  assert.equal(resSuccess.body.displayName, undefined);
  assert.equal(resSuccess.body.userId, undefined);
  assert.equal(resSuccess.body.password, undefined);
  assert.equal(resSuccess.body.passwordHash, undefined);

  // 7. Non-integral hour query through Gateway -> preserves minutes and seconds
  const resNonIntegral = await request(gatewayApp)
    .get("/api/auth/marketing/analytics/user-usage")
    .query({
      from: "2026-06-01T00:30:00+07:00",
      to: "2026-06-01T02:15:00+07:00",
      timezone: "Asia/Bangkok",
    })
    .set("Authorization", `Bearer ${marketingToken}`);

  assert.equal(resNonIntegral.status, 200);
  assert.equal(resNonIntegral.body.range.from, "2026-06-01T00:30:00+07:00");
  assert.equal(resNonIntegral.body.range.to, "2026-06-01T02:15:00+07:00");
  assert.equal(resNonIntegral.body.range.timezone, "Asia/Bangkok");
});

test("Gateway to Auth-Service propagates HTTP 500 when database query fails", async (t) => {
  // Create an auth app instance with a failing db handler for this route
  const express = require("express");
  const failingAuthApp = express();
  failingAuthApp.use(express.json());
  failingAuthApp.locals.validateAccessSession = async () => {};

  failingAuthApp.get("/marketing/analytics/user-usage", (req, res, next) => {
    // Simulate PostgreSQL connection timeout
    const err = new Error("PostgreSQL connection terminated unexpectedly");
    err.status = 500;
    next(err);
  });
  failingAuthApp.use((err, req, res, _next) => {
    void _next;
    res.status(err.status || 500).json({ error: err.message });
  });

  const failingServer = http.createServer(failingAuthApp);
  await new Promise((resolve) => failingServer.listen(0, "127.0.0.1", resolve));
  const failingPort = failingServer.address().port;

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${failingPort}`;
  delete require.cache[require.resolve("./app")];
  const testGateway = require("./app");
  testGateway.locals.validateAccessSession = async () => {};

  t.after(async () => {
    await new Promise((resolve) => failingServer.close(resolve));
  });

  const marketingToken = signAccessToken({
    sub: "mkt-err-test",
    role: "MARKETING",
    roles: ["MARKETING"],
    permissions: ["analytics:read:marketing"],
    displayName: "Marketing Lead",
  });

  const resError = await request(testGateway)
    .get("/api/auth/marketing/analytics/user-usage")
    .query({
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-02T00:00:00+07:00",
    })
    .set("Authorization", `Bearer ${marketingToken}`);

  // Must return 500 error, NOT 200 with zeroed metrics
  assert.equal(resError.status, 500);
  assert.match(resError.body.error, /PostgreSQL connection terminated/);
  assert.equal(resError.body.activeUsers, undefined);
});
