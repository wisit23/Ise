# Customer Service Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **แผนฉบับแก้ไข 2026-08-25** — เปลี่ยนช่องทางสื่อสารหลักของ CS จาก Live Chat เป็น **Support Ticket Thread**
> และเพิ่ม `CSS-000` (Foundation) กับ `CSS-005` (Ticket Core) ดูเหตุผลที่หัวข้อ "Scope Revision" ด้านล่าง

**Goal:** ให้เจ้าหน้าที่ CS รับเรื่อง จัดลำดับความเร่งด่วน ค้น Order ตอบผู้ใช้ และตัดสินคำร้องคืนสินค้า/เงิน
ได้ครบวงจรพร้อมหลักฐานและ audit trail โดยไม่ต้องรอระบบ Chat

**Architecture:** `support-service` (ใหม่) เป็นเจ้าของ Ticket/TicketMessage/HelpArticle/Audit ใน `reloop_support`;
`order-service` ยังเป็นเจ้าของ dispute/refund/payout state ใน `reloop_order` ตามหลัก service ownership เดิม;
CS UI เรียกผ่าน Gateway ด้วย permission-scoped API และห้ามเปิดเคสที่ไม่ได้ถูก assign

**Tech Stack:** Express, Prisma/PostgreSQL, Next.js, `node --test` (ตามธรรมเนียม repo — ไม่ใช้ Jest ฝั่ง backend)

---

## Scope Revision (2026-08-25)

### ทำไมถึงไม่เริ่มที่ Chat

แผนเดิมวาง `CSS-001` (Participant-Safe Chat) เป็นงานแรก เพราะ WF-10 ข้อ 6 เขียนว่าเจ้าหน้าที่ตอบผู้ใช้
"ผ่าน Chat Console" ทำให้ดูเหมือน Chat เป็น prerequisite ของทั้งระบบ CS

แต่ในระบบ CS ระดับ Production จริง (Zendesk, Jira Service Desk, Freshdesk) **ช่องทางหลักคือ Ticket Thread
แบบ async ไม่ใช่ Live Chat** ส่วน Live Chat เป็นเพียง _ช่องทางเพิ่ม_ ที่ไหลเข้ามาเป็น Ticket เหมือนกัน

|                  | Ticket Thread (`CSS-005`) | Live Chat (`CSS-001`)    |
| ---------------- | ------------------------- | ------------------------ |
| รูปแบบ           | ตอบกลับแบบ async          | Real-time                |
| เทคโนโลยี        | REST (`POST`/`GET`)       | WebSocket + Pub/Sub      |
| ครอบคลุม `WF-10` | ครบทุกขั้นตอน             | เป็นช่องทางเพิ่มเท่านั้น |

ผลคือ **`CSS-001` ถูกเลื่อนเป็น Deferred** และ `CSS-005` เข้ามาเป็นแกนสื่อสารแทน โดยออกแบบให้ Chat
เสียบเข้ามาเป็นช่องทางเพิ่มภายหลังได้โดยไม่ต้องรื้อ `CSS-005`

### Task ID ยังคงเดิมเพื่อไม่ให้ traceability พัง

เอกสารทีมอื่นอ้างอิง Task ID เหล่านี้อยู่ (`buyer/plan.md` อ้าง `CSS-001`, `admin/plan.md` อ้าง `CSS-003`,
`featureplan/plan.md` อ้าง `CSS-001`–`CSS-004`) จึง **คงความหมายของ ID เดิมทุกตัว** และเพิ่ม ID ใหม่แทน
การเรียงลำดับใหม่ — ลำดับการทำงานจริงดูที่ "Execution Order" ด้านล่าง

### ผลกระทบข้ามทีมที่ต้องแจ้ง

- `buyer/plan.md` → `BUY-004` (`UR-05`, `FR-2.2.1`, `FR-2.2.2` ปุ่มทักแชทผู้ขาย) **ผูกกับ `CSS-001` ที่ถูกเลื่อน**
  ต้องคุยกับ Buyer owner ว่าจะเลื่อนตามหรือแยกทำ Buyer↔Seller chat ต่างหาก
- `UR-18` / `FR-4.1.2` (Chat Console ของเจ้าหน้าที่) **ยังไม่ถูก cover ในรอบนี้** — ห้ามเคลมว่า Done

---

## Global Constraints

