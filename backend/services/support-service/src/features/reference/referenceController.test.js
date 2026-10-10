const test = require("node:test");
const assert = require("node:assert/strict");
const { listCategories, clientConfig } = require("./referenceController");

test("categories come from active database rows and may contain new codes", async () => {
  for (const delegate of ["ticketCategory", "helpCategory"]) {
    const db = {
      [delegate]: {
        findMany: async (query) => {
          assert.deepEqual(query.where, { isActive: true });
          return [
            { code: "SHIPPING", nameTh: "การจัดส่ง", nameEn: "Shipping" },
          ];
        },
      },
    };
    assert.deepEqual(await listCategories(delegate, db), [
      { value: "SHIPPING", label: "การจัดส่ง" },
    ]);
  }
});

test("client config contains only presentation/limits, not server credentials or policy rules", () => {
  let payload;
  clientConfig(
    {},
    {
      set() {},
      json(value) {
        payload = value;
      },
    },
  );
  assert.ok(payload.chat.maxMessageLength > 0);
  assert.ok(payload.dashboard.warningMinutes > 0);
  assert.equal(payload.classification, undefined);
  assert.equal(payload.dependencyTimeoutMs, undefined);
  assert.equal(payload.INTERNAL_SERVICE_TOKEN, undefined);
});
