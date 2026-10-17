const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");
process.env.JWT_ACCESS_SECRET ||= "style-profile-test-only-secret";
const { signAccessToken } = require("@reloop/shared");
const { createStyleProfileService } = require("./styleProfileService");
const EMPTY = {
  categories: [],
  styles: [],
  brands: [],
  sizes: [],
  unassignedSizes: [],
};
const PROFILE = {
  categories: ["เสื้อ", "รองเท้า"],
  styles: ["minimal", "vintage"],
  brands: ["Nike", "Uniqlo"],
  sizes: [
    { category: "เสื้อ", values: ["M", "L"] },
    { category: "รองเท้า", values: ["40", "41"] },
  ],
  unassignedSizes: [],
};
function memoryDatabase() {
  let rows = new Map();
  let transactions = 0;
  function client(store) {
    return {
      buyerProfile: {
        async findUnique({ where }) {
          return store.has(where.userId)
            ? structuredClone(store.get(where.userId))
            : null;
        },
        async upsert({ where }) {
          if (!store.has(where.userId))
            store.set(where.userId, { preferences: [] });
          return store.get(where.userId);
        },
      },
      buyerPreference: {
        async deleteMany({ where }) {
          const row = store.get(where.userId);
          row.preferences = row.preferences.filter(
            (p) =>
              !(
                p.kind === where.kind &&
                (where.category === undefined ||
                  (typeof where.category === "string"
                    ? p.category === where.category
                    : p.category !== where.category.not))
              ),
          );
        },
        async createMany({ data }) {
          for (const row of data) store.get(row.userId).preferences.push(row);
        },
      },
    };
  }
  return {
    buyerProfile: {
      async findUnique(args) {
        return client(rows).buyerProfile.findUnique(args);
      },
    },
    async $transaction(run) {
      transactions++;
      const copy = structuredClone(rows);
      const result = await run(client(copy));
      rows = copy;
      return result;
    },
    seed(userId, profile) {
      rows.set(userId, structuredClone(profile));
    },
    get transactions() {
      return transactions;
    },
  };
}
function canonical(value) {
  return {
    ...value,
    categories: [...value.categories].sort(),
    styles: [...value.styles].sort(),
    brands: [...value.brands].sort(),
    sizes: value.sizes
      .map((g) => ({ category: g.category, values: [...g.values].sort() }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    unassignedSizes: [...value.unassignedSizes].sort(),
  };
}
function same(actual, expected) {
  assert.deepEqual(canonical(actual), canonical(expected));
}

test("empty read does not create a profile", async () => {
  const db = memoryDatabase();
  same(await createStyleProfileService(db).get("one"), EMPTY);
  assert.equal(db.transactions, 0);
});
test("multiple selections survive reload, partial edit and full clear", async () => {
  const db = memoryDatabase(),
    service = createStyleProfileService(db);
  same(await service.update("one", PROFILE), PROFILE);
  same(await createStyleProfileService(db).get("one"), PROFILE);
  same(await service.update("one", { styles: ["sport"] }), {
    ...PROFILE,
    styles: ["sport"],
  });
  same(await service.update("one", EMPTY), EMPTY);
  same(await service.get("one"), EMPTY);
});
test("sizes with identical labels stay independent across categories", async () => {
  const service = createStyleProfileService(memoryDatabase());
  const profile = {
    ...PROFILE,
    sizes: [
      { category: "เสื้อ", values: ["M"] },
      { category: "รองเท้า", values: ["M"] },
    ],
  };
  same(await service.update("one", profile), profile);
  const updated = await service.update("one", {
    sizes: [
      { category: "เสื้อ", values: ["L"] },
      { category: "รองเท้า", values: ["M"] },
    ],
  });
  same(updated, {
    ...profile,
    sizes: [
      { category: "เสื้อ", values: ["L"] },
      { category: "รองเท้า", values: ["M"] },
    ],
  });
});
test("trims and deduplicates selections including repeated size groups", async () => {
  const service = createStyleProfileService(memoryDatabase());
  same(
    await service.update("one", {
      ...EMPTY,
      categories: [" เสื้อ ", "เสื้อ"],
      styles: ["minimal", "minimal"],
      sizes: [
        { category: "เสื้อ", values: [" M ", "M"] },
        { category: "เสื้อ", values: ["L"] },
      ],
    }),
    {
      ...EMPTY,
      categories: ["เสื้อ"],
      styles: ["minimal"],
      sizes: [{ category: "เสื้อ", values: ["M", "L"] }],
    },
  );
});
test("size groups are independent of favorite categories and support custom sizes", async () => {
  const db = memoryDatabase(),
    service = createStyleProfileService(db);
  const profile = {
    ...EMPTY,
    sizes: [
      { category: "เสื้อ", values: ["M", "XXL"] },
      { category: "รองเท้า", values: ["42.5"] },
      { category: "หมวก", values: ["58 cm"] },
    ],
  };
  same(await service.update("one", profile), profile);
  same(await createStyleProfileService(db).get("one"), profile);
  same(await service.update("one", { categories: ["กระเป๋า"] }), {
    ...profile,
    categories: ["กระเป๋า"],
  });
  same(await service.update("one", { categories: [] }), profile);
});
test("a failed replacement rolls back deletes and keeps the saved profile", async () => {
  const db = memoryDatabase();
  const service = createStyleProfileService(db);
  await service.update("one", PROFILE);
  const transaction = db.$transaction.bind(db);
  db.$transaction = (run) =>
    transaction((tx) => {
      tx.buyerPreference.createMany = async () => {
        throw new Error("write failed");
      };
      return run(tx);
    });
  await assert.rejects(
    service.update("one", { styles: ["sport"] }),
    /write failed/,
  );
  same(await service.get("one"), PROFILE);
});

test("legacy sizes remain unassigned until explicitly assigned or removed; clear never resurrects scalar columns", async () => {
  const db = memoryDatabase();
  db.seed("one", {
    favoriteCategory: "เสื้อ",
    sizePreference: "M",
    preferences: [
      { kind: "CATEGORY", category: "", value: "เสื้อ" },
      { kind: "SIZE", category: "", value: "M" },
    ],
  });
  const service = createStyleProfileService(db);
  same(await service.get("one"), {
    ...EMPTY,
    categories: ["เสื้อ"],
    unassignedSizes: ["M"],
  });
  same(
    await service.update("one", {
      sizes: [{ category: "เสื้อ", values: ["M"] }],
      unassignedSizes: [],
    }),
    {
      ...EMPTY,
      categories: ["เสื้อ"],
      sizes: [{ category: "เสื้อ", values: ["M"] }],
    },
  );
  same(await service.update("one", EMPTY), EMPTY);
  same(await service.get("one"), EMPTY);
});
for (const [name, body] of [
  ["empty", {}],
  ["null", null],
  ["unknown owner", { userId: "two", styles: [] }],
  ["scalar", { styles: "minimal" }],
  ["blank value", { brands: [" "] }],
  ["number", { styles: [12] }],
  ["oversized list", { brands: Array(101).fill("Nike") }],
  ["oversized text", { brands: ["x".repeat(101)] }],
  ["control character", { styles: ["a\nb"] }],
  ["missing size category", { sizes: [{ values: ["M"] }] }],
])
  test(`rejects ${name} before a transaction`, async () => {
    const db = memoryDatabase();
    await assert.rejects(
      createStyleProfileService(db).update("one", body),
      (e) => e.status === 400,
    );
    assert.equal(db.transactions, 0);
  });

test("HTTP route authenticates, isolates accounts, persists multi-select and clears", async (t) => {
  const app = require("../../app"),
    singleton = require("./styleProfileService");
  const db = memoryDatabase(),
    service = createStyleProfileService(db);
  const original = app.locals.validateAccessSession;
  app.locals.validateAccessSession = async () => {};
  t.after(() => {
    app.locals.validateAccessSession = original;
  });
  t.mock.method(singleton, "get", service.get);
  t.mock.method(singleton, "update", service.update);
  const route = "/me/style-profile",
    token = signAccessToken({ sub: "one", role: "BUYER" }),
    other = signAccessToken({ sub: "two", role: "SELLER" }),
    staff = signAccessToken({ sub: "staff", role: "MARKETING" });
  await request(app).get(route).expect(401);
  await request(app).patch(route).send(PROFILE).expect(401);
  await request(app)
    .patch(route)
    .auth(staff, { type: "bearer" })
    .send(PROFILE)
    .expect(403);
  same(
    (
      await request(app)
        .patch(route)
        .auth(token, { type: "bearer" })
        .send(PROFILE)
        .expect(200)
    ).body,
    PROFILE,
  );
  const loaded = await request(app)
    .get(route)
    .auth(token, { type: "bearer" })
    .expect(200);
  same(loaded.body, PROFILE);
  assert.equal(loaded.headers["cache-control"], "private, no-store");
  same(
    (
      await request(app)
        .get(route + "?userId=one")
        .auth(other, { type: "bearer" })
        .expect(200)
    ).body,
    EMPTY,
  );
  await request(app)
    .patch(route)
    .auth(other, { type: "bearer" })
    .send({ ...PROFILE, userId: "one" })
    .expect(400);
  same(await service.get("one"), PROFILE);
  same(
    (
      await request(app)
        .patch(route)
        .auth(token, { type: "bearer" })
        .send(EMPTY)
        .expect(200)
    ).body,
    EMPTY,
  );
});

test("migration preserves scalar sources, backfills unsplit values and leaves size categories unknown", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../../../prisma/migrations/20261015000000_multi_value_style_profile/migration.sql",
    ),
    "utf8",
  );
  assert.match(sql, /PRIMARY KEY \("user_id", "kind", "category", "value"\)/);
  assert.match(sql, /SELECT p\."user_id", selection\."kind", '', btrim/);
  for (const field of [
    "favorite_category",
    "style_preference",
    "size_preference",
    "brand_preference",
  ])
    assert.ok(sql.includes(`p."${field}"`));
  assert.doesNotMatch(
    sql,
    /DROP COLUMN|UPDATE "buyer_profiles"|string_to_array/i,
  );
});