- Owner: อชิรวินท์; Reviewer: สิรดนัย
- Trace: `UR-17`, `UR-19`, `UR-20`, `UR-21` (Core รอบนี้) — `UR-18` Deferred ไปกับ `CSS-001`
- Functional case assignment/role checks อยู่ใน Core; production security hardening ทำภายหลัง
- Refund/payment เป็น simulated state เท่านั้น — ห้ามต่อ Payment Gateway จริง
- SupportTicket, TicketMessage, TicketAuditLog, HelpArticle, DisputeCase, DisputeEvidence และ refund
  decision ต้อง persist ผ่าน Prisma ใน PostgreSQL จริง **ห้ามใช้ mock/in-memory database เป็น acceptance evidence**
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase **ยกเว้น** private evidence storage (ดู `CSS-003`)
  ซึ่งย้ายเข้ามาเป็น Core เพราะเป็นช่องโหว่ที่เกิดขึ้นจริง ไม่ใช่ hardening เชิงป้องกัน
- ทุก Task ทำแบบ test-first: เขียน test ที่ fail ก่อน แล้วค่อย implement
- Database test รันด้วย `REQUIRE_INTEGRATION=1` — database ที่ต่อไม่ได้ต้อง **fail ไม่ใช่ skip**

---

## Execution Order

```
CSS-000 (Foundation)  →  CSS-005 (Ticket Core)  →  CSS-002 (Agent Workspace)
                      →  CSS-003 (Dispute/Refund)  →  CSS-004 (SLA + FAQ)
                      →  [Deferred] CSS-001 (Live Chat Console)
```

`CSS-000` เป็น hard blocker ของทุกตัว — ไม่มี `SUPPORT` role และ `support-service` แล้วทำอะไรต่อไม่ได้เลย

---

## Requirement Traceability

| UR      | Functional Requirement | Active/Deferred NFR                                              | Workflow         | Task / Phase                |
| ------- | ---------------------- | ---------------------------------------------------------------- | ---------------- | --------------------------- |
| `UR-17` | `FR-4.1.1`             | `NFR-P-01`, `NFR-M-01`; `NFR-SP-01` (Security Phase)             | `WF-10`          | `CSS-002` / Core            |
| `UR-18` | `FR-4.1.2`             | `NFR-P-02`                                                       | `WF-06`, `WF-10` | `CSS-001` / **Deferred**    |
| `UR-19` | `FR-4.1.3`             | ไม่มี NFR เฉพาะ                                                  | `WF-10`          | `CSS-004` / Core            |
| `UR-20` | `FR-3.2.1`, `FR-3.2.2` | `NFR-P-04`; `NFR-SP-03`, `NFR-CP-02` (Security/Compliance Phase) | `WF-08`          | `CSS-003` / Core            |
| `UR-21` | `FR-4.1.4`             | ไม่มี NFR เฉพาะ                                                  | `WF-10`          | `CSS-004` / Core            |
| —       | รองรับ `WF-10` ทั้งสาย | `NFR-M-01`                                                       | `WF-10`          | `CSS-000`, `CSS-005` / Core |

### PostgreSQL acceptance for Customer Service

- `CSS-000`: `SUPPORT` role, `reloop_support` database และ Order dispute-state columns มีอยู่จริงใน PostgreSQL
- `CSS-005`: ticket state transition, thread message, internal note และ audit row persist ใน `reloop_support`
- `CSS-002`: agent order lookup อ่าน Order จริงข้าม service และ unassigned access ถูกปฏิเสธ
- `CSS-003`: evidence reference, payout hold และ **exactly-one** simulated refund decision persist ใน `reloop_order`
- `CSS-004`: FAQ revision/status, SLA timestamp และ escalation persist โดยไม่ escalate ซ้ำ

---

## Known Risks / Gotchas

