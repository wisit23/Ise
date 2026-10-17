const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
const PG_SERVICES = ["auth", "product", "order", "support"];

function validateTarget(raw, service) {
  const url = new URL(raw);
  const name = url.pathname.slice(1);
  if (
    !/^reloop_ci_[a-z0-9_]+$/.test(name) ||
    name.length > 63 ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.protocol !== "postgresql:" ||
    (url.searchParams.get("schema") || "public") !== "public"
  ) {
    throw new Error(
      `Refusing ${service} setup: use a localhost reloop_ci_* database in public schema`,
    );
  }
  return { url, name };
}

async function main() {
  // Validate every target before connecting or applying any migrations.
  const targets = PG_SERVICES.map((service) => ({
    service,
    ...validateTarget(
      process.env[`DATABASE_URL_${service.toUpperCase()}`],
      service,
    ),
  }));
  const { PrismaClient } = require("@prisma/client");
  const adminUrl = new URL(targets[0].url);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  });
  try {
    for (const { name } of targets) {
      const existing =
        await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${name}`;
      if (!existing.length)
        await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
  const cli = require.resolve("prisma/build/index.js");
  for (const { service, url } of targets) {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "migrate",
        "deploy",
        "--schema",
        `backend/services/${service}-service/prisma/schema.prisma`,
      ],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: url.toString() },
      },
    );
    if (result.status !== 0)
      throw new Error(`${service} test migrations failed`);
  }
  // The catalog's canonical condition/category lookups are required by tests.
  // Other service suites create their own fixtures; legacy demo seeds are not
  // suitable for the current log-backed ER projection.
  const seed = spawnSync(
    process.execPath,
    ["backend/services/product-service/prisma/seed.js"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: targets
          .find((target) => target.service === "product")
          .url.toString(),
      },
    },
  );
  if (seed.status !== 0) throw new Error("Product test seed failed");
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { validateTarget };
