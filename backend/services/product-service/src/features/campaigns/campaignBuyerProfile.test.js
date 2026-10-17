const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveBuyerProfile } = require("./campaignBuyerProfile");

test("campaign buyer profile uses the authenticated persisted profile", async () => {
  const saved = {
    categories: ["เสื้อ"],
    styles: ["Vintage"],
    brands: [],
    sizes: [],
    unassignedSizes: [],
  };
  let receivedAuthorization;
  const profile = await resolveBuyerProfile(
    {
      userId: "buyer-1",
      headers: { authorization: "Bearer signed-token" },
      query: { profile: JSON.stringify({ styles: ["spoofed"] }) },
    },
    {
      get: async (authorization) => {
        receivedAuthorization = authorization;
        return saved;
      },
    },
  );

  assert.equal(receivedAuthorization, "Bearer signed-token");
  assert.deepEqual(profile, saved);
});

test("campaign buyer profile fails closed for guests and Auth outages", async () => {
  let calls = 0;
  const profiles = {
    get: async () => {
      calls += 1;
      throw new Error("Auth unavailable");
    },
  };

  assert.equal(
    await resolveBuyerProfile({ userId: null, headers: {} }, profiles),
    null,
  );
  assert.equal(calls, 0);
  assert.equal(
    await resolveBuyerProfile(
      { userId: "buyer-1", headers: { authorization: "Bearer token" } },
      profiles,
    ),
    null,
  );
  assert.equal(calls, 1);
});
