const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REFERENCE_ALPHABET,
  REFERENCE_MODELS,
  generateReferenceCode,
  normalizeReferenceCode,
  createWithReferenceCode,
} = require("./referenceCodes");
const { referenceAliases } = require("./referenceAliases");

test("all registered entities use distinct prefixes and the agreed 60-bit alphabet", () => {
  assert.equal(REFERENCE_ALPHABET.length, 32);
  assert.equal(new Set(REFERENCE_ALPHABET).size, 32);
  const prefixes = Object.values(REFERENCE_MODELS).flatMap(Object.values);
  assert.equal(new Set(prefixes).size, 25);
  for (const prefix of prefixes) {
    const code = generateReferenceCode(prefix);
    assert.equal(code.length, 18);
    assert.equal(
      normalizeReferenceCode(code.toLowerCase().replaceAll("-", ""), prefix),
      code,
    );
  }
  for (const value of [
    "ORD-0000-OOOO-1111",
    "ZZZ-7K3M-9X2R-4T6W",
    "ORD-7K3M-9X2R-4T6W/",
    null,
  ])
    assert.equal(normalizeReferenceCode(value), null);
  assert.equal(normalizeReferenceCode("ORD-7K3M-9X2R-4T6W", "PAY"), null);
  assert.throws(() => generateReferenceCode("BAD"));
});

test("retry only a reference-code collision, preserving other unique-key semantics", async () => {
  let attempts = 0;
  const result = await createWithReferenceCode("CHT", async (code) => {
    attempts += 1;
    if (attempts === 1)
      throw { code: "P2002", meta: { target: ["reference_code"] } };
    return { id: "stable-object-id", referenceCode: code };
  });
  assert.equal(attempts, 2);
  assert.equal(
    normalizeReferenceCode(result.referenceCode),
    result.referenceCode,
  );
  const contextConflict = { code: "P2002", meta: { target: ["contextKey"] } };
  await assert.rejects(
    createWithReferenceCode("CHT", async () => {
      throw contextConflict;
    }),
    (error) => error === contextConflict,
  );
  attempts = 0;
  await assert.rejects(
    createWithReferenceCode("CHT", async () => {
      attempts += 1;
      throw {
        code: "P2002",
        meta: { target: "Conversation_reference_code_key" },
      };
    }),
    { code: "REFERENCE_CODE_EXHAUSTED" },
  );
  assert.equal(attempts, 5);
});

test("path aliases preserve authorization handlers, query strings and internal IDs", async () => {
  const seen = [];
  const middleware = referenceAliases(
    {
      order: {
        findFirst: async (args) => {
          seen.push(args);
          return { id: "existing-order" };
        },
      },
    },
    "order",
  );
  const req = { url: "/ord7k3m9x2r4t6w/pay?userId=unchanged" };
  let called = 0;
  await middleware(req, {}, (error) => {
    assert.ifError(error);
    called += 1;
  });
  assert.equal(req.url, "/existing-order/pay?userId=unchanged");
  assert.equal(called, 1);
  assert.equal(seen[0].where.referenceCode, "ORD-7K3M-9X2R-4T6W");
  const legacy = { url: "/existing-order/pay?orderId=ORD-7K3M-9X2R-4T6W" };
  await middleware(legacy, {}, assert.ifError);
  assert.equal(seen.length, 2);
  assert.equal(legacy.url, "/existing-order/pay?orderId=existing-order");
});
