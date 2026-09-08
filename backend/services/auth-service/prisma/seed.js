// Idempotent demo sellers: fixed UUIDs so product-service's own seed can
// reference the same sellerId literally, without a cross-service lookup at
// seed time. Upsert-only (never overwrites a real password/name a user set
// through the app) — safe to run on every container start.
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

const SELLERS = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    email: "shop.denim@example.com",
    firstName: "มานพ",
    lastName: "เดนิม",
    shopName: "ร้านยีนส์เดนิมมือสอง",
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    email: "shop.sneaker@example.com",
    firstName: "ปิยะ",
    lastName: "รองเท้า",
    shopName: "Sneaker Society",
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    email: "shop.vintage@example.com",
    firstName: "แนน",
    lastName: "วินเทจ",
    shopName: "Retro & Vintage House",
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    email: "shop.bag@example.com",
    firstName: "ต้น",
    lastName: "แบรนด์เนม",
    shopName: "กระเป๋าและเครื่องประดับมือสองพรีเมียม",
  },
];

const EXECUTIVE = {
  id: "10000000-0000-0000-0000-000000000099",
  email: "ceo@example.com",
  firstName: "อัสนัย",
  lastName: "เมืองรอด",
};

// Staff accounts for roles nobody can self-register into (Marketing, Admin,
// etc.) — fixed UUIDs and upsert-only for the same reason as SELLERS above.
//
// Fixed-UUID blocks are partitioned per team so two seeds can never claim the
// same id (an upsert-by-id collision silently no-ops and the second account
// just never gets created):
//   1xxx…  sellers (…099 executive)   2xxx…  customer-service agents
//   3xxx…  demo buyer                 4xxx…  marketing / other staff
const STAFF = [
  {
    id: "40000000-0000-0000-0000-000000000001",
    email: "marketing@example.com",
    firstName: "พิมพ์ชนก",
    lastName: "ทองศรี",
    role: "MARKETING",
  },
  {
    id: "40000000-0000-0000-0000-000000000002",
    email: "admin@example.com",
    firstName: "แอดมิน",
    lastName: "ระบบ",
    role: "ADMIN",
  },
];

// Fixed-UUID demo buyer so order-service's own seed can reference a real
// registered buyer for demo orders/disputes without a cross-service lookup —
// same rationale as SELLERS above. Every prior demo account was SELLER or
// staff; disputes need a real buyer to open them as.
const BUYERS = [
  {
    id: "30000000-0000-0000-0000-000000000001",
    email: "buyer.demo@example.com",
    firstName: "สมชาย",
    lastName: "ใจดี",
  },
];

