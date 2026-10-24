const path = require("node:path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});
const {
  REFERENCE_MODELS,
  createWithReferenceCode,
} = require("../backend/shared/src/referenceCodes");

function urlFor(service) {
  const raw = process.env[`DATABASE_URL_${service.toUpperCase()}`];
  if (!raw)
    throw new Error(`DATABASE_URL_${service.toUpperCase()} is required`);
  const url = new URL(raw);
  // Container DNS names are not reachable when this CLI runs on the host.
  if (url.hostname === "postgres" || url.hostname === "mongo") {
    url.hostname = "127.0.0.1";
    if (service === "chat") url.searchParams.set("directConnection", "true");
  }
  return url.toString();
}

function clientFor(service) {
  const { PrismaClient } =
    service === "auth"
      ? require("@prisma/client")
      : require(
          `../backend/services/${service}-service/src/generated/prisma-client`,
        );
  return new PrismaClient({ datasources: { db: { url: urlFor(service) } } });
}

async function prepareChat(db) {
  // A sparse index alone still indexes explicit nulls. A partial string index
  // allows both missing and null legacy fields while preventing duplicate codes.
  await db.$runCommandRaw({
    createIndexes: "Conversation",
    indexes: [
      {
        key: { reference_code: 1 },
        name: "Conversation_reference_code_key",
        unique: true,
        partialFilterExpression: { reference_code: { $type: "string" } },
      },
    ],
  });
}

async function backfill(db, service, { batchSize = 200 } = {}) {
  const results = [];
  for (const model of Object.keys(REFERENCE_MODELS[service])) {
    const delegate = db[model[0].toLowerCase() + model.slice(1)];
    let changed = 0;
    if (service === "chat") {
      while (true) {
        const rows = await delegate.findMany({
          where: {
            OR: [{ referenceCode: null }, { referenceCode: { isSet: false } }],
          },
          select: { id: true },
          take: batchSize,
        });
        if (!rows.length) break;
        for (const row of rows) {
          const result = await createWithReferenceCode("CHT", (referenceCode) =>
            delegate.updateMany({
              where: {
                id: row.id,
                OR: [
                  { referenceCode: null },
                  { referenceCode: { isSet: false } },
                ],
              },
              data: { referenceCode },
            }),
          );
          changed += result.count;
        }
      }
    } else {
      const metadata = db._runtimeDataModel.models[model];
      const table = metadata.dbName || model;
      const pk = metadata.fields.find((field) => field.isId);
      const column = pk.dbName || pk.name;
      // Identifiers come exclusively from generated schema metadata, never input.
      const quote = (name) => `"${name.replace(/"/g, '""')}"`;
      while (true) {
        const count = await db.$executeRawUnsafe(
          `UPDATE ${quote(table)} SET reference_code = NULL WHERE ${quote(column)} IN (SELECT ${quote(column)} FROM ${quote(table)} WHERE reference_code IS NULL ORDER BY ${quote(column)} LIMIT $1)`,
          batchSize,
        );
        changed += count;
        if (!count) break;
      }
    }
    results.push({
      model,
      changed,
      missing: await delegate.count({
        where:
          service === "chat"
            ? {
                OR: [
                  { referenceCode: null },
                  { referenceCode: { isSet: false } },
                ],
              }
            : { referenceCode: null },
      }),
    });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const serviceArg =
    args.find((arg) => arg.startsWith("--service="))?.slice(10) || "all";
  const services =
    serviceArg === "all" ? Object.keys(REFERENCE_MODELS) : [serviceArg];
  if (services.some((service) => !REFERENCE_MODELS[service]))
    throw new Error("Unknown service");
  const apply = args.includes("--apply");
  for (const service of services) {
    const db = clientFor(service);
    try {
      if (apply) {
        if (service === "chat") await prepareChat(db);
        console.log(
          JSON.stringify({ service, results: await backfill(db, service) }),
        );
      } else {
        for (const model of Object.keys(REFERENCE_MODELS[service])) {
          const delegate = db[model[0].toLowerCase() + model.slice(1)];
          const missing = await delegate.count({
            where:
              service === "chat"
                ? {
                    OR: [
                      { referenceCode: null },
                      { referenceCode: { isSet: false } },
                    ],
                  }
                : { referenceCode: null },
          });
          console.log(JSON.stringify({ service, model, missing }));
        }
      }
    } finally {
      await db.$disconnect();
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(
      error.code || error.name,
      "Reference-code operation failed; verify migrations and database access.",
    );
    process.exitCode = 1;
  });
module.exports = { urlFor, clientFor, prepareChat, backfill };
