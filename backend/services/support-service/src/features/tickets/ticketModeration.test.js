const test = require("node:test");
const assert = require("node:assert/strict");
const { moderateTicket } = require("./ticketModeration");

const input = {
  ticketId: "t-1",
  userId: "trust-1",
  role: "TRUST_AND_SAFETY",
  version: 3,
  action: "warn",
  targetId: "buyer-1",
  reason: "reviewed evidence",
  authorization: "Bearer test",
};
for (const [label, ticket, role] of [
  ["unassigned", { assigneeId: null, status: "ESCALATED" }],
  ["not yet taken over from CS", { assigneeId: "cs-1", status: "ESCALATED" }],
  ["another owner", { assigneeId: "trust-2", status: "ESCALATED" }],
  ["closed", { assigneeId: "trust-1", status: "CLOSED" }],
  ["resolved", { assigneeId: "trust-1", status: "RESOLVED" }],
  ["customer role", { assigneeId: "trust-1", status: "ESCALATED" }, "BUYER"],
]) {
  test(`${label} cannot warn, ban or restrict before ownership checks pass`, async () => {
    let calls = 0;
    const dependencies = {
      model: { findById: async () => ({ ...ticket, version: 3 }) },
      fetch: async () => {
        calls++;
      },
    };
    for (const action of ["warn", "ban", "restrictBuyer", "restrictSeller"]) {
      await assert.rejects(
        moderateTicket(
          { ...input, role: role || input.role, action },
          dependencies,
        ),
        /claim this active ticket/,
      );
    }
    assert.equal(calls, 0);
  });
}
test("owner can moderate after takeover, with the original staff credentials", async () => {
  const requests = [];
  const dependencies = {
    model: {
      findById: async () => ({
        assigneeId: "trust-1",
        status: "ESCALATED",
        version: 3,
      }),
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  };
  for (const action of ["warn", "ban"])
    await moderateTicket({ ...input, action }, dependencies);
  assert.match(requests[0].url, /\/admin\/users\/buyer-1\/warn$/);
  assert.match(requests[1].url, /\/admin\/users\/buyer-1\/suspend$/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test");
  await assert.rejects(
    moderateTicket({ ...input, version: 2 }, dependencies),
    /ticket changed/,
  );
  assert.equal(requests.length, 2);
});