| #   | ความเสี่ยง                                                                                                                                                         | การจัดการ                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `infra/postgres/init-databases.sql` รันเฉพาะตอน **cluster init ครั้งแรก** — เพิ่ม `reloop_support` แล้วเครื่องที่มี `pgdata` volume อยู่แล้วจะไม่ได้ database ใหม่ | `CSS-000` ต้องมีขั้นตอน idempotent สร้าง database ตอน service start (หรือเอกสารสั่ง `docker compose down -v`) — เป็นบั๊กประเภทเดียวกับ `MOCK-TRADE-010` ที่เคยทำให้ clone แล้วพัง |
| 2   | หลักฐานข้อพิพาทรั่วสู่สาธารณะ — `gateway/src/app.js` allowlist `/^\/uploads\//` ไว้ให้ guest ดูรูปสินค้าได้                                                        | `CSS-003` ต้องใช้ private storage แยก + authz + ห้ามใส่ใน `PUBLIC_PATHS`                                                                                                          |
| 3   | เจ้าหน้าที่ 2 คนรับเคส/ตัดสินเคสเดียวกันพร้อมกัน                                                                                                                   | Optimistic lock ด้วย `version` → ตอบ `409`                                                                                                                                        |
| 4   | SLA job รันหลาย instance แล้ว escalate ซ้ำ                                                                                                                         | ใช้ conditional `updateMany` (`escalatedAt: null` ใน where) ให้ instance เดียวชนะแบบ atomic                                                                                       |
| 5   | `CSS-001` ถูกเลื่อน แต่ `BUY-004` ผูกอยู่                                                                                                                          | แจ้ง Buyer owner ก่อนเริ่ม `CSS-005`                                                                                                                                              |

---

## Task CSS-000: Foundation (SUPPORT Role + support-service + Order Dispute State)

**Files:**

- Modify: `backend/services/auth-service/prisma/schema.prisma` (เพิ่ม `SUPPORT` ใน `Role` enum)
- Modify: `backend/services/auth-service/prisma/seed.js` (seed บัญชีเจ้าหน้าที่ CS)
- Create: `backend/services/support-service/package.json`
- Create: `backend/services/support-service/Dockerfile`
- Create: `backend/services/support-service/prisma/schema.prisma`
- Create: `backend/services/support-service/src/{app.js,server.js,models/prismaClient.js}`
- Modify: `docker-compose.yml` (service `support-service`, `DATABASE_URL_SUPPORT`)
- Modify: `infra/postgres/init-databases.sql` (`CREATE DATABASE reloop_support`)
- Modify: `.env.example` (`DATABASE_URL_SUPPORT`, `SUPPORT_PORT=3006`)
- Modify: `backend/gateway/src/app.js` (proxy `/api/support`)
- Modify: `backend/services/order-service/prisma/schema.prisma` (`payoutHeld`, `disputedAt`)
- Modify: `backend/services/order-service/src/models/orderModel.js` (`VALID_STATUSES` + `disputed`, `refunded`)
- Test: `backend/services/support-service/test/health.integration.test.js`

**Interfaces:**

- Produces: `GET /api/support/health`
- Produces: `Role.SUPPORT` ใน access token claims
- Produces: Order lifecycle `pending → confirmed → shipped → completed | cancelled | disputed → refunded`

- [ ] **Step 1: เขียน test ที่ fail — `SUPPORT` role และ support-service ยังไม่มี**

```js
const token = signAccessToken({ sub: "cs-1", role: "SUPPORT" });
assert.equal((await request(app).get("/health")).status, 200);
```

- [ ] **Step 2: รัน test ยืนยันว่า fail เพราะ service/role ยังไม่มีจริง**
- [ ] **Step 3: เพิ่ม `SUPPORT` role, scaffold `support-service` และขยาย Order lifecycle**

ระวัง: `requireSellerRole` ใน product-service เช็ค `["SELLER","ADMIN"]` — ตรวจว่าที่อื่นมี role list
แบบ hardcode ตกหล่นหรือไม่ก่อนเพิ่ม role ใหม่

