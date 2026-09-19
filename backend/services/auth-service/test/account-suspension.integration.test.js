// Real Auth/PostgreSQL sessions, real HTTP introspection, gateway and direct
// service middleware. No validator overrides or signed identity fixture bypass.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "suspension-access-test-only";
process.env.JWT_REFRESH_SECRET ||= "suspension-refresh-test-only";
process.env.INTERNAL_SERVICE_TOKEN ||= "suspension-internal-test-only";
if (process.env.DATABASE_URL_AUTH)
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;

const prisma = require("../src/models/prismaClient");
const auth = require("../src/app");
const authService = require("../src/services/authService");
const reportService = require("../src/features/reports/reportService");
const { signAccessToken, verifyAccessToken } = require("@reloop/shared");

test("Ban blocks login, refresh and existing sessions through gateway and every direct service", async (t) => {
  try {
    if (!process.env.DATABASE_URL) throw new Error("missing DATABASE_URL_AUTH");
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("REQUIRE_INTEGRATION=1: Auth test database unavailable");
    t.skip("requires a disposable Auth PostgreSQL database");
    return;
  }

  const prefix = `tsr01-${randomUUID()}`;
  const password = "suspension-test-password";
  const ids = [];
  let server;
  const previousAuthUrl = process.env.AUTH_SERVICE_URL;
  const authorization = (token) => ({ Authorization: `Bearer ${token}` });
  async function register(name) {
    const email = `${prefix}-${name}@example.test`;
    const response = await request(auth)
      .post("/register")
      .send({
        email,
        password,
        firstName: "Suspension",
        lastName: name,
      })
      .expect(201);
    ids.push(response.body.user.id);
    return { ...response.body, email };
  }

  try {
    const staff = await register("staff");
    await prisma.user.update({
      where: { id: staff.user.id },
      data: { role: "TRUST_AND_SAFETY" },
    });
    const staffLogin = await request(auth)
      .post("/login")
      .send({ email: staff.email, password })
      .expect(200);
    const staffHeaders = authorization(staffLogin.body.accessToken);
    const target = await register("target");
    const secondLogin = await request(auth)
      .post("/login")
      .send({ email: target.email, password })
      .expect(200);
    const oldSessions = [target, secondLogin.body];

    server = await new Promise((resolve) => {
      const listener = auth.listen(0, "127.0.0.1", () => resolve(listener));
    });
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
    const gateway = require("../../../gateway/src/app");
    const product = require("../../product-service/src/app");
    const order = require("../../order-service/src/app");
    const support = require("../../support-service/src/app");
    const review = require("../../review-service/src/app");
    const directRoutes = [
      [product, "post", "/", 403], // buyer lacks seller permission
      [order, "post", "/", 400], // authenticated, missing productId
      [support, "get", "/tickets/queue", 403], // buyer is not an agent
      [review, "post", "/", 400], // authenticated, missing orderId
    ];

    await t.test(
      "active account, internal gate and legacy token refresh",
      async () => {
        await request(gateway)
          .get("/api/auth/me")
          .set(authorization(target.accessToken))
          .expect(200);
        for (const [app, method, route, expected] of directRoutes) {
          const result = await request(app)
            [method](route)
            .set(authorization(target.accessToken))
            .send({});
          assert.equal(result.status, expected);
          assert.equal(result.body.code, undefined);
        }
        await request(auth)
          .post("/internal/sessions/validate")
          .send({ accessToken: target.accessToken })
          .expect(403);
        const legacy = signAccessToken({ sub: target.user.id, role: "BUYER" });
        await request(auth).get("/me").set(authorization(legacy)).expect(401);
        const refreshed = await request(auth)
          .post("/refresh")
          .send({ refreshToken: target.refreshToken })
          .expect(200);
        assert.ok(verifyAccessToken(refreshed.body.accessToken).sid);
        await request(auth)
          .get("/me")
          .set(authorization(refreshed.body.accessToken))
          .expect(200);
        const mismatched = signAccessToken({
          sid: verifyAccessToken(target.accessToken).sid,
          sub: staff.user.id,
        });
        await request(auth)
          .get("/me")
          .set(authorization(mismatched))
          .expect(401);
      },
    );

    await t.test(
      "unauthorized and self suspension do not revoke valid sessions",
      async () => {
        await request(auth)
          .post(`/admin/users/${staff.user.id}/suspend`)
          .set(authorization(target.accessToken))
          .send({ reason: "not permitted" })
          .expect(403);
        await request(auth)
          .post(`/admin/users/${staff.user.id}/suspend`)
          .set(staffHeaders)
          .send({ reason: "self" })
          .expect(403);
        await request(auth).get("/me").set(staffHeaders).expect(200);
      },
    );

    await t.test(
      "suspend commits account, revocations and audit together",
      async () => {
        await request(auth)
          .post(`/admin/users/${target.user.id}/suspend`)
          .set(staffHeaders)
          .send({ reason: "confirmed test violation" })
          .expect(200);
        assert.equal(
          await prisma.refreshToken.count({
            where: { userId: target.user.id, revokedAt: null },
          }),
          0,
        );
        assert.equal(
          await prisma.adminAudit.count({
            where: { targetId: target.user.id, action: "USER_SUSPENDED" },
          }),
          1,
        );
        for (const session of oldSessions) {
          const direct = await request(auth)
            .get("/me")
            .set(authorization(session.accessToken))
            .expect(403);
          assert.equal(direct.body.code, "ACCOUNT_SUSPENDED");
          const refresh = await request(auth)
            .post("/refresh")
            .send({ refreshToken: session.refreshToken })
            .expect(403);
          assert.equal(refresh.body.code, "ACCOUNT_SUSPENDED");
        }
        const login = await request(auth)
          .post("/login")
          .send({ email: target.email, password })
          .expect(403);
        assert.equal(login.body.code, "ACCOUNT_SUSPENDED");
        await request(auth)
          .post("/login")
          .send({ email: target.email, password: "wrong password" })
          .expect(400);
        const viaGateway = await request(gateway)
          .get("/api/auth/me")
          .set(authorization(target.accessToken))
          .expect(403);
        assert.equal(viaGateway.body.code, "ACCOUNT_SUSPENDED");
        for (const [app, method, route] of directRoutes) {
          const result = await request(app)
            [method](route)
            .set(authorization(target.accessToken))
            .send({})
            .expect(403);
          assert.equal(result.body.code, "ACCOUNT_SUSPENDED");
        }
        await request(auth)
          .post(`/admin/users/${target.user.id}/suspend`)
          .set(staffHeaders)
          .send({ reason: "duplicate" })
          .expect(409);
        assert.equal(
          await prisma.adminAudit.count({
            where: { targetId: target.user.id, action: "USER_SUSPENDED" },
          }),
          1,
        );
      },
    );

    await t.test(
      "restore allows a new login without resurrecting previous sessions",
      async () => {
        await request(auth)
          .post(`/admin/users/${target.user.id}/restore`)
          .set(staffHeaders)
          .send({ reason: "test appeal accepted" })
          .expect(200);
        for (const session of oldSessions) {
          await request(gateway)
            .get("/api/auth/me")
            .set(authorization(session.accessToken))
            .expect(401);
          await request(auth)
            .post("/refresh")
            .send({ refreshToken: session.refreshToken })
            .expect(401);
        }
        const login = await request(auth)
          .post("/login")
          .send({ email: target.email, password })
          .expect(200);
        await request(gateway)
          .get("/api/auth/me")
          .set(authorization(login.body.accessToken))
          .expect(200);
        await request(auth)
          .post("/logout")
          .send({ refreshToken: login.body.refreshToken })
          .expect(204);
        await request(auth)
          .get("/me")
          .set(authorization(login.body.accessToken))
          .expect(401);
      },
    );

    await t.test(
      "restore also revokes sessions of accounts suspended before deployment",
      async () => {
        const legacyTarget = await register("legacy-suspended");
        await prisma.user.update({
          where: { id: legacyTarget.user.id },
          data: { status: "SUSPENDED" },
        });
        await request(auth)
          .post(`/admin/users/${legacyTarget.user.id}/restore`)
          .set(staffHeaders)
          .send({ reason: "legacy restoration" })
          .expect(200);
        await request(auth)
          .post("/refresh")
          .send({ refreshToken: legacyTarget.refreshToken })
          .expect(401);
        await request(auth)
          .get("/me")
          .set(authorization(legacyTarget.accessToken))
          .expect(401);
      },
    );

    await t.test(
      "concurrent login and suspend cannot leave an active session behind",
      async () => {
        const racing = await register("racing");
        const results = await Promise.allSettled([
          authService.login({ email: racing.email, password }),
          reportService.suspendUser({
            targetId: racing.user.id,
            staffId: staff.user.id,
            reason: "race check",
          }),
        ]);
        assert.equal(results[1].status, "fulfilled");
        if (results[0].status === "rejected")
          assert.equal(results[0].reason.code, "ACCOUNT_SUSPENDED");
        else
          await request(auth)
            .get("/me")
            .set(authorization(results[0].value.accessToken))
            .expect(403);
        assert.equal(
          await prisma.refreshToken.count({
            where: { userId: racing.user.id, revokedAt: null },
          }),
          0,
        );
      },
    );

    await t.test(
      "audit failure rolls back suspension and session revocation",
      async (subtest) => {
        const rollback = await register("rollback");
        const transaction = prisma.$transaction.bind(prisma);
        subtest.mock.method(prisma, "$transaction", (callback) =>
          transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(target, key) {
                  if (key === "adminAudit")
                    return {
                      create: async () => {
                        throw new Error("injected audit storage failure");
                      },
                    };
                  return target[key];
                },
              }),
            ),
          ),
        );
        await assert.rejects(
          reportService.suspendUser({
            targetId: rollback.user.id,
            staffId: staff.user.id,
            reason: "rollback check",
          }),
          /audit storage failure/,
        );
        assert.equal(
          (await prisma.user.findUnique({ where: { id: rollback.user.id } }))
            .status,
          "ACTIVE",
        );
        assert.equal(
          await prisma.refreshToken.count({
            where: { userId: rollback.user.id, revokedAt: null },
          }),
          1,
        );
        await request(auth)
          .get("/me")
          .set(authorization(rollback.accessToken))
          .expect(200);
      },
    );

    await t.test(
      "Auth unavailable returns 503 without allowing protected actions",
      async () => {
        await new Promise((resolve) => server.close(resolve));
        server = null;
        for (const [app, method, route] of [
          [gateway, "get", "/api/auth/me"],
          ...directRoutes,
        ]) {
          const result = await request(app)
            [method](route)
            .set(staffHeaders)
            .send({})
            .expect(503);
          assert.equal(result.body.code, "AUTH_UNAVAILABLE");
        }
      },
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuthUrl;
    await prisma.adminAudit.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.loginLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
