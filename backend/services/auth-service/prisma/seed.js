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

  console.log(
    `[auth-service] seeded ${SELLERS.length} demo seller accounts + 1 demo executive account (password: "${DEMO_PASSWORD}")`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
