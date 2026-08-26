const reportService = require("./src/features/reports/reportService");
const prisma = require("./src/models/prismaClient");

async function test() {
  const adminId = "40000000-0000-0000-0000-000000000002"; // Admin seeded
  const reports = await prisma.report.findMany({ where: { status: "REVIEWED" }});
  if (reports.length === 0) {
    console.log("No reports ready for action.");
    return;
  }
  const report = reports[0];
  console.log("Acting on report:", report.id);
  
  try {
    const res = await reportService.actionReport({
      reportId: report.id,
      adminId,
      decision: "SUSPEND_USER",
      reason: "test suspension reason",
      requestId: "req-1",
    });
    console.log("Success:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}

test().finally(() => prisma.$disconnect());
