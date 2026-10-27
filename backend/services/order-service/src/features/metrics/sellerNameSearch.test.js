const test = require("node:test");
const assert = require("node:assert/strict");
const { createSellerNameSearch } = require("./sellerNameSearch");

process.env.INTERNAL_SERVICE_TOKEN ||= "seller-name-search-token";

const answer =
  (body, status = 200) =>
  async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

test("finds the users whose shop or name matches, from auth-service", async () => {
  const calls = [];
  const search = createSellerNameSearch({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return answer({ sellerIds: ["u1", "u2", "u1"], nextCursor: null })();
    },
  });

  assert.deepEqual(await search.findUserIds("ร้านบี"), ["u1", "u2"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/executive\/seller-search$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.headers["x-internal-token"],
    process.env.INTERNAL_SERVICE_TOKEN,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), { q: "ร้านบี" });
});

test("sends literal search text for the owning service to escape", async () => {
  let sent;
  const search = createSellerNameSearch({
    fetchImpl: async (url, init) => {
      sent = JSON.parse(init.body).q;
      return answer({ sellerIds: [], nextCursor: null })();
    },
  });
  await search.findUserIds("50%");
  assert.equal(sent, "50%");
  await search.findUserIds("a_b");
  assert.equal(sent, "a_b");
});

test("reads every page and shares one deadline across the complete search", async () => {
  const calls = [];
  const search = createSellerNameSearch({
    fetchImpl: async (url, init) => {
      calls.push(init);
      const cursor = JSON.parse(init.body).cursor;
      return answer(
        cursor
          ? { sellerIds: ["seller-last"], nextCursor: null }
          : {
              sellerIds: Array.from(
                { length: 100 },
                (_, index) => `seller-${index}`,
              ),
              nextCursor: "seller-99",
            },
      )();
    },
  });
  const ids = await search.findUserIds("ร้าน");
  assert.equal(ids.length, 101);
  assert.equal(ids.at(-1), "seller-last");
  assert.equal(JSON.parse(calls[1].body).cursor, "seller-99");
  assert.equal(calls[0].signal, calls[1].signal);
});

test("refuses a repeated cursor rather than returning an incomplete result", async () => {
  const search = createSellerNameSearch({
    fetchImpl: answer({ sellerIds: ["u1"], nextCursor: "u1" }),
  });
  await assert.rejects(
    () => search.findUserIds("ร้าน"),
    (error) => error.status === 502,
  );
});

test("does not ask for a whole reference code, which names a case", async () => {
  const search = createSellerNameSearch({
    fetchImpl: async () => assert.fail("auth-service must not be asked"),
  });
  assert.deepEqual(await search.findUserIds("DSP-C85T-UZSJ-NEBM"), []);
  assert.deepEqual(await search.findUserIds("dsp-c85t-uzsj-nebm"), []);
  assert.deepEqual(await search.findUserIds(""), []);
  assert.deepEqual(await search.findUserIds(undefined), []);
});

test("says it is unavailable rather than finding nothing", async () => {
  const cases = {
    unreachable: async () => {
      throw new Error("ECONNREFUSED");
    },
    "an error answer": answer({ error: "boom" }, 500),
    "an invalid answer": answer({ sellerIds: ["u1"] }),
    "rows without a user": answer([{ displayName: "x" }]),
  };
  for (const [name, fetchImpl] of Object.entries(cases)) {
    const search = createSellerNameSearch({ fetchImpl });
    await assert.rejects(
      () => search.findUserIds("ร้านบี"),
      (err) => err.status === 502,
      name,
    );
  }
});

test("needs the service token", async () => {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  delete process.env.INTERNAL_SERVICE_TOKEN;
  try {
    const search = createSellerNameSearch({ fetchImpl: answer([]) });
    await assert.rejects(
      () => search.findUserIds("ร้านบี"),
      (err) => err.status === 500,
    );
  } finally {
    process.env.INTERNAL_SERVICE_TOKEN = token;
  }
});
