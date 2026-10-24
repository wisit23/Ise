// Additive local fixtures. Every run creates fresh reviews and OPEN reports.
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const env = require("dotenv").parse(fs.readFileSync(".env"));
function localUrl(key) {
  const url = new URL(env[key]);
  if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || process.env.NODE_ENV === "production") {
    throw new Error("Review report seed is for local databases only");
  }
  url.hostname = "127.0.0.1";
  return url.toString();
}
const AuthClient = require("@prisma/client").PrismaClient;
const ProductClient = require("../backend/services/product-service/src/generated/prisma-client").PrismaClient;
const auth = new AuthClient({ datasources: { db: { url: localUrl("DATABASE_URL_AUTH") } } });
const product = new ProductClient({ datasources: { db: { url: localUrl("DATABASE_URL_PRODUCT") } } });
async function main() {
  const listing = await product.product.findFirst({ where: { status: { not: "removed" } }, orderBy: { createdAt: "desc" } });
  if (!listing) throw new Error("Seed a product first");
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const reporter = await auth.user.create({ data: {
    email: `demo-review-reporter-${randomUUID()}@example.test`, passwordHash,
    firstName: "DEMO ผู้รายงานรีวิว", lastName: "ทดสอบ", role: "BUYER",
    roles: { create: { role: "BUYER" } },
  } });
  const cases = [];
  // Resume fixtures left between the owner-service and report inserts.
  for (const review of await product.review.findMany({ where: { comment: { startsWith: "[DEMO รีวิวทดสอบ" } } })) {
    if (await auth.report.findFirst({ where: { reason: { contains: `[รายงานรีวิว #${review.id}]` } } })) continue;
    const report = await auth.report.create({ data: {
      reporterId: reporter.id, targetId: review.buyerId, productId: review.productId, category: "OTHER",
      reason: `[รายงานรีวิว #${review.id}] [DEMO ทดสอบลบรีวิว] (เนื้อหารีวิว: "${review.comment}")`,
    } });
    cases.push({ scenario: "เคสตัวอย่างที่สร้างต่อจากรอบก่อน", reviewId: review.id, reportId: report.id, url: `/workspace?section=reports&reportId=${report.id}` });
  }
  for (const [index, scenario] of ["สแปมโฆษณา", "ข้อความไม่เหมาะสม", "รีวิวปกติสำหรับลองยกเลิกรายงาน"].entries()) {
    const buyer = await auth.user.create({ data: {
      email: `demo-review-author-${randomUUID()}@example.test`, passwordHash,
      firstName: `DEMO ผู้เขียนรีวิว ${index + 1}`, lastName: "ทดสอบ", role: "BUYER",
      roles: { create: { role: "BUYER" } },
    } });
    const review = await product.review.create({ data: {
      orderId: `demo-review-report-${randomUUID()}`, buyerId: buyer.id,
      sellerId: listing.sellerId, productId: listing.id, rating: index === 2 ? 5 : 1,
      comment: `[DEMO รีวิวทดสอบ ${index + 1}] ${scenario} — ข้อมูลสมมติสำหรับทดสอบการจัดการรายงาน`,
    } });
    const report = await auth.report.create({ data: {
      reporterId: reporter.id, targetId: buyer.id, productId: listing.id, category: "OTHER",
      reason: `[รายงานรีวิว #${review.id}] [DEMO ทดสอบลบรีวิว] ${scenario} (เนื้อหารีวิว: "${review.comment}")`,
    } });
    cases.push({ scenario, reviewId: review.id, reportId: report.id, url: `/workspace?section=reports&reportId=${report.id}` });
  }
  const result = { storeUrl: `/store/${listing.sellerId}`, cases };
  fs.mkdirSync("tmp", { recursive: true });
  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync("tmp/review-report-seed.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => Promise.all([auth.$disconnect(), product.$disconnect()]));
