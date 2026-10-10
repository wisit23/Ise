const {
  SERVICE_POLICIES,
  POLICY_VERSION,
  serializableTransaction,
} = require("@reloop/shared");
const {
  categories,
  legacyPriorities: priorities,
} = require("./reference-data.json");
const { STATUSES: statuses } = require("../src/features/tickets/ticketState");
async function seedReferenceData(db) {
  return serializableTransaction(db, seedRecords);
}
async function seedRecords(db) {
  for (const [code, nameTh] of categories) {
    for (const delegate of [db.ticketCategory, db.helpCategory])
      await delegate.upsert({
        where: { code },
        update: {},
        create: { code, nameTh, nameEn: code },
      });
  }
  for (const [code, rank, minutes] of priorities) {
    const priority = await db.ticketPriority.upsert({
      where: { code },
      update: {},
      create: { code, name: code, rank },
    });
    // Retain v1 for existing snapshots and historical imports.
    await db.slaPolicy.upsert({
      where: { id: "sla-default-" + code + "-v1" },
      update: {},
      create: {
        id: "sla-default-" + code + "-v1",
        priorityId: priority.id,
        firstResponseMinutes: minutes,
        resolutionMinutes: minutes,
        effectiveFrom: new Date(0),
      },
    });
    const policy = SERVICE_POLICIES[code];
    if (priority.rank !== policy.rank)
      throw new Error(
        `Priority rank mismatch for ${code}; migrate ranks explicitly`,
      );
    const persisted = await db.slaPolicy.upsert({
      where: { id: `sla-default-${code}-${POLICY_VERSION}` },
      update: {},
      create: {
        id: `sla-default-${code}-${POLICY_VERSION}`,
        priorityId: priority.id,
        firstResponseMinutes: policy.firstResponseMinutes,
        resolutionMinutes: policy.resolutionMinutes,
        effectiveFrom: new Date(),
      },
    });
    if (
      persisted.firstResponseMinutes !== policy.firstResponseMinutes ||
      persisted.resolutionMinutes !== policy.resolutionMinutes
    )
      throw new Error(
        `SLA policy ${POLICY_VERSION} differs from stored ${code}; use a new policy version`,
      );
  }
  for (const [index, code] of statuses.entries())
    await db.ticketStatus.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: code,
        sortOrder: index,
        isTerminal: code === "CLOSED",
      },
    });
}
module.exports = { seedReferenceData };
