const categories = [
  ["ORDER", "คำสั่งซื้อ"],
  ["PAYMENT", "การชำระเงิน"],
  ["ACCOUNT", "บัญชีผู้ใช้"],
  ["TECHNICAL", "ปัญหาทางเทคนิค"],
  ["OTHER", "อื่น ๆ"],
];
const priorities = [
  ["LOW", 1, 4320],
  ["NORMAL", 2, 1440],
  ["HIGH", 3, 240],
  ["URGENT", 4, 60],
];
const statuses = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING_USER",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
];
async function seedReferenceData(db) {
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
    // Compatibility defaults: resolution uses the old deadline too. New policy versions
    // can set separate targets after the business owner agrees their durations.
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
