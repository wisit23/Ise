const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { clientFor, backfill, prepareChat } = require("./reference-codes.cjs");
const {
  REFERENCE_MODELS,
  normalizeReferenceCode,
} = require("../backend/shared/src/referenceCodes");

// Split PostgreSQL DDL without splitting PL/pgSQL dollar-quoted function bodies.
function statements(sql) {
  sql = sql.replace(/--[^\n]*/g, "");
  const result = [];
  let dollar = false,
    current = "";
  for (let i = 0; i < sql.length; i += 1) {
    if (sql.slice(i, i + 2) === "$$") {
      dollar = !dollar;
      current += "$$";
      i += 1;
    } else if (sql[i] === ";" && !dollar) {
      result.push(current);
      current = "";
    } else current += sql[i];
  }
  if (current.trim()) result.push(current);
  return result.filter((part) => part.replace(/--[^\n]*/g, "").trim());
}

const enabled = process.env.REQUIRE_REFERENCE_INTEGRATION === "1";
for (const service of ["auth", "product", "order", "support"]) {
  test(
    `${service}: actual SQL triggers allocate, preserve, backfill and retry inside transactions`,
    { skip: !enabled },
    async () => {
      const db = clientFor(service);
      const schema = `reference_test_${randomUUID().replaceAll("-", "")}`;
      const marker = new Error("rollback test schema");
      try {
        await assert.rejects(
          db.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
              await tx.$executeRawUnsafe(
                `SET LOCAL search_path = "${schema}", pg_catalog`,
              );
              const metadata = db._runtimeDataModel.models;
              for (const model of Object.keys(REFERENCE_MODELS[service])) {
                const table = metadata[model].dbName || model;
                await tx.$executeRawUnsafe(
                  `CREATE TABLE "${table}" (id TEXT PRIMARY KEY)`,
                );
                await tx.$executeRawUnsafe(
                  `INSERT INTO "${table}" (id) VALUES ('legacy')`,
                );
              }
              const sql = fs.readFileSync(
                path.resolve(
                  __dirname,
                  `../backend/services/${service}-service/prisma/migrations/20261024150000_add_reference_codes/migration.sql`,
                ),
                "utf8",
              );
              for (const statement of statements(sql))
                await tx.$executeRawUnsafe(statement);
              for (const [model, prefix] of Object.entries(
                REFERENCE_MODELS[service],
              )) {
                const table = metadata[model].dbName || model;
                const [created] = await tx.$queryRawUnsafe(
                  `INSERT INTO "${table}" (id, reference_code) VALUES ('new', 'CLIENT-SUPPLIED') RETURNING *`,
                );
                assert.equal(
                  normalizeReferenceCode(created.reference_code, prefix),
                  created.reference_code,
                );
                const [updated] = await tx.$queryRawUnsafe(
                  `UPDATE "${table}" SET id = id WHERE id='new' RETURNING *`,
                );
                assert.equal(updated.reference_code, created.reference_code);
                const [legacy] = await tx.$queryRawUnsafe(
                  `UPDATE "${table}" SET reference_code = NULL WHERE id='legacy' RETURNING *`,
                );
                assert.equal(
                  normalizeReferenceCode(legacy.reference_code, prefix),
                  legacy.reference_code,
                );
              }
              const [[model, prefix]] = Object.entries(
                REFERENCE_MODELS[service],
              );
              const table = metadata[model].dbName || model;
              await tx.$executeRawUnsafe("SAVEPOINT immutable_check");
              await assert.rejects(
                tx.$executeRawUnsafe(
                  `UPDATE "${table}" SET reference_code = 'changed' WHERE id='new'`,
                ),
              );
              await tx.$executeRawUnsafe(
                "ROLLBACK TO SAVEPOINT immutable_check",
              );
              // Force a duplicate first candidate, then a fresh one, using a local
              // entropy function. Production continues to use pg_catalog's CSPRNG.
              await tx.$executeRawUnsafe("CREATE SEQUENCE entropy_calls");
              await tx.$executeRawUnsafe(
                `CREATE FUNCTION gen_random_uuid() RETURNS UUID LANGUAGE plpgsql VOLATILE AS $$ BEGIN IF nextval('entropy_calls') <= 2 THEN RETURN '22222222-2222-4222-8222-222222222222'::uuid; ELSE RETURN '33333333-3333-4333-8333-333333333333'::uuid; END IF; END $$`,
              );
              // Recreate the allocator to invalidate its cached function resolution.
              const allocate = statements(sql).find((part) =>
                part.includes("CREATE FUNCTION reloop_allocate_reference"),
              );
              await tx.$executeRawUnsafe(
                allocate.replace(
                  "CREATE FUNCTION",
                  "CREATE OR REPLACE FUNCTION",
                ),
              );
              const [one] = await tx.$queryRawUnsafe(
                `SELECT reloop_allocate_reference('${prefix}') AS code`,
              );
              const [two] = await tx.$queryRawUnsafe(
                `SELECT reloop_allocate_reference('${prefix}') AS code`,
              );
              assert.notEqual(one.code, two.code);
              const [calls] = await tx.$queryRawUnsafe(
                "SELECT last_value FROM entropy_calls",
              );
              assert.equal(Number(calls.last_value), 3);
              await tx.$executeRawUnsafe("SAVEPOINT exhausted_check");
              await assert.rejects(
                tx.$queryRawUnsafe(
                  `SELECT reloop_allocate_reference('${prefix}')`,
                ),
              );
              await tx.$executeRawUnsafe(
                "ROLLBACK TO SAVEPOINT exhausted_check",
              );
              throw marker;
            },
            { timeout: 60000 },
          ),
          (error) => error === marker,
        );
        const [state] = await db.$queryRawUnsafe(
          "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present",
          schema,
        );
        assert.equal(state.present, false);
      } finally {
        await db.$disconnect();
      }
    },
  );
}

