const test = require("node:test");
const assert = require("node:assert/strict");
const { createProductNameClient } = require("./productNameClient");

process.env.INTERNAL_SERVICE_TOKEN ||= "product-name-client-token";

const answer =
  (body, status = 200) =>
  async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

test("asks product-service once for every product, with the service token", async () => {
  const calls = [];
  const client = createProductNameClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return answer({
        data: [
          { id: "p1", title: "กางเกง", deleted: false },
          { id: "p2", title: "เสื้อ", deleted: true },
        ],
      })();
    },
  });

  const names = await client.getNames(["p1", "p2", "p1", "", undefined]);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/internal\/executive\/product-names$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.headers["x-internal-token"],
    process.env.INTERNAL_SERVICE_TOKEN,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), { ids: ["p1", "p2"] });
  assert.deepEqual(names.get("p1"), { title: "กางเกง", deleted: false });
  assert.deepEqual(names.get("p2"), { title: "เสื้อ", deleted: true });
});

test("asks nothing when there is no product", async () => {
  const client = createProductNameClient({
    fetchImpl: async () => assert.fail("product-service must not be asked"),
  });
  assert.equal((await client.getNames([])).size, 0);
  assert.equal((await client.getNames([null, ""])).size, 0);
});

test("splits more products than one request may carry", async () => {
  const sizes = [];
  const client = createProductNameClient({
    fetchImpl: async (url, init) => {
      const ids = JSON.parse(init.body).ids;
      sizes.push(ids.length);
      return answer({
        data: ids.map((id) => ({ id, title: id, deleted: false })),
      })();
    },
  });
  const ids = Array.from({ length: 230 }, (_, i) => `p${i}`);
  const names = await client.getNames(ids);
  assert.deepEqual(sizes, [100, 100, 30]);
  assert.equal(names.size, 230);
});

test("says it is unavailable rather than answering with nothing", async () => {
  const cases = {
    unreachable: async () => {
      throw new Error("ECONNREFUSED");
    },
    "an error answer": answer({ error: "boom" }, 500),
    "an invalid answer": answer({ nope: true }),
    "a row without a title": answer({ data: [{ id: "p1", deleted: false }] }),
  };
  for (const [name, fetchImpl] of Object.entries(cases)) {
    const client = createProductNameClient({ fetchImpl });
    await assert.rejects(
      () => client.getNames(["p1"]),
      (error) => error.status === 502,
      name,
    );
  }
});

test("needs the service token", async () => {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  delete process.env.INTERNAL_SERVICE_TOKEN;
  try {
    const client = createProductNameClient({
      fetchImpl: answer({ data: [] }),
    });
    await assert.rejects(
      () => client.getNames(["p1"]),
      (error) => error.status === 500,
    );
  } finally {
    process.env.INTERNAL_SERVICE_TOKEN = token;
  }
});
