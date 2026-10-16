const test = require("node:test");
const assert = require("node:assert/strict");
const { createCsat, validateRating, summarize } = require("./csat");

test("CSAT validates integer stars and optional feedback", () => {
  for (const rating of [0, 6, 2.5, "5", null, true, undefined])
    assert.throws(() => validateRating({ rating }), { status: 400 });
  assert.throws(() => validateRating({ rating: 5, comment: {} }), {
    status: 400,
  });
  assert.throws(
    () => validateRating({ rating: 5, comment: "x".repeat(1001) }),
    { status: 400 },
  );
  assert.deepEqual(validateRating({ rating: 4, comment: " ดี " }), {
    rating: 4,
    comment: "ดี",
  });
  assert.deepEqual(validateRating({ rating: 1 }), { rating: 1, comment: "" });
});

test("CSAT uses satisfied responses, rather than a normalized star average", () => {
  assert.equal(summarize([]).percent, null);
  const result = summarize([
    { rating: 1, count: 1 },
    { rating: 4, count: 2 },
    { rating: 5, count: 1 },
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.percent, 75);
  assert.equal(result.average, 3.5);
  assert.equal(result.distribution.length, 5);
});

function fixture() {
  const responses = new Map();
  const item = {
    participants: { buyer: "BUYER", seller: "SELLER" },
    complete: true,
    agentId: "cs",
  };
  const db = {
    $transaction: (fn) => fn(db),
    async $queryRaw(query) {
      const [id, userId] = query.values;
      if (query.text.includes("SELECT rating, comment"))
        return [responses.get(`${id}:${userId}`)].filter(Boolean);
      if (query.text.includes("INSERT INTO")) {
        const row = {
          rating: query.values[4],
          comment: query.values[5],
          createdAt: new Date(),
        };
        responses.set(`${id}:${userId}`, row);
        return [row];
      }
      throw new Error("Unexpected query");
    },
  };
  const Prisma = {
    sql: (strings, ...values) => ({ text: strings.join("?"), values }),
  };
  return {
    item,
    responses,
    csat: createCsat({ db, Prisma, readCase: async () => item }),
  };
}

test("only case participants may rate a completed case and see their own response", async () => {
  const { csat, item } = fixture();
  await assert.rejects(csat.read("case", "stranger"), { status: 403 });
  await assert.rejects(csat.submit("case", "cs", { rating: 5 }), {
    status: 403,
  });
  item.complete = false;
  assert.equal((await csat.read("case", "buyer")).eligible, false);
  await assert.rejects(csat.submit("case", "buyer", { rating: 5 }), {
    status: 409,
  });
  item.complete = true;
  await csat.submit("case", "buyer", { rating: 5, comment: "great" });
  assert.equal((await csat.read("case", "buyer")).response.rating, 5);
  assert.equal((await csat.read("case", "seller")).response, null);
  item.deleted = true;
  await assert.rejects(csat.read("case", "buyer"), { status: 404 });
});

test("buyer/seller vote independently; retries are idempotent and changes are rejected", async () => {
  const { csat, responses } = fixture();
  await csat.submit("case", "buyer", { rating: 5 });
  await csat.submit("case", "seller", { rating: 2 });
  await csat.submit("case", "buyer", { rating: 5 });
  assert.equal(responses.size, 2);
  await assert.rejects(csat.submit("case", "buyer", { rating: 4 }), {
    status: 409,
  });
  await assert.rejects(
    csat.submit("case", "buyer", { rating: 5, comment: "changed" }),
    { status: 409 },
  );
});
