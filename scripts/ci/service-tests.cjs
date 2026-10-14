const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
const GROUPS = Object.fromEntries([
  ...["auth", "product", "order", "chat", "support"].map((name) => [
    `${name}-service`,
    `backend/services/${name}-service`,
  ]),
  ["shared", "backend/shared"],
  ["gateway", "backend/gateway"],
  ["scripts", "scripts"],
]);

function discoverTests(group, { unit = false, root = ROOT } = {}) {
  if (!Object.hasOwn(GROUPS, group))
    throw new Error(`Unknown test group: ${group}`);
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        ["node_modules", "generated", "coverage", ".next", ".git"].includes(
          entry.name,
        )
      )
        continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (
        entry.name.endsWith(".test.js") &&
        (!unit || !/\.(integration|live)\.test\.js$/.test(entry.name))
      )
        files.push(target);
    }
  }
  walk(path.join(root, GROUPS[group]));
  if (!files.length) throw new Error(`No tests found for ${group}`);
  return files.sort();
}

function main(args = process.argv.slice(2)) {
  const group = args.find((arg) => !arg.startsWith("--"));
  const files = discoverTests(group, { unit: args.includes("--unit") });
  const serviceKey = group.replace("-service", "").toUpperCase();
  const env = { ...process.env };
  if (
    Object.hasOwn(GROUPS, group) &&
    group.endsWith("-service") &&
    env[`DATABASE_URL_${serviceKey}`]
  )
    env.DATABASE_URL = env[`DATABASE_URL_${serviceKey}`];
  if (group === "support-service" && env.DATABASE_URL_SUPPORT)
    env.DATABASE_URL_DASHBOARD ||= env.DATABASE_URL_SUPPORT;
  if (args.includes("--list")) {
    console.log(
      JSON.stringify(
        files.map((file) => path.relative(ROOT, file).replaceAll("\\", "/")),
        null,
        2,
      ),
    );
    return;
  }
  const generate = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/ensurePrismaClients.js")],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (generate.status !== 0) {
    process.exitCode = generate.status || 1;
    return;
  }
  const output = path.join(ROOT, "coverage", group);
  fs.mkdirSync(output, { recursive: true });
  console.log(
    `[tests] ${group}: ${files.length} files (${args.includes("--unit") ? "unit" : "unit + integration"})`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "--experimental-test-coverage",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=junit",
      `--test-reporter-destination=${path.join(output, "junit.xml")}`,
      "--test-reporter=lcov",
      `--test-reporter-destination=${path.join(output, "lcov.info")}`,
      ...files,
    ],
    { cwd: ROOT, stdio: "inherit", env },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { GROUPS, discoverTests };