- [ ] **Step 4: จัดการ database creation ให้ idempotent (Risk #1)**

```powershell
docker compose up -d --build
docker compose exec postgres psql -U reloop -lqt | Select-String reloop_support
docker compose exec -e REQUIRE_INTEGRATION=1 support-service node --test test/health.integration.test.js
```

Expected: `reloop_support` มีอยู่จริงแม้ `pgdata` volume เดิมจะถูกสร้างไว้ก่อนหน้า

- [ ] **Step 5: อัปเดต docs และ commit `feat(cs): add support service foundation`**

---

## Task CSS-005: Support Ticket Core (WF-10 Backbone)

**Files:**

- Modify: `backend/services/support-service/prisma/schema.prisma`
- Create: `backend/services/support-service/src/features/tickets/{ticketRoutes.js,ticketController.js,ticketService.js,ticketModel.js}`
- Create: `backend/services/support-service/src/features/tickets/ticketState.js`
- Create: `backend/services/support-service/src/features/audit/auditLog.js`
- Create: `frontend/app/support/tickets/page.js` (ผู้ใช้), `frontend/app/support/queue/page.js` (เจ้าหน้าที่)
- Test: `backend/services/support-service/test/ticket-lifecycle.integration.test.js`
- Test: `backend/services/support-service/src/features/tickets/ticketState.test.js`

**Data model:**

```prisma
model SupportTicket {
  id              String    @id @default(uuid())
  ticketNumber    String    @unique              // #CS-000123 — ไว้อ้างอิงตอนคุยกับลูกค้า
  requesterId     String    @map("requester_id")
  subject         String
  description     String    @default("")
  category        String                          // ORDER|PAYMENT|ACCOUNT|TECHNICAL|OTHER
  status          String    @default("NEW")       // NEW|ASSIGNED|IN_PROGRESS|PENDING_USER|RESOLVED|CLOSED|ESCALATED
  priority        String    @default("NORMAL")    // LOW|NORMAL|HIGH|URGENT
  assigneeId      String?   @map("assignee_id")
  orderId         String?   @map("order_id")      // soft reference ข้าม service — ไม่ใช่ FK
  slaDueAt        DateTime? @map("sla_due_at")
  firstResponseAt DateTime? @map("first_response_at")
  resolvedAt      DateTime? @map("resolved_at")
  closedAt        DateTime? @map("closed_at")
  escalatedAt     DateTime? @map("escalated_at")
  version         Int       @default(0)           // optimistic lock
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  messages TicketMessage[]
  auditLog TicketAuditLog[]

  @@index([status, priority, slaDueAt])
  @@index([requesterId, createdAt])
  @@index([assigneeId, status])
  @@map("support_tickets")
}

model TicketMessage {
  id         String   @id @default(uuid())
  ticketId   String   @map("ticket_id")
  authorId   String   @map("author_id")
  authorRole String   @map("author_role")   // REQUESTER|AGENT|SYSTEM
  body       String
  isInternal Boolean  @default(false) @map("is_internal")  // โน้ตภายในทีม ลูกค้ามองไม่เห็น
  createdAt  DateTime @default(now()) @map("created_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
  @@map("ticket_messages")
}

model TicketAuditLog {
  id        String   @id @default(uuid())
  ticketId  String   @map("ticket_id")
  actorId   String   @map("actor_id")
  action    String                              // ASSIGN|STATUS_CHANGE|REPLY|VIEW_EVIDENCE|ESCALATE
  fromValue String?  @map("from_value")
  toValue   String?  @map("to_value")
  reason    String?
  createdAt DateTime @default(now()) @map("created_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
  @@map("ticket_audit_logs")
}
```

**Interfaces:**

- Produces (ผู้ใช้): `POST /api/support/tickets`, `GET /api/support/tickets/mine`, `GET /api/support/tickets/:id`,
  `POST /api/support/tickets/:id/messages`
- Produces (เจ้าหน้าที่): `GET /api/support/queue`, `POST /api/support/tickets/:id/assign`,
  `PATCH /api/support/tickets/:id/status`
- Produces: `ticketState.canTransition(from, to)` — pure function

- [ ] **Step 1: เขียน test ที่ fail สำหรับ state machine, RBAC และ optimistic lock**

```js
// state machine เป็น pure function — test ได้โดยไม่แตะ database
assert.equal(canTransition("NEW", "ASSIGNED"), true);
assert.equal(canTransition("CLOSED", "IN_PROGRESS"), false);

// ผู้ใช้คนอื่นห้ามเปิด ticket ที่ไม่ใช่ของตัวเอง
assert.equal((await getTicket(id, strangerToken)).status, 403);
// เจ้าหน้าที่ที่ไม่ได้ถูก assign ก็ห้ามเช่นกัน
assert.equal((await getTicket(id, otherAgentToken)).status, 403);
// internal note ต้องไม่หลุดไปฝั่งผู้ใช้
assert.equal(
  userView.messages.some((m) => m.isInternal),
  false,
);
```

- [ ] **Step 2: รัน test ยืนยันว่า fail เพราะ route/schema ยังไม่มี**
- [ ] **Step 3: implement state machine, RBAC และ audit**

```js
const TRANSITIONS = {
  NEW: ["ASSIGNED", "ESCALATED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["PENDING_USER", "RESOLVED", "ESCALATED"],
  PENDING_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"], // WF-10 ข้อ 7: ผู้ใช้บอกยังไม่หาย → กลับไป IN_PROGRESS
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  CLOSED: [],
};
```

Optimistic lock ตอนรับเคส (กันเจ้าหน้าที่ 2 คนแย่งเคสเดียวกัน):

```js
const { count } = await prisma.supportTicket.updateMany({
  where: { id, version, assigneeId: null },
  data: { assigneeId: agentId, status: "ASSIGNED", version: { increment: 1 } },
});
if (count === 0) throw conflict("ticket was already taken or modified");
```

- [ ] **Step 4: ยืนยัน lifecycle, audit และ concurrency กับ database จริง**

```powershell
docker compose exec support-service npx prisma db push --schema prisma/schema.prisma
docker compose exec -e REQUIRE_INTEGRATION=1 support-service node --test test/ticket-lifecycle.integration.test.js
```

Expected: assign ซ้อนกันได้ `409` หนึ่งครั้ง; ทุก transition มี audit row; internal note ไม่หลุดฝั่งผู้ใช้

- [ ] **Step 5: อัปเดต docs และ commit `feat(cs): add support ticket core`**

---

## Task CSS-002: Agent Workspace — Order Lookup and Case Queue

**Files:**

- Create: `backend/services/order-service/src/features/support/{supportRoutes.js,supportService.js}`
- Create: `backend/services/support-service/src/services/orderClient.js` (เรียกข้าม service)
- Create: `frontend/app/support/cases/page.js`
- Test: `backend/services/order-service/test/support-lookup.integration.test.js`

**Interfaces:**

- Produces: `GET /api/orders/support/search?orderId&buyerId&email` (ต้อง `SUPPORT`/`ADMIN`)
- Produces: role-scoped order projection (เจ้าหน้าที่เห็นเท่าที่จำเป็น ไม่ใช่ทั้ง row)

- [ ] **Step 1: เขียน test ที่ fail สำหรับ role gate, bounded search และ projection**

```js
assert.equal((await search({ orderId }, buyerToken)).status, 403);
assert.equal((await search({}, supportToken)).status, 400); // ห้าม search เปล่า = dump ทั้งตาราง
```

- [ ] **Step 2: รัน test ยืนยันว่า route ยังไม่มี**
- [ ] **Step 3: implement bounded search + role-scoped projection + pagination**

ใช้ `parsePagination`/`paginatedResponse` จาก `@reloop/shared` ที่มีอยู่แล้ว
เรียกข้าม service ด้วย `requireInternalToken` ตามแพทเทิร์นเดิมใน `productClient.js`

- [ ] **Step 4: ยืนยันว่าค้นด้วย order id/buyer id ได้ผลจริง และ role อื่นถูกปฏิเสธ**
- [ ] **Step 5: อัปเดต docs และ commit `feat(cs): add agent order lookup`**

---

## Task CSS-003: Dispute, Private Evidence and Simulated Refund Decision

**Files:**

- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `backend/services/order-service/src/features/disputes/{disputeRoutes.js,disputeService.js,disputeModel.js}`
- Create: `backend/services/order-service/src/features/disputes/evidenceStorage.js` (private storage)
- Create: `frontend/app/support/cases/[id]/page.js`
- Test: `backend/services/order-service/test/dispute-decision.integration.test.js`
- Test: `backend/services/order-service/test/evidence-access.integration.test.js`

**Data model:**

```prisma
model DisputeCase {
  id               String    @id @default(uuid())
  orderId          String    @unique @map("order_id")   // 1 order = 1 dispute
  openedBy         String    @map("opened_by")
  reason           String
  status           String    @default("OPEN")            // OPEN|NEEDS_INFO|DECIDED
  decision         String?                               // APPROVE_REFUND|REJECT
  decisionReason   String?   @map("decision_reason")
  decidedBy        String?   @map("decided_by")
  decidedAt        DateTime? @map("decided_at")
  evidenceDeadline DateTime? @map("evidence_deadline")   // WF-08 ข้อ 6: ตอบกลับใน 48 ชม.
  version          Int       @default(0)
  createdAt        DateTime  @default(now()) @map("created_at")

  evidence DisputeEvidence[]

  @@map("dispute_cases")
}

model DisputeEvidence {
  id         String   @id @default(uuid())
  disputeId  String   @map("dispute_id")
  uploaderId String   @map("uploader_id")
  storageKey String   @map("storage_key")   // ไม่ใช่ public URL — ต้องผ่าน authz endpoint
  fileType   String   @map("file_type")
  createdAt  DateTime @default(now()) @map("created_at")

  dispute DisputeCase @relation(fields: [disputeId], references: [id], onDelete: Cascade)

  @@index([disputeId])
  @@map("dispute_evidence")
}
```

**Interfaces:**

- Produces: `POST /api/orders/:id/disputes` (ผู้ซื้อเปิดเคส → Hold Payout อัตโนมัติ)
- Produces: `POST /api/orders/disputes/:id/evidence` (อัปโหลด private)
- Produces: `GET /api/orders/disputes/:id/evidence/:evidenceId` (authz + audit ทุกครั้งที่เปิดดู)
- Produces: `POST /api/orders/disputes/:id/decision {decision, reason, version}`

- [ ] **Step 1: เขียน test ที่ fail สำหรับ double-decision, payout hold และ evidence access**

```js
const DECISIONS = ["APPROVE_REFUND", "REJECT"];

// ตัดสินได้ครั้งเดียวเท่านั้น
assert.equal(
  (
    await decide(id, {
      decision: "APPROVE_REFUND",
      reason: "ชำรุดจริง",
      version: 0,
    })
  ).status,
  200,
);
assert.equal(
  (await decide(id, { decision: "REJECT", reason: "เปลี่ยนใจ", version: 0 }))
    .status,
  409,
);

// บังคับกรอกเหตุผล (FR-3.2.2)
assert.equal(
  (await decide(id2, { decision: "REJECT", version: 0 })).status,
  400,
);

// หลักฐานต้องไม่เปิดสาธารณะ (Risk #2)
assert.equal((await fetchEvidenceNoAuth(url)).status, 401);
assert.equal((await fetchEvidence(url, strangerToken)).status, 403);
```

- [ ] **Step 2: รัน test ยืนยันว่า endpoint ยังไม่มี**
- [ ] **Step 3: implement Hold Payout, private evidence และ one-way audited decision**

WF-08 ข้อ 3: เปิดเคส → `order.status = "disputed"`, `payoutHeld = true` ใน transaction เดียว
WF-08 ข้อ 7/8: `APPROVE_REFUND` → `refunded`; `REJECT` → `completed` + `payoutHeld = false`

Private storage: เก็บนอก `uploads/` ที่ static-served และ **ห้ามเพิ่มลง `PUBLIC_PATHS` ใน gateway**
ทุกการเปิดดูหลักฐานต้องเขียน audit row (`NFR-SP-03`)

- [ ] **Step 4: ยืนยัน exactly-one decision, payout hold และ evidence authz กับ database จริง**

```powershell
docker compose exec -e REQUIRE_INTEGRATION=1 order-service node --test test/dispute-decision.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 order-service node --test test/evidence-access.integration.test.js
curl -i http://localhost:8080/uploads/<evidence-key>   # ต้องได้ 401/404 ไม่ใช่ 200
```

- [ ] **Step 5: อัปเดต docs และ commit `feat(cs): add audited dispute decisions`**

---

## Task CSS-004: SLA, Auto-Priority and Help Center

**Files:**

- Create: `backend/services/support-service/src/features/sla/{priority.js,slaMonitor.js}`
- Create: `backend/services/support-service/src/features/help-content/{helpRoutes.js,helpService.js}`
- Modify: `backend/services/support-service/prisma/schema.prisma`
- Create: `frontend/app/help/page.js`, `frontend/app/support/help-content/page.js`
- Test: `backend/services/support-service/src/features/sla/priority.test.js`
- Test: `backend/services/support-service/test/sla-escalation.integration.test.js`
- Test: `backend/services/support-service/test/help-content.integration.test.js`

**Data model (เพิ่ม):**

```prisma
model HelpArticle {
  id          String    @id @default(uuid())
  slug        String    @unique
  title       String
  body        String
  category    String
  status      String    @default("DRAFT")   // DRAFT|PUBLISHED|ARCHIVED
  version     Int       @default(1)
  authorId    String    @map("author_id")
  publishedAt DateTime? @map("published_at")
  searchText  String    @default("") @map("search_text")  // trigram index — ดู MOCK-TRADE-011

  @@index([status, category])
  @@map("help_articles")
}
```

**Interfaces:**

- Produces: `calculatePriority(caseData)` — pure, deterministic
- Produces: `GET /api/support/help/search?q=` (public — FAQ deflection ตาม `WF-10` ข้อ 2)
- Produces: `POST /api/support/help`, `PATCH /api/support/help/:id/publish` (ต้อง `SUPPORT`/`ADMIN`)

- [ ] **Step 1: เขียน test ที่ fail สำหรับ priority, escalation และ publish gate**

```js
// WF-10 ข้อ 3: เคสเรื่องเงิน/ข้อพิพาท = Urgent
assert.equal(calculatePriority({ isDispute: true }), "URGENT");
assert.equal(calculatePriority({ category: "PAYMENT" }), "URGENT");
assert.equal(calculatePriority({ orderAmount: 10000 }), "URGENT");
assert.equal(calculatePriority({ minutesWaiting: 240 }), "HIGH");
assert.equal(calculatePriority({}), "NORMAL");
```

- [ ] **Step 2: รัน test ยืนยันว่า module ยังไม่มี**
- [ ] **Step 3: implement SLA monitor, priority และ draft→published revision**

SLA target: `URGENT` 1 ชม. / `HIGH` 4 ชม. / `NORMAL` 24 ชม. / `LOW` 72 ชม.
เก็บ `slaDueAt` เป็นเวลาสัมบูรณ์ตอนสร้าง ไม่คำนวณตอนอ่าน

Escalation ที่กัน double-escalate ได้แม้รันหลาย instance (Risk #4):

```js
await prisma.supportTicket.updateMany({
  where: {
    status: { notIn: ["RESOLVED", "CLOSED", "ESCALATED"] },
    slaDueAt: { lt: new Date() },
    escalatedAt: null, // instance เดียวเท่านั้นที่ชนะ — atomic
  },
  data: { status: "ESCALATED", escalatedAt: new Date() },
});
```

FAQ search: ใช้ `pg_trgm` + GIN index แบบเดียวกับ `MOCK-TRADE-011` — ค้นภาษาไทยได้เลย
ไม่ต้องใช้ Postgres full-text search (ไม่มี Thai config)

- [ ] **Step 4: ยืนยัน escalation ไม่ซ้ำ, publish gate และ FAQ search ภาษาไทย**

```powershell
docker compose exec -e REQUIRE_INTEGRATION=1 support-service node --test test/sla-escalation.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 support-service node --test test/help-content.integration.test.js
```

Expected: รัน monitor ซ้ำ 2 รอบแล้ว `escalatedAt` ไม่เปลี่ยน; ผู้ใช้ทั่วไป publish บทความไม่ได้

- [ ] **Step 5: อัปเดต docs และ commit `feat(cs): add sla monitor and help center`**

---

## Task CSS-001: Participant-Safe Live Chat Console — **DEFERRED**

**สถานะ:** เลื่อนออกจาก Core รอบนี้ (ดู "Scope Revision")

**เหตุผล:** `WF-10` ทำงานครบวงจรได้ด้วย Ticket Thread (`CSS-005`) แล้ว — Live Chat เป็นช่องทางเพิ่ม
ไม่ใช่ prerequisite และยังมีข้อถกเถียงเรื่องรูปแบบการ persist ข้อความที่ยังไม่ได้ข้อสรุปกับอาจารย์

**เมื่อกลับมาทำ ต้องออกแบบให้:**

- Chat message ไหลเข้าเป็น `SupportTicket` + `TicketMessage` เดียวกัน ไม่แยก data model ใหม่
- ใช้ `assertRoomAccess()` ตรวจสิทธิ์ฝั่ง server ก่อน join room ทุกครั้ง
- `clientMessageId` สำหรับ idempotency กันข้อความซ้ำตอน reconnect
- **บันทึกลง database ให้สำเร็จก่อน แล้วค่อย broadcast** — เพราะ `UR-25` ใช้ประวัติแชทเป็นหลักฐานตัดสินข้อพิพาท
  การส่งก่อนบันทึกจะทำให้เกิดข้อความที่ผู้รับเห็นแล้วแต่ไม่มีในประวัติ
- Redis Pub/Sub จำเป็นเมื่อรันมากกว่า 1 instance เท่านั้น (ดู `docs/architecture.md` ข้อ 433)

**Blocker ข้ามทีม:** `buyer/plan.md` → `BUY-004` (`UR-05`) ผูกกับ Task นี้ ต้องคุยกับ Buyer owner
