const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { urlFor, prepareChat } = require("./reference-codes.cjs");
const ROOT = path.resolve(__dirname, "..");

function run(args, env, outputFile) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  const output = (result.stdout || "") + (result.stderr || "");
  if (outputFile) fs.writeFileSync(outputFile, output);
  if (result.error) throw result.error;
  if (!outputFile && result.status !== 0)
    throw new Error(
      "Isolated test setup failed; no application databases were reset",
    );
  return { status: result.status, output };
}

async function main() {
  const env = {
    ...process.env,
    MAIL_TRANSPORT: "disabled",
    REQUIRE_INTEGRATION: "1",
    REQUIRE_REFERENCE_INTEGRATION: "1",
    CHAT_RATE_WINDOW_SEND_MESSAGE: "3600",
  };
  for (const service of ["auth", "product", "order", "support", "chat"]) {
    const url = new URL(urlFor(service));
    url.pathname =
      service === "chat"
        ? `/reloop_ci_reference_chat_${Date.now()}`
        : `/reloop_ci_reference_${service}`;
    env[`DATABASE_URL_${service.toUpperCase()}`] = url.toString();
    env[`${service.toUpperCase()}_SERVICE_URL`] = "http://127.0.0.1:9";
  }
  env.DATABASE_URL = env.DATABASE_URL_AUTH;
  env.DATABASE_URL_DASHBOARD = env.DATABASE_URL_SUPPORT;
  const redis = new URL(env.REDIS_URL || "redis://127.0.0.1:6379");
  if (redis.hostname === "redis") redis.hostname = "127.0.0.1";
  redis.pathname = "/15";
  env.REDIS_URL = redis.toString();
  const outputDir = path.join(ROOT, "coverage/reference-codes");
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(
    "Preparing isolated reloop_ci_reference_* databases; Redis test DB 15",
  );
  const setup = run(
    ["scripts/ci/prepare-databases.cjs"],
    env,
    path.join(outputDir, "setup.txt"),
  );
  if (setup.status !== 0)
    throw new Error(
      "Test database preparation failed; see coverage/reference-codes/setup.txt",
    );
  const seed = run(
    ["backend/services/support-service/prisma/seed.js"],
    { ...env, DATABASE_URL: env.DATABASE_URL_SUPPORT },
    path.join(outputDir, "support-seed.txt"),
  );
  if (seed.status !== 0) throw new Error("Test support lookup setup failed");
  const mongoSetup = run(
    [
      require.resolve("prisma/build/index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      "backend/services/chat-service/prisma/schema.prisma",
    ],
    { ...env, DATABASE_URL: env.DATABASE_URL_CHAT },
    path.join(outputDir, "mongo-setup.txt"),
  );
  if (mongoSetup.status !== 0)
    throw new Error("Fresh test Mongo index setup failed");
  const {
    PrismaClient,
  } = require("../backend/services/chat-service/src/generated/prisma-client");
  const mongo = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL_CHAT } },
  });
  try {
    await prepareChat(mongo);
  } finally {
    await mongo.$disconnect();
  }
  const groups = [
    "auth-service",
    "product-service",
    "order-service",
    "support-service",
    "chat-service",
    "shared",
    "gateway",
    "scripts",
  ];
  const selected =
    process.argv
      .find((arg) => arg.startsWith("--groups="))
      ?.slice(9)
      .split(",") || groups;
  if (selected.some((group) => !groups.includes(group)))
    throw new Error("Unknown test group");
  let failures = 0;
  for (const group of selected) {
    const result = run(
      [
        "scripts/ci/service-tests.cjs",
        group,
        ...(process.argv.includes("--unit") ? ["--unit"] : []),
      ],
      env,
      path.join(outputDir, `${group}.txt`),
    );
    const summary = result.output
      .split(/\r?\n/)
      .filter((line) => /^\u2139 (tests|pass|fail|skipped)/.test(line));
    console.log(
      group,
      result.status === 0 ? "PASS" : "FAIL",
      summary.join("; "),
    );
    if (result.status !== 0) failures += 1;
  }
  process.exitCode = failures ? 1 : 0;
}
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
