// Opt-in, destructive rehearsal ONLY in the named disposable worker database.
// AUTH_ER_REHEARSAL=1 DATABASE_URL_AUTH=postgresql://er_test:er_test@localhost:55439/auth_worker_er
// (or the separate archive database: .../auth_archive_er)
// node --test backend/services/auth-service/test/approved-er.integration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const serviceRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceRoot, "../../..");
const migrationRoot = path.join(serviceRoot, "prisma/migrations");
const keysMigration = "20261014000000_approved_er_keys_and_auto_messages";
const latest = "20261014010000_archive_legacy_auth_tables";
const container = "ise-er-rehearsal-20261014";
const allowedDatabases = ["auth_worker_er", "auth_archive_er"];
const database = (() => {
  try {
    return new URL(process.env.DATABASE_URL_AUTH || "").pathname.slice(1);
  } catch {
    return "";
  }
})();
const archivedTables = [
  "legacy_admin_operations_20261010",
  "legacy_bulk_action_runs_20261010",
  "legacy_report_versions_20261010",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: serviceRoot,
    env: process.env,
    ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

function sql(statement, expectFailure = false) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "er_test",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: statement, encoding: "utf8" },
  );
  assert.ifError(result.error);
  if (expectFailure) {
    assert.notEqual(result.status, 0);
    return result.stderr;
  }
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function prismaCli(args) {
  return run(process.execPath, [
    require.resolve("prisma/build/index.js"),
    ...args,
  ]);
}

// Read the actual uncompressed Auth ข้อ 1 diagram, not its historical audit or
// database/*.prisma copy. Attributes are direct ID edges in this diagram.
function erColumns() {
  const xml = fs.readFileSync(
    path.join(repoRoot, "database/erdesign/Auth Service/ข้อ 1/ER_auth.drawio"),
    "utf8",
  );
  const decode = (s) =>
    s
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  const cells = [...xml.matchAll(/<mxCell\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(/([\w]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]),
    ),
  );
  const text = (c) => (c.value || "").replace(/<[^>]*>/g, "").trim();
  const byId = new Map(cells.map((c) => [c.id, c]));
  const result = {};
  for (const entity of cells.filter(
    (c) => /shape=rectangle/.test(c.style) && c.vertex === "1" && text(c),
  )) {
    const entityIds = new Set([entity.id]);
    if (entity.parent !== "1") entityIds.add(entity.parent);
    const attributes = new Set();
    for (const edge of cells.filter((c) => c.edge === "1")) {
      const other = entityIds.has(edge.source)
        ? edge.target
        : entityIds.has(edge.target)
          ? edge.source
          : null;
      const attribute = byId.get(other);
      if (attribute && /ellipse/.test(attribute.style)) {
        attributes.add(
          text(attribute)
            .replace(/\s*\[.*?\]|\s*\(.*?\)/g, "")
            .trim(),
        );
      }
    }
    if (attributes.size) result[text(entity)] = [...attributes].sort();
  }
  assert.equal(Object.keys(result).length, 17);
  return result;
}

