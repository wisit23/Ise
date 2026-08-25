const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const PRISMA_CLI = require.resolve("prisma/build/index.js");

const CLIENTS = [
  {
    name: "auth-service",
    schema: "backend/services/auth-service/prisma/schema.prisma",
    output: "node_modules/.prisma/client/index.js",
  },
  {
    name: "product-service",
    schema: "backend/services/product-service/prisma/schema.prisma",
    output:
      "backend/services/product-service/src/generated/prisma-client/index.js",
  },
  {
    name: "order-service",
    schema: "backend/services/order-service/prisma/schema.prisma",
    output:
      "backend/services/order-service/src/generated/prisma-client/index.js",
  },
  {
    name: "review-service",
    schema: "backend/services/review-service/prisma/schema.prisma",
    output:
      "backend/services/review-service/src/generated/prisma-client/index.js",
  },
  {
    name: "support-service",
    schema: "backend/services/support-service/prisma/schema.prisma",
    output:
      "backend/services/support-service/src/generated/prisma-client/index.js",
  },
];

function absolute(relativePath) {
  return path.join(REPOSITORY_ROOT, relativePath);
}

function clientNeedsGeneration(client, force) {
  if (force || !fs.existsSync(absolute(client.output))) return true;

  const schemaTime = fs.statSync(absolute(client.schema)).mtimeMs;
  const clientTime = fs.statSync(absolute(client.output)).mtimeMs;
  return schemaTime > clientTime;
}

function generateClient(client) {
  console.log(`[prisma] generating ${client.name}`);
  const result = spawnSync(
    process.execPath,
    [PRISMA_CLI, "generate", "--schema", client.schema],
    { cwd: REPOSITORY_ROOT, stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const force = process.argv.includes("--force");
  const staleClients = CLIENTS.filter((client) =>
    clientNeedsGeneration(client, force),
  );

  if (staleClients.length === 0) {
    console.log("[prisma] generated clients are current");
    return;
  }

  staleClients.forEach(generateClient);
}

if (require.main === module) main();

module.exports = {
  clientNeedsGeneration,
};
