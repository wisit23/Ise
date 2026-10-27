// Rehearse migrations and persistence on new, disposable local databases only.
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config();
const {
  PrismaClient,
} = require("../backend/services/product-service/src/generated/prisma-client");
const {
  PrismaClient: ChatClient,
} = require("../backend/services/chat-service/src/generated/prisma-client");
const root = path.resolve(__dirname, "..");
const token = `${Date.now()}_${process.pid}`;
const created = [];

function localUrl(value, database) {
  const url = new URL(value);
  // This rehearsal must never target a remote or shared database server.
  assert.ok(
    ["localhost", "127.0.0.1", "postgres", "mongo"].includes(url.hostname),
  );
  url.hostname = "127.0.0.1";
  url.pathname = `/${database}`;
  return url.toString();
}

function run(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Rehearsal command failed (${result.status})`);
}

async function main() {
  const admin = new PrismaClient({
    datasources: {
      db: { url: localUrl(process.env.DATABASE_URL_PRODUCT, "postgres") },
    },
  });
  try {
    for (const service of ["product", "auth"]) {
      const database = `seller_soft_delete_${service}_${token}`;
      assert.match(database, /^seller_soft_delete_(product|auth)_\d+_\d+$/);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
      created.push(database);
      const url = localUrl(
        process.env[`DATABASE_URL_${service.toUpperCase()}`],
        database,
      );
      const env = {
        DATABASE_URL: url,
        DATABASE_URL_PRODUCT: url,
        SELLER_SOFT_DELETE_TEST_DB: database,
      };
      run(
        [
          require.resolve("prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          `backend/services/${service}-service/prisma/schema.prisma`,
        ],
        env,
      );
      run(
        [
          "--test",
          "--test-concurrency=1",
          `backend/services/${service}-service/test/seller-soft-delete.integration.test.js`,
          ...(service === "product"
            ? [
                "backend/services/product-service/src/features/wishlist/wishlist.integration.test.js",
                "backend/services/product-service/src/features/recommendations/recommendation.integration.test.js",
              ]
            : []),
        ],
        env,
      );
    }
    const mongoName = `seller_soft_delete_chat_${token}`;
    const mongoUrl = localUrl(process.env.DATABASE_URL_CHAT, mongoName);
    const mongo = new ChatClient({ datasources: { db: { url: mongoUrl } } });
    try {
      run(
        [
          "--test",
          "backend/services/chat-service/test/seller-soft-delete.integration.test.js",
        ],
        { DATABASE_URL: mongoUrl, SELLER_SOFT_DELETE_TEST_DB: mongoName },
      );
    } finally {
      await mongo.$runCommandRaw({ dropDatabase: 1 });
      await mongo.$disconnect();
    }
    console.log(
      "Seller soft-delete migration and persistence rehearsal passed.",
    );
  } finally {
    // Only names successfully CREATEd by this process can be dropped.
    for (const database of created)
      await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
