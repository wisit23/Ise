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

async function upsertUser({ id, email, firstName, lastName, role, shopName, passwordHash }) {
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    await prisma.user.update({
      where: { email },
      data: {
        role,
        firstName,
        lastName,
        passwordHash,
        ...(shopName
          ? {
              sellerProfile: {
                upsert: {
                  create: { shopName, kycStatus: "VERIFIED", verifiedAt: new Date() },
                  update: { shopName, kycStatus: "VERIFIED", verifiedAt: new Date() },
                },
              },
            }
          : {}),
      },
    });

    await prisma.userRole.upsert({
      where: { userId_role: { userId: existingByEmail.id, role } },
      update: {},
      create: { userId: existingByEmail.id, role },
    });
    return;
  }

  const existingById = await prisma.user.findUnique({ where: { id } });
  if (existingById) {
    await prisma.user.update({
      where: { id },
      data: {
        email,
        role,
        firstName,
        lastName,
        passwordHash,
        ...(shopName
          ? {
              sellerProfile: {
                upsert: {
                  create: { shopName, kycStatus: "VERIFIED", verifiedAt: new Date() },
                  update: { shopName, kycStatus: "VERIFIED", verifiedAt: new Date() },
                },
              },
            }
          : {}),
      },
    });

    await prisma.userRole.upsert({
      where: { userId_role: { userId: id, role } },
      update: {},
      create: { userId: id, role },
    });
    return;
  }

  await prisma.user.create({
    data: {
      id,
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      ...(shopName
        ? {
            sellerProfile: {
              create: { shopName, kycStatus: "VERIFIED", verifiedAt: new Date() },
            },
          }
        : {}),
      roles: {
        create: { role },
      },
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const seller of SELLERS) {
    await upsertUser({
      id: seller.id,
      email: seller.email,
      firstName: seller.firstName,
      lastName: seller.lastName,
      role: "SELLER",
      shopName: seller.shopName,
      passwordHash,
    });
  }

  await upsertUser({
    id: EXECUTIVE.id,
    email: EXECUTIVE.email,
    firstName: EXECUTIVE.firstName,
    lastName: EXECUTIVE.lastName,
    role: "EXECUTIVE",
    passwordHash,
  });

  for (const staff of STAFF) {
    await upsertUser({
      id: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
      passwordHash,
    });
  }

  for (const buyer of BUYERS) {
    await upsertUser({
      id: buyer.id,
      email: buyer.email,
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      role: "BUYER",
      passwordHash,
    });
  }

  for (const agent of SUPPORT_AGENTS) {
    await upsertUser({
      id: agent.id,
      email: agent.email,
      firstName: agent.firstName,
      lastName: agent.lastName,
      role: "CUSTOMER_SERVICE",
      passwordHash,
    });
  }

  console.log(
    `[auth-service] seeded ${SELLERS.length} sellers, ${BUYERS.length} buyer, ${SUPPORT_AGENTS.length} customer-service agents, ${STAFF.length} staff and 1 executive (password: "${DEMO_PASSWORD}")`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
