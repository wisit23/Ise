// Idempotent demo orders + disputes so the support panel isn't empty on a
// fresh clone. Fixed IDs, upsert-only — matches the pattern in
// auth-service/product-service/support-service's seed scripts. References
// the fixed-UUID demo buyer/sellers from auth-service's seed and the
// fixed-id demo products (p01, p05, p09) from product-service's seed —
// those three services must have seeded first for these ids to mean
// anything real, but this seed doesn't fail if they haven't (orders here
// have no DB-level FK to auth/product's tables, only soft references).
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

const BUYER = "30000000-0000-0000-0000-000000000001";
const SELLER_DENIM = "10000000-0000-0000-0000-000000000001";
const SELLER_SNEAKER = "10000000-0000-0000-0000-000000000002";
const SELLER_VINTAGE = "10000000-0000-0000-0000-000000000003";
const CS_AGENT = "20000000-0000-0000-0000-000000000001";

const ORDERS = [
  {
    id: "d0000000-0000-0000-0000-000000000001",
    buyerId: BUYER,
    sellerId: SELLER_DENIM,
    productId: "p01",
    productTitle: "เดนิมแจ็คเก็ตวินเทจ Levi's",
    price: 890,
    status: "disputed",
    payoutHeld: true,
    disputedAt: new Date(),
  },
  {
    id: "d0000000-0000-0000-0000-000000000002",
    buyerId: BUYER,
    sellerId: SELLER_SNEAKER,
    productId: "p05",
    productTitle: "รองเท้าผ้าใบ Converse สีขาว",
    price: 690,
    status: "refunded",
    payoutHeld: false,
  },
  {
    id: "d0000000-0000-0000-0000-000000000003",
    buyerId: BUYER,
    sellerId: SELLER_VINTAGE,
    productId: "p09",
    productTitle: "เดรสลายดอกไม้ วินเทจ",
    price: 450,
    status: "completed",
    payoutHeld: false,
  },
];

const DISPUTES = [
  {
    id: "e0000000-0000-0000-0000-000000000001",
    orderId: "d0000000-0000-0000-0000-000000000001",
    openedBy: BUYER,
    reason: "แจ็คเก็ตที่ได้รับมามีรอยขาดตรงแขน ไม่ตรงกับรูปที่ลงประกาศไว้เลย",
    status: "OPEN",
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    orderId: "d0000000-0000-0000-0000-000000000002",
    openedBy: BUYER,
    reason: "สั่งไซส์ 40 แต่ได้รับไซส์ 38 มา สวมใส่ไม่ได้",
    status: "DECIDED",
    decision: "APPROVE_REFUND",
    decisionReason:
      "ตรวจสอบสลิปและรูปสินค้าแล้ว ไซส์ไม่ตรงตามที่สั่งจริง อนุมัติคืนเงินเต็มจำนวน",
    decidedBy: CS_AGENT,
    decidedAt: new Date(),
  },
];

async function main() {
  for (const order of ORDERS) {
    await prisma.order.upsert({
      where: { id: order.id },
      update: {},
      create: order,
    });
  }

  for (const dispute of DISPUTES) {
    await prisma.disputeCase.upsert({
      where: { id: dispute.id },
      update: {},
      create: dispute,
    });
  }

  console.log(
    `[order-service] seeded ${ORDERS.length} demo orders and ${DISPUTES.length} demo disputes`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