const SUPPORT_AGENTS = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    email: "cs.nan@example.com",
    firstName: "น่าน",
    lastName: "ซัพพอร์ต",
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    email: "cs.beam@example.com",
    firstName: "บีม",
    lastName: "ซัพพอร์ต",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const seller of SELLERS) {
    await prisma.user.upsert({
      where: { id: seller.id },
      update: {},
      create: {
        id: seller.id,
        email: seller.email,
        passwordHash,
        firstName: seller.firstName,
        lastName: seller.lastName,
        role: "SELLER",
        sellerProfile: { create: { shopName: seller.shopName } },
      },
    });
  }

  await prisma.user.upsert({
    where: { id: EXECUTIVE.id },
    update: {},
    create: {
      id: EXECUTIVE.id,
      email: EXECUTIVE.email,
      passwordHash,
      firstName: EXECUTIVE.firstName,
      lastName: EXECUTIVE.lastName,
      role: "EXECUTIVE",
    },
  });

  for (const staff of STAFF) {
    await prisma.user.upsert({
      where: { id: staff.id },
      update: {},
      create: {
        id: staff.id,
        email: staff.email,
        passwordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
      },
    });
  }

  for (const buyer of BUYERS) {
    await prisma.user.upsert({
      where: { id: buyer.id },
      update: {},
      create: {
        id: buyer.id,
        email: buyer.email,
        passwordHash,
        firstName: buyer.firstName,
        lastName: buyer.lastName,
        role: "BUYER",
      },
    });
  }

  for (const agent of SUPPORT_AGENTS) {
    await prisma.user.upsert({
      where: { id: agent.id },
      update: {},
      create: {
        id: agent.id,
        email: agent.email,
        passwordHash,
        firstName: agent.firstName,
        lastName: agent.lastName,
        role: "CUSTOMER_SERVICE",
      },
    });
  }

  const DEMO_REPORTS = [
    // Sneaker Society (SELLERS[1]) - 3 complaints (High Risk / Anomaly >= 3)
    {
      id: "50000000-0000-0000-0000-000000000001",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[1].id,
      reason: "พฤติกรรมฉ้อโกง: ผู้ขายหลอกให้โอนเงินมัดจำล่วงหน้านอกแพลตฟอร์มแล้วเงียบหาย บล็อกการติดต่อ",
      status: "OPEN",
      reportedAt: new Date(Date.now() - 2 * 3600 * 1000),
    },
    {
      id: "50000000-0000-0000-0000-000000000002",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[1].id,
      reason: "สินค้าผิดกฎหมายหรือละเมิดลิขสิทธิ์: สินค้าแบรนด์เนมปลอม ละเมิดลิขสิทธิ์อย่างชัดเจน ไม่ใช่ของแท้ตามที่โฆษณา",
      status: "OPEN",
      reportedAt: new Date(Date.now() - 5 * 3600 * 1000),
    },
    {
      id: "50000000-0000-0000-0000-000000000003",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[1].id,
      reason: "พฤติกรรมฉ้อโกง: ได้รับสลิปยืนยันแต่ไม่ยอมจัดส่งสินค้าตามกำหนด ผัดวันประกันพรุ่งมาหลายสัปดาห์",
      status: "REVIEWED",
      reportedAt: new Date(Date.now() - 24 * 3600 * 1000),
    },
    // Retro & Vintage House (SELLERS[2]) - 2 complaints
    {
      id: "50000000-0000-0000-0000-000000000004",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[2].id,
      reason: "สินค้าไม่ตรงปก: สภาพสินค้าชำรุดเสียหายหนัก มีรอยฉีกขาดที่ไม่ระบุในรูปถ่ายประกาศ",
      status: "OPEN",
      reportedAt: new Date(Date.now() - 12 * 3600 * 1000),
    },
    {
      id: "50000000-0000-0000-0000-000000000005",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[2].id,
      reason: "สินค้าไม่ตรงปก: ส่งสินค้าผิดขนาด ไซส์และสีไม่ตรงกับรายละเอียดที่ลงขายในระบบ",
      status: "ACTIONED",
      reportedAt: new Date(Date.now() - 48 * 3600 * 1000),
    },
    // กระเป๋าและเครื่องประดับมือสองพรีเมียม (SELLERS[3]) - 1 complaint
    {
      id: "50000000-0000-0000-0000-000000000006",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[3].id,
      reason: "สินค้าผิดกฎหมายหรือละเมิดลิขสิทธิ์: นำกระเป๋าละเมิดลิขสิทธิ์มาลงขาย มีการปลอมแปลงป้ายตราสินค้า",
      status: "OPEN",
      reportedAt: new Date(Date.now() - 8 * 3600 * 1000),
    },
    // ร้านยีนส์เดนิมมือสอง (SELLERS[0]) - 1 complaint
    {
      id: "50000000-0000-0000-0000-000000000007",
      reporterId: BUYERS[0].id,
      targetId: SELLERS[0].id,
      reason: "พฤติกรรมฉ้อโกง: แจ้งเลขพัสดุปลอม ไม่สามารถตรวจสอบสถานะในระบบขนส่งได้",
      status: "DISMISSED",
      reportedAt: new Date(Date.now() - 72 * 3600 * 1000),
    },
  ];

  for (const report of DEMO_REPORTS) {
    await prisma.report.upsert({
      where: { id: report.id },
      update: {
        reason: report.reason,
        status: report.status,
      },
      create: report,
    });
  }

  console.log(
    `[auth-service] seeded ${SELLERS.length} sellers, ${BUYERS.length} buyer, ${SUPPORT_AGENTS.length} customer-service agents, ${STAFF.length} staff, 1 executive, and ${DEMO_REPORTS.length} demo reports (password: "${DEMO_PASSWORD}")`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
