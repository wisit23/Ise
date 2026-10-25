const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { urlFor } = require("./reference-codes.cjs");

// Applies forward migrations; never baselines, resets, or rewrites history.
function main() {
  const selected =
    process.argv.find((arg) => arg.startsWith("--service="))?.slice(10) ||
    "all";
  const services =
    selected === "all" ? ["auth", "product", "order", "support"] : [selected];
  if (
    services.some(
      (service) => !["auth", "product", "order", "support"].includes(service),
    )
  )
    throw new Error("Unknown PostgreSQL service");
  if (!process.argv.includes("--apply"))
    throw new Error("Use --apply to deploy forward migrations explicitly");
  for (const service of services) {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        `backend/services/${service}-service/prisma/schema.prisma`,
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, DATABASE_URL: urlFor(service) },
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `${service} forward migration failed; no reset attempted`,
      );
  }
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