test(
  "concurrent PostgreSQL allocations keep distinct codes and original IDs",
  { skip: !enabled },
  async () => {
    const db = clientFor("auth");
    const schema = `reference_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await db.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(
            `SET LOCAL search_path = "${schema}", pg_catalog`,
          );
          for (const model of Object.keys(REFERENCE_MODELS.auth)) {
            const table = db._runtimeDataModel.models[model].dbName || model;
            await tx.$executeRawUnsafe(
              `CREATE TABLE "${table}" (id TEXT PRIMARY KEY)`,
            );
          }
          const sql = fs.readFileSync(
            path.resolve(
              __dirname,
              "../backend/services/auth-service/prisma/migrations/20261024150000_add_reference_codes/migration.sql",
            ),
            "utf8",
          );
          for (const statement of statements(sql))
            await tx.$executeRawUnsafe(statement);
        },
        { timeout: 60000 },
      );
      const rows = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          db.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(
                `SET LOCAL search_path = "${schema}", pg_catalog`,
              );
              const [row] = await tx.$queryRawUnsafe(
                "INSERT INTO users (id) VALUES ($1) RETURNING *",
                `original-${index}`,
              );
              assert.equal(row.id, `original-${index}`);
              return row;
            },
            { maxWait: 30000, timeout: 30000 },
          ),
        ),
      );
      assert.equal(new Set(rows.map((row) => row.reference_code)).size, 24);
      for (const row of rows)
        assert.equal(
          normalizeReferenceCode(row.reference_code, "USR"),
          row.reference_code,
        );
    } finally {
      // Generated test-only schema, never an application schema.
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    }
  },
);

test(
  "Mongo partial uniqueness and resumable backfill keep conversation ObjectIds",
  { skip: !enabled },
  async () => {
    const db = clientFor("chat");
    const originalUrl = new URL(process.env.DATABASE_URL_CHAT);
    const testName = `reference_test_${randomUUID().replaceAll("-", "")}`;
    originalUrl.hostname = ["mongo", "localhost"].includes(originalUrl.hostname)
      ? "127.0.0.1"
      : originalUrl.hostname;
    originalUrl.pathname = `/${testName}`;
    originalUrl.searchParams.set("directConnection", "true");
    const {
      PrismaClient,
    } = require("../backend/services/chat-service/src/generated/prisma-client");
    const isolated = new PrismaClient({
      datasources: { db: { url: originalUrl.toString() } },
    });
    try {
      await prepareChat(isolated);
      const a = await isolated.conversation.create({
        data: {
          contextType: "PRODUCT",
          contextKey: "legacy-a",
          createdBy: "fixture",
          participants: [],
          status: "ACTIVE",
        },
      });
      const b = await isolated.conversation.create({
        data: {
          contextType: "PRODUCT",
          contextKey: "legacy-b",
          createdBy: "fixture",
          participants: [],
          status: "ACTIVE",
          referenceCode: null,
        },
      });
      const first = await backfill(isolated, "chat", { batchSize: 1 });
      assert.equal(first[0].changed, 2);
      assert.equal(first[0].missing, 0);
      const rows = await isolated.conversation.findMany({
        orderBy: { contextKey: "asc" },
      });
      assert.deepEqual(
        rows.map((r) => r.id),
        [a.id, b.id],
      );
      assert.notEqual(rows[0].referenceCode, rows[1].referenceCode);
      const second = await backfill(isolated, "chat");
      assert.equal(second[0].changed, 0);
      await assert.rejects(
        isolated.conversation.update({
          where: { id: b.id },
          data: { referenceCode: rows[0].referenceCode },
        }),
        { code: "P2002" },
      );
    } finally {
      // This uniquely named database was created only by this test.
      await isolated.$runCommandRaw({ dropDatabase: 1 });
      await isolated.$disconnect();
      await db.$disconnect();
    }
  },
);

module.exports = { statements };
