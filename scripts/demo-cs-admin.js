/** Explicit, repeatable manual-QA data set for Customer Service and Admin.
 * Run from the host after `docker compose up -d` with:
 *   npm run demo:cs-admin -- --reset-all-cs-admin --apply
 * Without --apply this only prints the fixture plan. The full reset writes a
 * local backup before replacing CS/Admin cases; it keeps unrelated records.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ID = {
  buyer: "30000000-0000-0000-0000-000000000001",
  seller: "10000000-0000-0000-0000-000000000001",
  seller2: "10000000-0000-0000-0000-000000000002",
  cs: "20000000-0000-0000-0000-000000000001",
  cs2: "20000000-0000-0000-0000-000000000002",
  admin: "40000000-0000-0000-0000-000000000002",
  trust: "40000000-0000-0000-0000-000000000003",
  tickets: [1, 2, 3, 4].map(
    (n) => `c6000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  ),
  orders: [1, 2, 3, 4].map(
    (n) => `c7000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  ),
  disputes: [1, 2, 3, 4].map(
    (n) => `c8000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  ),
  reports: [1, 2, 3].map(
    (n) => `c9000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  ),
};

const LEGACY = {
  tickets: [
    ...[1, 2, 3].map(
      (n) => `f0000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    ),
  ],
  orders: [
    ...[1, 2, 3].map(
      (n) => `d0000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    ),
    "30000000-0000-0000-0000-000000000001", // former standalone Admin dispute fixture
  ],
  disputes: [
    ...[1, 2].map(
      (n) => `e0000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    ),
  ],
  reports: [
    ...[1, 2, 3, 4, 5, 6, 7].map(
      (n) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    ),
    "20000000-0000-0000-0000-000000000005", // former standalone report fixture
  ],
};

const USERS = [
  [ID.buyer, "buyer.demo@example.com", "BUYER", "สมชาย", "ผู้ซื้อ"],
  [ID.seller, "shop.denim@example.com", "SELLER", "มานพ", "ร้านเดนิม"],
  [ID.seller2, "shop.sneaker@example.com", "SELLER", "ปิยะ", "ร้านรองเท้า"],
  [ID.cs, "cs.nan@example.com", "CUSTOMER_SERVICE", "น่าน", "ฝ่ายบริการ"],
  [ID.cs2, "cs.beam@example.com", "CUSTOMER_SERVICE", "บีม", "ฝ่ายบริการ"],
  [ID.admin, "admin@example.com", "ADMIN", "แอดมิน", "ระบบ"],
  [ID.trust, "trust.demo@example.com", "TRUST_AND_SAFETY", "ทีม", "ตรวจสอบ"],
];

const TICKETS = [
  {
    id: ID.tickets[0],
    ticketNumber: "#CS-DEMO-01",
    requesterId: ID.buyer,
    subject: "01 เปิดคำร้องใหม่: ยังไม่มีเจ้าหน้าที่รับงาน",
    description: "ทดสอบรับงานและเริ่มแชท",
    category: "ORDER",
    status: "NEW",
    priority: "NORMAL",
    assigneeId: null,
  },
  {
    id: ID.tickets[1],
    ticketNumber: "#CS-DEMO-02",
    requesterId: ID.buyer,
    targetId: ID.seller,
    orderId: ID.orders[1],
    subject: "02 กำลังดูแล: สินค้าไม่ตรงภาพ",
    description: "ทดสอบแชทสองทางและบันทึกภายใน",
    category: "PAYMENT",
    status: "IN_PROGRESS",
    priority: "HIGH",
    assigneeId: ID.cs,
  },
  {
    id: ID.tickets[2],
    ticketNumber: "#CS-DEMO-03",
    requesterId: ID.buyer,
    targetId: ID.seller2,
    subject: "03 ส่งต่อ Admin: ขอให้ตรวจสอบผู้ขาย",
    description: "ทดสอบ Admin อ่านแชทย้อนหลังหลังส่งต่อ",
    category: "OTHER",
    status: "ESCALATED",
    priority: "URGENT",
    assigneeId: ID.cs,
  },
  {
    id: ID.tickets[3],
    ticketNumber: "#CS-DEMO-04",
    requesterId: ID.buyer,
    subject: "04 ปิดแล้ว: ตรวจประวัติแบบอ่านอย่างเดียว",
    description: "ทดสอบประวัติเคสที่ปิดแล้ว",
    category: "ACCOUNT",
    status: "CLOSED",
    priority: "NORMAL",
    assigneeId: ID.cs,
  },
];

const DISPUTES = [
  {
    id: ID.disputes[0],
    orderId: ID.orders[0],
    status: "OPEN",
    assignedTo: null,
    reason: "DEMO 01 รอ CS รับเคส: สินค้ามีตำหนิที่ไม่ได้แจ้ง",
  },
  {
    id: ID.disputes[1],
    orderId: ID.orders[1],
    status: "OPEN",
    assignedTo: ID.cs,
    reason: "DEMO 02 CS รับเคสแล้ว: สินค้าไม่ตรงภาพประกาศ",
  },
  {
    id: ID.disputes[2],
    orderId: ID.orders[2],
    status: "OPEN",
    assignedTo: null,
    assignedRole: "ADMIN",
    escalatedBy: ID.cs,
    escalationNote:
      "ปัญหา: ผู้ซื้อแจ้งว่าสินค้าผิดขนาด\nขาดอำนาจ: ต้องชี้ขาดเงิน Escrow\nข้อเสนอแนะ: ขอให้ Admin ตรวจหลักฐานทั้งสองฝ่าย",
    reason: "DEMO 03 รอ Admin ตัดสินเงิน: ได้รับสินค้าผิดขนาด",
  },
  {
    id: ID.disputes[3],
    orderId: ID.orders[3],
    status: "DECIDED",
    assignedTo: ID.admin,
    assignedRole: "ADMIN",
    escalatedBy: ID.cs,
    reason: "DEMO 04 ตัดสินแล้ว: สินค้าชำรุด",
  },
];

function localComposeUrl(raw, expectedDatabase) {
  if (!raw) throw new Error(`Missing database URL for ${expectedDatabase}`);
  const url = new URL(raw);
  if (
    !new Set(["localhost", "127.0.0.1", "postgres", "mongo"]).has(url.hostname)
  ) {
    throw new Error(
      `Refusing a non-local database host for ${expectedDatabase}`,
    );
  }
  if (url.pathname.slice(1) !== expectedDatabase) {
    throw new Error(
      `Refusing database ${url.pathname}; expected ${expectedDatabase}`,
    );
  }
  if (url.hostname === "postgres" || url.hostname === "mongo")
    url.hostname = "localhost";
  return url.toString();
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000);

async function run() {
  const fullReset = process.argv.includes("--reset-all-cs-admin");
  if (!process.argv.includes("--apply")) {
    console.log(
      "Dry run: 7 demo users, 4 tickets, 4 orders/disputes, 3 reports and linked private chat history.",
    );
    console.log(
      fullReset
        ? "Full local CS/Admin reset: all tickets, disputes, reports, related order cases and case chats will be backed up and replaced. Add --apply to run."
        : "Only known legacy fixture IDs and this fixture's IDs are reset. Run with --apply after Docker is ready.",
    );
    return;
  }
  const { PrismaClient: AuthClient } = require("@prisma/client");
  const {
    PrismaClient: OrderClient,
  } = require("../backend/services/order-service/src/generated/prisma-client");
  const {
    PrismaClient: SupportClient,
  } = require("../backend/services/support-service/src/generated/prisma-client");
  const {
    PrismaClient: ChatClient,
  } = require("../backend/services/chat-service/src/generated/prisma-client");
  const auth = new AuthClient({
    datasources: {
      db: {
        url: localComposeUrl(process.env.DATABASE_URL_AUTH, "reloop_auth"),
      },
    },
  });
  const order = new OrderClient({
    datasources: {
      db: {
        url: localComposeUrl(process.env.DATABASE_URL_ORDER, "reloop_order"),
      },
    },
  });
  const support = new SupportClient({
    datasources: {
      db: {
        url: localComposeUrl(
          process.env.DATABASE_URL_SUPPORT,
          "reloop_support",
        ),
      },
    },
  });
  const chat = new ChatClient({
    datasources: {
      db: {
        url: localComposeUrl(process.env.DATABASE_URL_CHAT, "reloop_chat"),
      },
    },
  });
  const clients = [auth, order, support, chat];
  try {
    await Promise.all(clients.map((client) => client.$connect()));
    await resetFixtures({ auth, order, support, chat }, { fullReset });
    await seedFixtures({ auth, order, support, chat });
    await verifyFixtures({ auth, order, support, chat }, { fullReset });
    console.log(
      "CS/Admin demo ready. Login accounts and flow: docs/featureplan/customer-service/demo-data.md",
    );
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
}

async function resetFixtures(
  { auth, order, support, chat },
  { fullReset = false } = {},
) {
  const existingTickets = fullReset
    ? await support.supportTicket.findMany({ select: { id: true } })
    : [];
  const existingDisputes = await order.disputeCase.findMany({
    where: fullReset
      ? {}
      : { orderId: { in: [...LEGACY.orders, ...ID.orders] } },
    select: { id: true, orderId: true },
  });
  const existingReports = fullReset
    ? await auth.report.findMany({ select: { id: true } })
    : [];
  const ticketIds = [
    ...new Set([
      ...LEGACY.tickets,
      ...ID.tickets,
      ...existingTickets.map((row) => row.id),
    ]),
  ];
  const orderIds = [
    ...new Set([
      ...LEGACY.orders,
      ...ID.orders,
      ...existingDisputes.map((row) => row.orderId),
    ]),
  ];
  const disputeIds = [
    ...new Set([
      ...LEGACY.disputes,
      ...ID.disputes,
      ...existingDisputes.map((row) => row.id),
    ]),
  ];
  const reportIds = [
    ...new Set([
      ...LEGACY.reports,
      ...ID.reports,
      ...existingReports.map((row) => row.id),
    ]),
  ];
  const keys = [
    ...ticketIds.map((id) => `SUPPORT:${id}`),
    ...disputeIds.map((id) => `DISPUTE:${id}`),
    ...disputeIds.flatMap((id) => [
      `DISPUTE_BUYER:${id}`,
      `DISPUTE_SELLER:${id}`,
    ]),
    ...orderIds.map((id) => `ORDER:${id}`),
  ];
  const rooms = await chat.conversation.findMany({
    where: fullReset
      ? {
          OR: [
            {
              contextType: {
                in: ["SUPPORT", "DISPUTE", "DISPUTE_BUYER", "DISPUTE_SELLER"],
              },
            },
            { contextKey: { in: orderIds.map((id) => `ORDER:${id}`) } },
          ],
        }
      : { contextKey: { in: keys } },
  });
  if (fullReset) {
    const backup = {
      createdAt: new Date().toISOString(),
      scope: "local-cs-admin",
      tickets: await support.supportTicket.findMany({
        include: {
          messages: true,
          auditLog: true,
          assignments: true,
          statusHistory: true,
          slaTargets: true,
          chatLink: true,
          category: true,
          priority: true,
          currentStatus: true,
        },
      }),
      disputes: await order.disputeCase.findMany({
        include: { evidence: true, auditLog: true },
      }),
      orders: await order.order.findMany({
        where: { id: { in: orderIds } },
        include: {
          adminEvidence: true,
          holds: true,
          productSyncEvents: true,
        },
      }),
      disputeAudit: await order.disputeAudit.findMany(),
      reports: await auth.report.findMany(),
      adminAudit: await auth.adminAudit.findMany(),
      conversations: rooms,
      chatMessages: rooms.length
        ? await chat.message.findMany({
            where: { conversationId: { in: rooms.map((room) => room.id) } },
          })
        : [],
    };
    const backupPath = path.join(
      os.tmpdir(),
      `reloop-cs-admin-backup-${Date.now()}.json`,
    );
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), {
      flag: "wx",
    });
    console.log(`Local pre-reset backup: ${backupPath}`);
  }
  if (rooms.length) {
    await chat.message.deleteMany({
      where: { conversationId: { in: rooms.map((room) => room.id) } },
    });
    await chat.conversation.deleteMany({
      where: { id: { in: rooms.map((room) => room.id) } },
    });
  }
  await support.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
  await order.adminDisputeEvidence.deleteMany({
    where: fullReset ? {} : { orderId: { in: orderIds } },
  });
  await order.disputeAudit.deleteMany({
    where: fullReset ? {} : { orderId: { in: orderIds } },
  });
  await order.disputeCase.deleteMany({ where: { id: { in: disputeIds } } });
  await order.order.deleteMany({ where: { id: { in: orderIds } } });
  await auth.adminAudit.deleteMany({
    where: fullReset ? {} : { targetId: { in: reportIds } },
  });
  await auth.report.deleteMany({ where: { id: { in: reportIds } } });
}

async function seedFixtures({ auth, order, support, chat }) {
  const ticketModel = require("../backend/services/support-service/src/features/tickets/ticketModel");
  const {
    seedReferenceData,
  } = require("../backend/services/support-service/prisma/seedReferenceData");
  await seedReferenceData(support);
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash("password123", 10);
  for (const [id, email, role, firstName, lastName] of USERS) {
    const existing = await auth.user.findUnique({ where: { id } });
    if (existing && existing.email !== email)
      throw new Error(`Demo ID ${id} is used by another account`);
    await auth.user.upsert({
      where: { id },
      update: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        status: "ACTIVE",
      },
      create: {
        id,
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        status: "ACTIVE",
      },
    });
    await auth.userRole.upsert({
      where: { userId_role: { userId: id, role } },
      update: {},
      create: { userId: id, role },
    });
  }

  const orderRows = [
    [
      ID.orders[0],
      ID.seller,
      "p01",
      "เดนิมแจ็คเก็ตวินเทจ",
      "disputed",
      true,
      890,
    ],
    [
      ID.orders[1],
      ID.seller,
      "p01",
      "เดนิมแจ็คเก็ตวินเทจ",
      "disputed",
      true,
      890,
    ],
    [
      ID.orders[2],
      ID.seller2,
      "p05",
      "รองเท้าผ้าใบ Converse",
      "disputed",
      true,
      690,
    ],
    [
      ID.orders[3],
      ID.seller2,
      "p05",
      "รองเท้าผ้าใบ Converse",
      "refunded",
      false,
      690,
    ],
  ];
  for (const [
    id,
    sellerId,
    productId,
    productTitle,
    status,
    payoutHeld,
    price,
  ] of orderRows) {
    await order.order.create({
      data: {
        id,
        buyerId: ID.buyer,
        sellerId,
        productId,
        productTitle,
        status,
        payoutHeld,
        price,
        disputedAt: daysAgo(3),
        preDisputeStatus: payoutHeld ? "completed" : null,
        paymentSimulationStatus: "RELEASE_PENDING",
      },
    });
  }
  for (const [index, dispute] of DISPUTES.entries()) {
    await order.disputeCase.create({
      data: {
        ...dispute,
        openedBy: ID.buyer,
        createdAt: daysAgo(3 - index),
        assignedRole:
          dispute.assignedRole ??
          (dispute.assignedTo ? "CUSTOMER_SERVICE" : null),
        claimedAt: dispute.assignedTo ? daysAgo(2) : null,
        priority: "HIGH",
        priorityScore: 55,
        slaExpiresAt: daysAgo(-1),
        ...(dispute.status === "DECIDED"
          ? {
              decision: "APPROVE_REFUND",
              decisionReason: "ตรวจหลักฐานแล้วพบว่าส่งสินค้าผิดขนาด",
              decidedBy: ID.admin,
              decidedAt: daysAgo(1),
              verdictKey: `demo-verdict-${dispute.id}`,
            }
          : {}),
      },
    });
    await order.orderHold.create({
      data: {
        orderId: dispute.orderId,
        source: "DISPUTE",
        referenceId: dispute.id,
        reason: dispute.reason,
        heldBy: ID.buyer,
        heldAt: daysAgo(3),
        ...(dispute.status === "DECIDED"
          ? {
              releasedAt: daysAgo(1),
              releasedBy: ID.admin,
              releaseReason: "Admin อนุมัติคืนเงิน",
            }
          : {}),
      },
    });
  }

  for (const [index, ticket] of TICKETS.entries()) {
    await ticketModel.create(
      {
        ...ticket,
        slaDueAt: daysAgo(index === 2 ? 1 : -1),
        createdAt: daysAgo(4 - index),
        firstResponseAt: index ? daysAgo(3.5 - index) : null,
        escalatedAt: index === 2 ? daysAgo(1) : null,
        escalationNote:
          index === 2
            ? "ปัญหา: ผู้ขายขอให้โอนเงินนอกระบบ\nขาดอำนาจ: ต้องให้ Admin ตรวจสอบและอนุมัติมาตรการ\nข้อเสนอแนะ: ตรวจประวัติผู้ขายและแชทย้อนหลัง"
            : null,
        closedAt: index === 3 ? daysAgo(0.5) : null,
      },
      support,
    );
  }

  const reports = [
    {
      id: ID.reports[0],
      status: "OPEN",
      reason: "DEMO 01 รอตรวจ: ผู้ขายให้โอนเงินนอกระบบ",
    },
    {
      id: ID.reports[1],
      status: "REVIEWED",
      reason: "DEMO 02 ตรวจแล้ว: สินค้าไม่ตรงรายละเอียด",
    },
    {
      id: ID.reports[2],
      status: "ACTIONED",
      reason: "DEMO 03 จัดการแล้ว: แจ้งเตือนผู้ขาย",
    },
  ];
  for (const [index, report] of reports.entries()) {
    await auth.report.create({
      data: {
        ...report,
        reporterId: ID.buyer,
        targetId: ID.seller2,
        reportedAt: daysAgo(3 - index),
        reviewedAt: index ? daysAgo(2 - index) : null,
        reviewedBy: index ? ID.admin : null,
        actionTaken: index === 2 ? "WARN_USER" : null,
      },
    });
  }
  await auth.adminAudit.create({
    data: {
      actorId: ID.admin,
      action: "REPORT_WARN_USER",
      targetId: ID.reports[2],
      reason: "ตรวจสอบรายงานตัวอย่างแล้วแจ้งเตือนผู้ขาย",
      createdAt: daysAgo(0.5),
    },
  });

  for (const [index, ticket] of TICKETS.entries()) {
    const messages = [
      [
        {
          senderId: "system",
          senderRole: "SYSTEM",
          body: "เปิดคำร้องแล้ว รอเจ้าหน้าที่รับงาน",
        },
      ],
      [
        {
          senderId: ID.buyer,
          senderRole: "BUYER",
          body: "สวัสดีครับ สินค้าที่ได้รับมีตำหนิไม่ตรงกับรูป",
        },
        {
          senderId: ID.cs,
          senderRole: "AGENT",
          body: "รับเรื่องแล้วครับ ขอเวลาตรวจสอบรายละเอียด",
        },
        {
          senderId: ID.cs,
          senderRole: "AGENT",
          body: "บันทึกภายใน: ตรวจรูปจากคำสั่งซื้อแล้ว",
          visibility: "INTERNAL",
        },
      ],
      [
        {
          senderId: ID.buyer,
          senderRole: "BUYER",
          body: "ผู้ขายขอให้โอนเงินเพิ่มนอกระบบ ช่วยตรวจสอบด้วยครับ",
        },
        {
          senderId: ID.cs,
          senderRole: "AGENT",
          body: "รับเรื่องแล้ว จะส่งต่อทีมดูแลความปลอดภัย",
        },
        {
          senderId: "system",
          senderRole: "SYSTEM",
          body: "คำร้องถูกส่งต่อให้ Admin แล้ว",
        },
      ],
      [
        {
          senderId: ID.buyer,
          senderRole: "BUYER",
          body: "เข้าใช้งานบัญชีไม่ได้ครับ",
        },
        {
          senderId: ID.cs,
          senderRole: "AGENT",
          body: "แก้ไขแล้ว กรุณาลองเข้าสู่ระบบอีกครั้ง",
        },
      ],
    ][index];
    const participants = [{ userId: ticket.requesterId, role: "BUYER" }];
    if (ticket.assigneeId)
      participants.push({ userId: ticket.assigneeId, role: "AGENT" });
    const room = await createRoom(chat, {
      contextType: "SUPPORT",
      contextId: ticket.id,
      participants,
      status: ticket.status === "CLOSED" ? "LOCKED" : "ACTIVE",
      messages,
      messageTime: daysAgo(3.5 - index),
    });
    await ticketModel.setConversationId(ticket.id, room.id, support);
    for (const message of room.messages) {
      if (message.senderRole === "SYSTEM") continue;
      await ticketModel.recordChatMessage({
          ticketId: ticket.id,
          conversationId: room.id,
          chatMessageId: message.id,
          authorId: message.senderId,
          authorRole: message.senderRole === "AGENT" ? "AGENT" : "REQUESTER",
          isInternal: message.visibility === "INTERNAL",
          createdAt: message.createdAt,
      }, support);
    }
  }

  for (const [index, dispute] of DISPUTES.entries()) {
    const sellerId = index < 2 ? ID.seller : ID.seller2;
    for (const side of ["BUYER", "SELLER"]) {
      const partyId = side === "BUYER" ? ID.buyer : sellerId;
      const participants = [{ userId: partyId, role: side }];
      if (index === 1) participants.push({ userId: ID.cs, role: "AGENT" });
      await createRoom(chat, {
        contextType: `DISPUTE_${side}`,
        contextId: dispute.id,
        participants,
        status: dispute.status === "DECIDED" ? "LOCKED" : "ACTIVE",
        messageTime: daysAgo(index === 3 ? 1.5 : 0.2),
        messages: [
          {
            senderId: partyId,
            senderRole: side,
            body:
              side === "BUYER"
                ? dispute.reason
                : "ผู้ขายชี้แจงสภาพสินค้าและการจัดส่ง",
          },
          ...(index === 1
            ? [
                {
                  senderId: ID.cs,
                  senderRole: "AGENT",
                  body: "รับเคสแล้ว กำลังตรวจสอบหลักฐาน",
                },
              ]
            : []),
          ...(dispute.status === "DECIDED"
            ? [
                {
                  senderId: "system",
                  senderRole: "SYSTEM",
                  body: "Admin ตัดสินให้คืนเงินแล้ว ห้องนี้อ่านย้อนหลังได้",
                },
              ]
            : []),
        ],
      });
    }
  }
}

async function createRoom(
  chat,
  { contextType, contextId, participants, status, messages, messageTime },
) {
  const now = messageTime;
  const room = await chat.conversation.create({
    data: {
      contextType,
      contextId,
      contextKey: `${contextType}:${contextId}`,
      createdBy: participants[0].userId,
      status,
      createdAt: new Date(now.getTime() - 3600000),
      participants: participants.map((p) => ({
        ...p,
        joinedAt: daysAgo(2),
        lastReadAt: null,
        leftAt: null,
      })),
    },
  });
  const saved = [];
  for (const [index, message] of messages.entries()) {
    const createdAt = new Date(
      now.getTime() - (messages.length - index) * 60000,
    );
    saved.push(
      await chat.message.create({
        data: {
          conversationId: room.id,
          senderId: message.senderId,
          senderRole: message.senderRole,
          type: message.senderRole === "SYSTEM" ? "SYSTEM" : "TEXT",
          body: message.body,
          visibility: message.visibility || "ALL",
          deletedAt: null,
          createdAt,
          syncStatus: contextType === "SUPPORT" ? "SYNCED" : null,
          syncedAt: contextType === "SUPPORT" ? createdAt : null,
        },
      }),
    );
  }
  const lastPublic = [...saved]
    .reverse()
    .find((message) => message.visibility !== "INTERNAL");
  if (lastPublic)
    await chat.conversation.update({
      where: { id: room.id },
      data: {
        lastMessageAt: lastPublic.createdAt,
        lastMessagePreview: lastPublic.body.slice(0, 120),
      },
    });
  return { id: room.id, messages: saved };
}

async function verifyFixtures(
  { auth, order, support, chat },
  { fullReset = false } = {},
) {
  const [
    users,
    tickets,
    orders,
    disputes,
    reports,
    rooms,
    oldTickets,
    oldOrders,
    oldReports,
    totals,
    audit,
  ] = await Promise.all([
    auth.user.count({ where: { id: { in: USERS.map(([id]) => id) } } }),
    support.supportTicket.findMany({
      where: { id: { in: ID.tickets } },
      include: { chatLink: true },
    }),
    order.order.count({ where: { id: { in: ID.orders } } }),
    order.disputeCase.count({ where: { id: { in: ID.disputes } } }),
    auth.report.count({ where: { id: { in: ID.reports } } }),
    chat.conversation.count({
      where: {
        contextKey: {
          in: [
            ...ID.tickets.map((id) => `SUPPORT:${id}`),
            ...ID.disputes.flatMap((id) => [
              `DISPUTE_BUYER:${id}`,
              `DISPUTE_SELLER:${id}`,
            ]),
          ],
        },
      },
    }),
    support.supportTicket.count({ where: { id: { in: LEGACY.tickets } } }),
    order.order.count({ where: { id: { in: LEGACY.orders } } }),
    auth.report.count({ where: { id: { in: LEGACY.reports } } }),
    fullReset
      ? Promise.all([
          support.supportTicket.count(),
          order.disputeCase.count(),
          auth.report.count(),
          chat.conversation.count({
            where: {
              contextType: {
                in: ["SUPPORT", "DISPUTE", "DISPUTE_BUYER", "DISPUTE_SELLER"],
              },
            },
          }),
        ])
      : Promise.resolve(null),
    auth.adminAudit.count({
      where: { action: "REPORT_WARN_USER", targetId: ID.reports[2] },
    }),
  ]);
  if (
    users !== 7 ||
    tickets.length !== 4 ||
    orders !== 4 ||
    disputes !== 4 ||
    reports !== 3 ||
    rooms !== 12 ||
    oldTickets ||
    oldOrders ||
    oldReports ||
    audit !== 1 ||
    tickets.some((ticket) => !ticket.chatLink?.conversationId) ||
    (totals && totals.some((count, index) => count !== [4, 4, 3, 12][index]))
  ) {
    throw new Error("Fixture verification failed; rerun --apply");
  }
  console.log(
    `Verified ${users} demo users, ${tickets.length} tickets, ${orders} linked orders, ${disputes} disputes, ${reports} reports, ${rooms} linked chats and report audit.${fullReset ? " No other CS/Admin cases remain." : ""}`,
  );
}

if (require.main === module)
  run().catch((err) => {
    console.error(`[demo:cs-admin] ${err.message}`);
    process.exitCode = 1;
  });

module.exports = { ID, LEGACY, TICKETS, DISPUTES, localComposeUrl };
