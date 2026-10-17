const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
const marketingSalesMetrics = require("./marketingSalesMetrics");
const router = require("./marketingMetricsRoutes");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function getSalesDashboardHandlers() {
  const layer = router.stack.find(
    (candidate) =>
      candidate.route?.path === "/sales-dashboard" &&
      candidate.route.methods.get,
  );
  assert.ok(layer, "GET /sales-dashboard must be registered");
  return layer.route.stack.map((candidate) => candidate.handle);
}

test("marketing sales dashboard route authenticates and restricts access to MARKETING", async () => {
  const [authenticate, authorise] = getSalesDashboardHandlers();
  const app = { locals: { validateAccessSession: async () => ({}) } };

  const marketingRequest = {
    app,
    headers: {
      authorization: `Bearer ${signAccessToken({
        sub: "marketing-dashboard-test",
        role: "MARKETING",
      })}`,
    },
  };
  let authenticated = false;
  await authenticate(marketingRequest, responseRecorder(), () => {
    authenticated = true;
  });
  assert.equal(authenticated, true);
  assert.equal(marketingRequest.userRole, "MARKETING");

  let authorised = false;
  authorise(marketingRequest, responseRecorder(), () => {
    authorised = true;
  });
  assert.equal(authorised, true);

  const forbiddenResponse = responseRecorder();
  authorise({ userRole: "BUYER" }, forbiddenResponse, () => {});
  assert.equal(forbiddenResponse.statusCode, 403);

  const unauthenticatedResponse = responseRecorder();
  await authenticate(
    { app, headers: {} },
    unauthenticatedResponse,
    () => {},
  );
  assert.equal(unauthenticatedResponse.statusCode, 401);
});

test("marketing sales dashboard route delegates to the metrics service", async (t) => {
  const handlers = getSalesDashboardHandlers();
  const controller = handlers.at(-1);
  const original = marketingSalesMetrics.getSalesDashboard;
  t.after(() => {
    marketingSalesMetrics.getSalesDashboard = original;
  });
  marketingSalesMetrics.getSalesDashboard = async ({ from, to }) => ({
    total: { sales: 100 },
    requestedRange: { from, to },
  });

  const response = responseRecorder();
  await controller(
    {
      query: {
        from: "2026-10-01T00:00:00+07:00",
        to: "2026-10-08T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      },
    },
    response,
    (error) => {
      throw error;
    },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.total.sales, 100);
  assert.equal(response.body.meta.timezone, "Asia/Bangkok");
});