test(
  "approved Auth ER fresh/populated/legacy rehearsal",
  {
    skip: process.env.AUTH_ER_REHEARSAL !== "1",
    timeout: 180000,
  },
  async (t) => {
    const url = new URL(process.env.DATABASE_URL_AUTH || "");
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
    assert.equal(url.port, "55439");
    assert.ok(allowedDatabases.includes(database));
    assert.equal(url.pathname, `/${database}`);
    assert.ok(!url.search || url.search === "?schema=public");
    // All child processes and consumers see ONLY this validated URL, even if
    // the shell had a real DATABASE_URL. No .env writes or client generation.
    process.env.DATABASE_URL = url.href;
    process.env.DATABASE_URL_AUTH = url.href;
    process.env.JWT_ACCESS_SECRET = "auth-er-disposable-access";
    process.env.JWT_REFRESH_SECRET = "auth-er-disposable-refresh";
    const { PrismaClient, Prisma } = require("@prisma/client");
    assert.ok(
      Prisma.dmmf.datamodel.models.some((m) => m.name === "AutoMessage"),
      "Generate ONLY the Auth client before running this rehearsal",
    );
    const prisma = new PrismaClient();
    const sharedPrisma = require("../src/models/prismaClient");
    const request = require("supertest");
    const app = require("../src/app");
    const expected = erColumns();
    const migrations = fs
      .readdirSync(migrationRoot)
      .filter((n) => /^\d/.test(n))
      .sort();
    assert.equal(migrations.at(-1), latest);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auth-er-rehearsal-"));
    fs.copyFileSync(
      path.join(serviceRoot, "prisma/schema.prisma"),
      path.join(tmp, "schema.prisma"),
    );
    fs.mkdirSync(path.join(tmp, "migrations"));
    fs.copyFileSync(
      path.join(migrationRoot, "migration_lock.toml"),
      path.join(tmp, "migrations/migration_lock.toml"),
    );

    async function reset() {
      await prisma.$disconnect();
      await sharedPrisma.$disconnect();
      sql(
        "DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS legacy_archive CASCADE; CREATE SCHEMA public;",
      );
    }
    function deployThrough(count) {
      for (const migration of migrations.slice(0, count)) {
        fs.cpSync(
          path.join(migrationRoot, migration),
          path.join(tmp, "migrations", migration),
          { recursive: true },
        );
      }
      prismaCli([
        "migrate",
        "deploy",
        "--schema",
        path.join(tmp, "schema.prisma"),
      ]);
    }
    async function inventory() {
      const columns =
        await prisma.$queryRawUnsafe(`SELECT table_name, column_name
      FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2`);
      for (const [table, names] of Object.entries(expected)) {
        assert.deepEqual(
          columns
            .filter((c) => c.table_name === table)
            .map((c) => c.column_name),
          names,
          table,
        );
      }
      // The approved ER owns public. Preserved archives live outside it.
      const tables = [...new Set(columns.map((c) => c.table_name))];
      assert.deepEqual(
        tables.filter(
          (name) => !expected[name] && name !== "_prisma_migrations",
        ),
        [],
      );
      assert.deepEqual(
        (
          await prisma.$queryRawUnsafe(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'legacy\\_%' ORDER BY 1",
          )
        ).map((r) => r.tablename),
        [],
      );
      const constraints =
        await prisma.$queryRawUnsafe(`SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid IN ('shop_change_request_items'::regclass,'auto_messages'::regclass)`);
      const definition = (name) =>
        constraints.find((c) => c.conname === name)?.definition;
      assert.equal(
        definition("shop_change_request_items_pkey"),
        "PRIMARY KEY (requests_id, field_name)",
      );
      assert.match(
        definition("shop_change_request_items_requests_id_fkey"),
        /FOREIGN KEY \(requests_id\) REFERENCES shop_change_requests\(requests_id\) ON UPDATE CASCADE ON DELETE CASCADE/,
      );
      assert.equal(
        definition("auto_messages_pkey"),
        "PRIMARY KEY (message_id)",
      );
      assert.match(
        definition("auto_messages_user_id_fkey"),
        /FOREIGN KEY \(user_id\) REFERENCES seller_profiles\(user_id\) ON UPDATE CASCADE ON DELETE CASCADE/,
      );
      const [index] =
        await prisma.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='shop_change_request_items_id_key'`);
      assert.match(index.indexdef, /CREATE UNIQUE INDEX.*\(id\)/);
      const [pendingIndex] =
        await prisma.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes
        WHERE schemaname='public' AND indexname='shop_change_requests_one_pending_per_seller'`);
      assert.match(
        pendingIndex.indexdef,
        /CREATE UNIQUE INDEX.*\(seller_id\).*WHERE.*PENDING/,
      );
      const [count] =
        await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
      assert.equal(count.count, 9);
    }
    async function snapshot() {
      const result = {};
      for (const table of Object.keys(expected).filter(
        (n) => n !== "auto_messages",
      )) {
        result[table] = await prisma.$queryRawUnsafe(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY 1`,
        );
      }
      return result;
    }
    async function user(id, role = "SELLER") {
      const bcrypt = require("bcryptjs");
      return prisma.user.create({
        data: {
          id,
          email: `${id}@example.test`,
          passwordHash: await bcrypt.hash("er-worker-password", 4),
          firstName: "ER",
          lastName: "Worker",
          role,
          ...(role === "SELLER"
            ? {
                sellerProfile: {
                  create: {
                    shopName: "Old Shop",
                    address: "Old Address",
                    bankAccount: "111",
                  },
                },
              }
            : {}),
        },
      });
    }
    async function token(id) {
      const response = await request(app)
        .post("/login")
        .send({ email: `${id}@example.test`, password: "er-worker-password" });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body.accessToken;
    }
    async function consumer(prefix) {
      await user(`${prefix}-seller`);
      await user(`${prefix}-admin`, "ADMIN");
      const sellerToken = await token(`${prefix}-seller`);
      const adminToken = await token(`${prefix}-admin`);
      const post = (payload) =>
        request(app)
          .post("/shop/change-request")
          .auth(sellerToken, { type: "bearer" })
          .send(payload);
      const decide = (id, decision) =>
        request(app)
          .patch(`/admin/shop/change-requests/${id}/decide`)
          .auth(adminToken, { type: "bearer" })
          .send({ decision, adminNote: " verified " });
      const payload = {
        shopName: "New Shop",
        address: "New Address",
        bankAccount: "222",
        comment: " rebrand ",
      };
      const submitted = await post(payload);
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      assert.equal(submitted.body.comment, "rebrand");
      assert.equal(submitted.body.shopName, payload.shopName);
      assert.equal(submitted.body.address, payload.address);
      assert.equal(submitted.body.bankAccount, payload.bankAccount);
      assert.equal(submitted.body.items.length, 3);
      const ids = submitted.body.items.map((i) => i.id).sort();
      assert.ok(ids.every(Boolean));
      assert.equal((await post(payload)).status, 409);
      const queue = await request(app)
        .get("/admin/shop/change-requests")
        .auth(adminToken, { type: "bearer" });
      assert.equal(queue.status, 200);
      assert.ok(
        queue.body.items.some(
          (r) => r.id === submitted.body.id && r.shopName === "New Shop",
        ),
      );
      assert.equal(
        (
          await request(app)
            .get("/admin/shop/change-requests")
            .auth(sellerToken, { type: "bearer" })
        ).status,
        403,
      );
      const approved = await decide(submitted.body.id, "APPROVED");
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      assert.equal(approved.body.status, "APPROVED");
      assert.deepEqual(approved.body.items.map((i) => i.id).sort(), ids);
      const profile = await request(app)
        .get("/shop/profile")
        .auth(sellerToken, { type: "bearer" });
      assert.deepEqual(profile.body, {
        shopName: "New Shop",
        address: "New Address",
        bankAccount: "222",
      });
      assert.equal((await decide(submitted.body.id, "APPROVED")).status, 409);
      const rejected = await post({
        shopName: "Rejected Shop",
        comment: "test rejection",
      });
      assert.equal(rejected.status, 201);
      assert.equal((await decide(rejected.body.id, "REJECTED")).status, 200);
      assert.equal(
        (
          await prisma.sellerProfile.findUnique({
            where: { userId: `${prefix}-seller` },
          })
        ).shopName,
        "New Shop",
      );
      // A stale old-value conflict must leave both profile and request untouched.
      const stale = await post({
        shopName: "Stale Shop",
        bankAccount: "333",
        comment: "test stale",
      });
      assert.equal(stale.status, 201);
      await prisma.sellerProfile.update({
        where: { userId: `${prefix}-seller` },
        data: { bankAccount: "external" },
      });
      assert.equal((await decide(stale.body.id, "APPROVED")).status, 409);
      assert.equal(
        (
          await prisma.sellerProfile.findUnique({
            where: { userId: `${prefix}-seller` },
          })
        ).shopName,
        "New Shop",
      );
      assert.equal(
        (
          await prisma.shopChangeRequest.findUnique({
            where: { id: stale.body.id },
          })
        ).status,
        "PENDING",
      );
      const mine = await request(app)
        .get("/shop/change-requests")
        .auth(sellerToken, { type: "bearer" });
      assert.equal(mine.status, 200);
      assert.equal(mine.body.items.length, 3);
    }

    try {
      await t.test(
        "fresh nine-migration install, actual ER column sets/keys and consumer",
        async () => {
          await reset();
          prismaCli([
            "migrate",
            "deploy",
            "--schema",
            path.join(serviceRoot, "prisma/schema.prisma"),
          ]);
          await inventory();
          await consumer("fresh");
        },
      );
      await t.test(
        "AutoMessage CRUD/default/FK and item composite-key rejection/rollback",
        async () => {
          await user("crud-seller");
          await user("crud-buyer", "BUYER");
          const message = await prisma.autoMessage.create({
            data: { userId: "crud-seller", messageText: "Hello" },
          });
          assert.match(
            message.id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          assert.equal(message.isActive, false);
          // M cardinality: no invented one-message/one-active-message uniqueness.
          await prisma.autoMessage.create({
            data: {
              userId: "crud-seller",
              messageText: "Second",
              isActive: true,
            },
          });
          await prisma.autoMessage.update({
            where: { id: message.id },
            data: { messageText: "Updated", isActive: true },
          });
          assert.equal(
            (await prisma.autoMessage.findUnique({ where: { id: message.id } }))
              .messageText,
            "Updated",
          );
          const [rawDefault] =
            await prisma.$queryRawUnsafe(`INSERT INTO auto_messages(message_id,user_id,message_text)
        VALUES ('raw-default','crud-seller','SQL default') RETURNING is_active`);
          assert.equal(rawDefault.is_active, false);
          assert.match(
            sql(
              "INSERT INTO auto_messages(message_id,user_id) VALUES ('missing-text','crud-seller');",
              true,
            ),
            /not-null constraint/,
          );
          for (const id of ["missing-user", "crud-buyer"]) {
            await assert.rejects(
              prisma.autoMessage.create({
                data: { userId: id, messageText: "Invalid seller" },
              }),
              { code: "P2003" },
            );
          }
          await assert.rejects(
            prisma.autoMessage.create({
              data: {
                id: message.id,
                userId: "crud-seller",
                messageText: "Duplicate",
              },
            }),
            { code: "P2002" },
          );
          const parent = await prisma.shopChangeRequest.create({
            data: { sellerId: "crud-seller", comment: "key checks" },
          });
          const item = await prisma.shopChangeRequestItem.create({
            data: {
              id: "legacy-item-id",
              requestId: parent.id,
              fieldName: "shop_name",
              oldValue: "Old Shop",
              newValue: "New",
            },
          });
          await assert.rejects(
            prisma.shopChangeRequestItem.create({
              data: {
                requestId: parent.id,
                fieldName: "shop_name",
                newValue: "duplicate pair",
              },
            }),
            { code: "P2002" },
          );
          await assert.rejects(
            prisma.shopChangeRequestItem.create({
              data: {
                id: item.id,
                requestId: parent.id,
                fieldName: "address",
                newValue: "duplicate id",
              },
            }),
            { code: "P2002" },
          );
          await assert.rejects(
            prisma.shopChangeRequestItem.create({
              data: {
                requestId: "missing-request",
                fieldName: "address",
                newValue: "orphan",
              },
            }),
            { code: "P2003" },
          );
          const key = {
            requestId_fieldName: {
              requestId: parent.id,
              fieldName: "shop_name",
            },
          };
          await prisma.shopChangeRequestItem.update({
            where: key,
            data: { newValue: "Newer" },
          });
          assert.equal(
            (
              await prisma.shopChangeRequestItem.findUnique({
                where: { id: item.id },
              })
            ).newValue,
            "Newer",
          );
          await assert.rejects(
            prisma.$transaction(async (tx) => {
              await tx.sellerProfile.update({
                where: { userId: "crud-seller" },
                data: { shopName: "Must rollback" },
              });
              await tx.shopChangeRequestItem.create({
                data: {
                  requestId: parent.id,
                  fieldName: "shop_name",
                  newValue: "duplicate",
                },
              });
            }),
            { code: "P2002" },
          );
          assert.equal(
            (
              await prisma.sellerProfile.findUnique({
                where: { userId: "crud-seller" },
              })
            ).shopName,
            "Old Shop",
          );
          await prisma.shopChangeRequest.delete({ where: { id: parent.id } });
          assert.equal(
            await prisma.shopChangeRequestItem.count({
              where: { requestId: parent.id },
            }),
            0,
          );
          await prisma.autoMessage.delete({ where: { id: message.id } });
          await prisma.sellerProfile.delete({
            where: { userId: "crud-seller" },
          });
          assert.equal(
            await prisma.autoMessage.count({
              where: { userId: "crud-seller" },
            }),
            0,
          );
        },
      );
      await t.test(
        "populated seven-to-eight upgrade preserves every existing row and rolls DDL back on failure",
        async () => {
          await reset();
          deployThrough(7);
          await consumer("baseline"); // same real HTTP contract before key replacement
          await user("historical-seller");
          const parent = await prisma.shopChangeRequest.create({
            data: {
              id: "historical-request",
              sellerId: "historical-seller",
              comment: "historical",
              status: "APPROVED",
              items: {
                create: {
                  id: "historical-id",
                  fieldName: "shop_name",
                  oldValue: null,
                  newValue: "Historical Shop",
                },
              },
            },
          });
          const before = await snapshot();
          // Inject failure after the PK switch; psql closes the aborted explicit
          // transaction. This proves the migration itself is atomic, not just CRUD.
          sql("CREATE TABLE auto_messages (sentinel TEXT);");
          const error = sql(
            fs.readFileSync(
              path.join(migrationRoot, keysMigration, "migration.sql"),
              "utf8",
            ),
            true,
          );
          assert.match(error, /already exists/);
          const [pk] = await prisma.$queryRawUnsafe(
            `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='shop_change_request_items_pkey'`,
          );
          assert.equal(pk.definition, "PRIMARY KEY (id)");
          assert.equal(
            sql(
              "SELECT to_regclass('public.shop_change_request_items_id_key') IS NULL;\n",
            ).trim(),
            "t",
          );
          sql("DROP TABLE auto_messages;");
          assert.deepEqual(await snapshot(), before);
          prismaCli([
            "migrate",
            "deploy",
            "--schema",
            path.join(serviceRoot, "prisma/schema.prisma"),
          ]);
          assert.deepEqual(await snapshot(), before);
          await inventory();
          assert.equal(
            (
              await prisma.shopChangeRequestItem.findUnique({
                where: { id: "historical-id" },
              })
            ).requestId,
            parent.id,
          );
          await consumer("upgrade");
          assert.match(
            prismaCli([
              "migrate",
              "deploy",
              "--schema",
              path.join(serviceRoot, "prisma/schema.prisma"),
            ]),
            /No pending migrations/,
          );
          await prisma.$disconnect();
          assert.equal(
            (
              await prisma.shopChangeRequestItem.findUnique({
                where: { id: "historical-id" },
              })
            ).newValue,
            "Historical Shop",
          );
        },
      );
      await t.test(
        "legacy no-history helper retains direct shop fields, KYC keys and archived metadata",
        async () => {
          await reset();
          // Remove only the temporary migration copies; historical repo migrations
          // and migrate.js baseline behavior are never edited by the rehearsal.
          for (const migration of migrations.slice(5, 7))
            fs.rmSync(path.join(tmp, "migrations", migration), {
              recursive: true,
            });
          deployThrough(5);
          sql(`
        ALTER TABLE seller_profiles ADD COLUMN address TEXT;
        CREATE TABLE shop_change_requests (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL,
          comment TEXT NOT NULL, shop_name TEXT, address TEXT, bank_account TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING', admin_note TEXT, reviewed_by TEXT,
          reviewed_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        ALTER TABLE reports ADD COLUMN version INTEGER NOT NULL DEFAULT 7;
        ALTER TABLE bulk_action_runs ADD COLUMN payload_hash TEXT, ADD COLUMN status TEXT,
          ADD COLUMN error TEXT, ADD COLUMN updated_at TIMESTAMP(3);
        CREATE TABLE admin_operations (id TEXT PRIMARY KEY, detail TEXT);
        INSERT INTO users(id,email,password_hash,f_name,l_name,role,updated_at)
          VALUES ('legacy-seller','legacy@example.test','unchanged-hash','Legacy','Seller','SELLER',CURRENT_TIMESTAMP);
        INSERT INTO seller_profiles(user_id,shop_name,address,bank_account,kyc_document_url)
          VALUES ('legacy-seller','Original Shop','Original Address','111','private/legacy-key');
        INSERT INTO user_roles(id,user_id,role) VALUES ('legacy-grant','legacy-seller','SELLER');
        INSERT INTO kyc_applications(id,user_id,document_url) VALUES ('legacy-kyc','legacy-seller','private/application-key');
        INSERT INTO reports(id,reporter_id,reason) VALUES ('legacy-report','legacy-seller','Preserve version');
        INSERT INTO bulk_action_runs(id,idempotency_key,actor_id,action,reason,requested_ids,results,payload_hash,status,error)
          VALUES ('legacy-bulk','legacy-key','legacy-seller','SUSPEND','archive',ARRAY['legacy-seller'],'{"state":"DONE"}','hash','DONE','historical error');
        INSERT INTO admin_operations(id,detail) VALUES ('legacy-operation','Do not lose');
        INSERT INTO shop_change_requests(id,seller_id,comment,shop_name,address,bank_account,created_at)
          VALUES ('legacy-pending','legacy-seller','Move direct fields','Proposed Shop','Proposed Address','222','2020-01-01');
        INSERT INTO shop_change_requests(id,seller_id,comment,shop_name,status,created_at)
          VALUES ('legacy-decided','legacy-seller','Unknown old value','Historical Shop','APPROVED','2019-01-01');
        DROP TABLE _prisma_migrations;
      `);
          run(process.execPath, [path.join(serviceRoot, "prisma/migrate.js")]);
          const legacy = await prisma.shopChangeRequest.findUnique({
            where: { id: "legacy-pending" },
            include: { items: true },
          });
          assert.equal(
            legacy.createdAt.toISOString(),
            "2020-01-01T00:00:00.000Z",
          );
          assert.deepEqual(
            legacy.items
              .map((i) => [i.id, i.fieldName, i.oldValue, i.newValue])
              .sort(),
            [
              [
                "legacy-pending:address",
                "address",
                "Original Address",
                "Proposed Address",
              ],
              ["legacy-pending:bank_account", "bank_account", "111", "222"],
              [
                "legacy-pending:shop_name",
                "shop_name",
                "Original Shop",
                "Proposed Shop",
              ],
            ],
          );
          assert.equal(
            (
              await prisma.shopChangeRequestItem.findUnique({
                where: { id: "legacy-decided:shop_name" },
              })
            ).oldValue,
            null,
          );
          assert.equal(
            (
              await prisma.sellerProfile.findUnique({
                where: { userId: "legacy-seller" },
              })
            ).kycStorageKey,
            "private/legacy-key",
          );
          assert.equal(
            (
              await prisma.kycApplication.findUnique({
                where: { id: "legacy-kyc" },
              })
            ).storageKey,
            "private/application-key",
          );
          assert.equal(
            (
              await prisma.userRole.findUnique({
                where: { id: "legacy-grant" },
              })
            ).role,
            "SELLER",
          );
          assert.equal(
            sql(
              "SELECT password_hash FROM users WHERE id='legacy-seller';",
            ).trim(),
            "unchanged-hash",
          );
          assert.equal(
            sql(
              "SELECT detail FROM legacy_archive.legacy_admin_operations_20261010 WHERE id='legacy-operation';",
            ).trim(),
            "Do not lose",
          );
          assert.equal(
            sql(
              "SELECT version FROM legacy_archive.legacy_report_versions_20261010 WHERE id='legacy-report';",
            ).trim(),
            "7",
          );
          assert.equal(
            sql(
              "SELECT payload_hash || ':' || status || ':' || error FROM legacy_archive.legacy_bulk_action_runs_20261010 WHERE id='legacy-bulk';",
            ).trim(),
            "hash:DONE:historical error",
          );
          const {
            createShopChangeRequestService,
          } = require("../src/services/shopChangeRequestService");
          const consumerService = createShopChangeRequestService(prisma);
          const approved = await consumerService.decide(
            "legacy-admin",
            legacy.id,
            { decision: "APPROVED" },
          );
          assert.equal(approved.shopName, "Proposed Shop");
          assert.deepEqual(
            approved.items.map((i) => i.id).sort(),
            legacy.items.map((i) => i.id).sort(),
          );
          assert.equal(
            (
              await prisma.sellerProfile.findUnique({
                where: { userId: "legacy-seller" },
              })
            ).bankAccount,
            "222",
          );
          assert.match(
            run(process.execPath, [
              path.join(serviceRoot, "prisma/migrate.js"),
            ]),
            /No pending migrations/,
          );
        },
      );
      // Identity of the three archives wherever they live: relation OID, constraints,
      // indexes (schema-neutral) and owned sequences.
      const archiveState = () =>
        sql(`
          SELECT t.relname||'|'||t.oid::int8 FROM pg_class t WHERE t.relname LIKE 'legacy\\_%' AND t.relkind='r' ORDER BY 1;
          SELECT 'con|'||t.relname||'|'||c.conname||'|'||pg_get_constraintdef(c.oid)
            FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname LIKE 'legacy\\_%' ORDER BY 1;
          SELECT 'idx|'||indexname||'|'||regexp_replace(indexdef,' ON [a-z_]+\\.',' ON ') FROM pg_indexes WHERE tablename LIKE 'legacy\\_%' ORDER BY 1;
          SELECT 'seq|'||s.relname||'|'||d.refobjid::regclass::text FROM pg_class s
            JOIN pg_depend d ON d.objid=s.oid AND d.deptype='a' WHERE s.relkind='S' AND s.relname LIKE 'legacy\\_%' ORDER BY 1;
        `);
      const archiveRows = (schema) =>
        sql(
          archivedTables
            .map(
              (n) =>
                `SELECT row_to_json(t)::text FROM ${schema}.${n} t ORDER BY 1;`,
            )
            .join("\n"),
        );
      const publicLegacyCount = () =>
        sql(
          "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'legacy\\_%';",
        ).trim();
      const migrationSql = () =>
        fs.readFileSync(
          path.join(migrationRoot, latest, "migration.sql"),
          "utf8",
        );
      await t.test(
        "archive migration moves populated legacy tables with identity, constraints, indexes, sequences and rows preserved",
        async () => {
          await reset();
          deployThrough(8);
          sql(`
            INSERT INTO users(id,email,password_hash,f_name,l_name,role,updated_at)
              VALUES ('arch','arch@example.test','h','A','B','SELLER',CURRENT_TIMESTAMP);
            INSERT INTO bulk_action_runs(id,idempotency_key,actor_id,action,reason,requested_ids,results)
              VALUES ('b1','k1','arch','SUSPEND','why',ARRAY['arch'],'{}');
            CREATE TABLE legacy_admin_operations_20261010 (id SERIAL PRIMARY KEY, detail TEXT NOT NULL);
            CREATE INDEX legacy_admin_operations_detail_idx ON legacy_admin_operations_20261010(detail);
            ALTER TABLE legacy_admin_operations_20261010
              ADD CONSTRAINT legacy_admin_operations_detail_ck CHECK (detail <> '');
            INSERT INTO legacy_admin_operations_20261010(detail) VALUES ('op one'),('op two');
            CREATE TABLE legacy_report_versions_20261010 (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
            INSERT INTO legacy_report_versions_20261010 VALUES ('r1',3),('r2',9);
            INSERT INTO legacy_bulk_action_runs_20261010 SELECT * FROM bulk_action_runs;
          `);
          assert.equal(publicLegacyCount(), "3");
          const rowsBefore = archiveRows("public");
          const stateBefore = archiveState();
          // Conflict on the last table (processed after the first two moved): the
          // whole transaction, including the earlier moves, must roll back.
          sql(
            "CREATE SCHEMA legacy_archive; CREATE TABLE legacy_archive.legacy_report_versions_20261010 (x INT);",
          );
          assert.match(
            sql(migrationSql(), true),
            /legacy_archive\.legacy_report_versions_20261010 already exists/,
          );
          assert.equal(publicLegacyCount(), "3");
          assert.equal(archiveRows("public"), rowsBefore);
          sql("DROP TABLE legacy_archive.legacy_report_versions_20261010;");
          assert.equal(archiveState(), stateBefore);
          prismaCli([
            "migrate",
            "deploy",
            "--schema",
            path.join(serviceRoot, "prisma/schema.prisma"),
          ]);
          assert.equal(publicLegacyCount(), "0");
          assert.equal(
            sql(
              "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='legacy_archive';",
            ).trim(),
            archivedTables.join(","),
          );
          assert.equal(archiveRows("legacy_archive"), rowsBefore);
          assert.equal(
            archiveState().replace("|legacy_archive.", "|"),
            stateBefore,
          );
          // The owned sequence moved with its table and continues after the old rows.
          assert.equal(
            sql(
              "SELECT pg_get_serial_sequence('legacy_archive.legacy_admin_operations_20261010','id');",
            ).trim(),
            "legacy_archive.legacy_admin_operations_20261010_id_seq",
          );
          assert.equal(
            sql(
              "INSERT INTO legacy_archive.legacy_admin_operations_20261010(detail) VALUES ('op three') RETURNING id;",
            ).split("\n")[0],
            "3",
          );
          await inventory();
          assert.match(
            prismaCli([
              "migrate",
              "deploy",
              "--schema",
              path.join(serviceRoot, "prisma/schema.prisma"),
            ]),
            /No pending migrations/,
          );
          await consumer("archived");
        },
      );
      await t.test(
        "archive migration is idempotent and refuses to overwrite an existing archive",
        async () => {
          await reset();
          deployThrough(8);
          sql(migrationSql());
          const archived = archiveState();
          sql(migrationSql());
          assert.equal(archiveState(), archived);
          sql("CREATE TABLE legacy_bulk_action_runs_20261010 (x INT);");
          assert.match(sql(migrationSql(), true), /already exists/);
          assert.equal(publicLegacyCount(), "1");
          assert.equal(
            sql(
              "SELECT count(*) FROM information_schema.columns WHERE table_schema='legacy_archive' AND table_name='legacy_bulk_action_runs_20261010' AND column_name='x';",
            ).trim(),
            "0",
          );
        },
      );
    } finally {
      await prisma.$disconnect();
      await sharedPrisma.$disconnect();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
);
