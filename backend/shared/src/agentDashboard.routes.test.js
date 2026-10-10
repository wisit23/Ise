const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "dashboard-test-only-secret";
process.env.JWT_REFRESH_SECRET ||= "dashboard-test-only-refresh";
const { signAccessToken } = require("./jwt");

for (const [service, path] of [
  ["support", "/tickets/agent-dashboard"],
  ["order", "/disputes/agent-dashboard"],
]) {
  const app = require(`../../services/${service}-service/src/app`);
  const db = require(
    `../../services/${service}-service/src/models/prismaClient`,
  );
  app.locals.validateAccessSession = async () => {};
  test(`${service} dashboard authenticates, validates and binds identity before querying`, async (t) => {
    const calls = [];
    t.mock.method(
      require("./awaitingReply"),
      "awaitingReplyIds",
      async () => [],
    );
    t.mock.method(db, "$queryRaw", async (query) => {
      calls.push(query);
      return [{ dashboard: { total: 0, items: [] } }];
    });
    await request(app).get(path).expect(401);
    const buyer = signAccessToken({ sub: "buyer", role: "BUYER" });
    await request(app).get(path).auth(buyer, { type: "bearer" }).expect(403);
    const agent = signAccessToken({
      sub: "session-agent",
      role: "CUSTOMER_SERVICE",
    });
    await request(app)
      .get(path + "?focus=team")
      .auth(agent, { type: "bearer" })
      .expect(400);
    assert.equal(calls.length, 0);
    const response = await request(app)
      .get(path + "?userId=someone-else&scope=all")
      .auth(agent, { type: "bearer" })
      .expect(200);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.ok(calls[0].values.includes("session-agent"));
    assert.ok(!calls[0].values.includes("someone-else"));
  });
}
