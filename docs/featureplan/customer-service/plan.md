# Customer Service Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เจ้าหน้าที่ค้น Order, สนทนา ช่วยเหลือ และตัดสินคำร้องคืนสินค้า/เงินด้วยหลักฐานและ audit

**Architecture:** Chat service owns rooms/messages/support handoff; Order owns dispute/refund state CS UI ใช้ permission-scoped APIs ผ่าน Gateway และห้ามค้น conversation โดยไม่มี case assignment

**Tech Stack:** Express, Socket.IO, Redis adapter, Prisma/PostgreSQL, Next.js, Node/Jest tests

## Global Constraints

- Owner: อชิรวินท์; Reviewer: สิรดนัย
- Trace: `UR-17`–`UR-21`, `UC-05`, `UC-10`
- Functional case assignment/role checks อยู่ใน Core; production security hardening ทำภายหลัง
- Refund/payment เป็น simulated state เท่านั้น
- Chat message, SupportCase, evidence reference และ refund decision ต้อง persist ผ่าน Prisma
  ใน PostgreSQL จริง ห้ามใช้ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase

---

## Requirement Traceability

| UR      | Functional Requirement | Active/Deferred NFR                                  | Workflow         | Task / Phase                |
| ------- | ---------------------- | ---------------------------------------------------- | ---------------- | --------------------------- |
| `UR-17` | `FR-4.1.1`             | `NFR-P-01`, `NFR-M-01`; `NFR-SP-01` (Security Phase) | `WF-10`          | `CSS-002` / Core            |
| `UR-18` | `FR-4.1.2`             | `NFR-P-02`                                           | `WF-06`, `WF-10` | `CSS-001`, `CSS-002` / Core |
| `UR-19` | `FR-4.1.3`             | ไม่มี NFR เฉพาะ                                      | `WF-10`          | `CSS-004` / Extended        |
| `UR-20` | `FR-3.2.1`, `FR-3.2.2` | `NFR-P-04`; `NFR-SP-03` (Security Phase)             | `WF-08`          | `CSS-003` / Core            |
| `UR-21` | `FR-4.1.4`             | ไม่มี NFR เฉพาะ                                      | `WF-10`          | `CSS-004` / Extended        |

### PostgreSQL acceptance for Customer Service

- `CSS-001`: room membership, message idempotency and message history persist in `reloop_chat`
- `CSS-002`: SupportCase assignment/version/search reads persisted Order/Case data
- `CSS-003`: evidence reference and exactly-one simulated refund decision persist in `reloop_order`
- `CSS-004`: FAQ revision/status and SLA timestamps persist in `reloop_chat`
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task CSS-001: Participant-Safe Chat

**Files:**

- Create: `backend/services/chat-service/prisma/schema.prisma`
- Modify: `backend/services/chat-service/package.json`
- Create: `backend/services/chat-service/src/models/prismaClient.js`
- Create: `backend/services/chat-service/src/features/chat/chatRoutes.js`
- Create: `backend/services/chat-service/src/features/chat/chatService.js`
- Modify: `backend/services/chat-service/src/server.js`
- Create: `frontend/app/chat/[roomId]/page.js`
- Test: `backend/services/chat-service/test/chat-auth.integration.test.js`

**Interfaces:**

- Produces: `POST /api/chat/rooms {sellerId, productId}` and `GET /api/chat/rooms/:id/messages`
- Produces: Socket events `message.send.v1`, `message.created.v1`

- [ ] **Step 1: Write failing participant/forged-room tests**

```js
assert.equal((await join(roomId, buyerToken)).status, 200);
assert.equal((await join(roomId, strangerToken)).status, 403);
```

- [ ] **Step 2: Run Chat integration test; expect missing schema/routes**
- [ ] **Step 3: Implement room membership and server-authorized Socket join**

```js
async function assertRoomAccess({ roomId, userId, permissions }) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: { supportCase: true },
  });
  if (!room) throw notFound("chat room not found");
  if (room.buyerId === userId || room.sellerId === userId) return room;
  if (
    permissions.includes("support:chat:join") &&
    room.supportCase?.assigneeId === userId
  ) {
    return room;
  }
  throw forbidden("chat room access denied");
}
```

- [ ] **Step 4: Apply Chat schema and verify reconnect, persisted messages and idempotency**

Run:

```powershell
docker compose exec chat-service npx prisma db push --schema prisma/schema.prisma
docker compose exec -e REQUIRE_INTEGRATION=1 chat-service node --test test/chat-auth.integration.test.js
```

Expected: restart แล้วยังอ่าน room/message เดิมได้; `clientMessageId` ซ้ำไม่สร้างแถวซ้ำ

- [ ] **Step 5: Update docs and commit `feat(cs): add participant-safe chat`**

### Task CSS-002: Support Order Lookup and Case Queue

**Files:**

- Create: `backend/services/order-service/src/features/support/supportRoutes.js`
- Create: `backend/services/order-service/src/features/support/supportService.js`
- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `frontend/app/support/cases/page.js`
- Test: `backend/services/order-service/test/support-case.integration.test.js`

**Interfaces:**

- Produces: `GET /api/orders/support/search?orderId&userId`
- Produces: `SupportCase {id, orderId, assigneeId, priority, status, reason, version}`

- [ ] **Step 1: Write failing role, assignment and bounded-search tests**
- [ ] **Step 2: Run integration test; expect `403`/route absence**
- [ ] **Step 3: Implement role-scoped projection and optimistic version update**

```js
await prisma.supportCase.updateMany({
  where: { id, version },
  data: { status, version: { increment: 1 } },
});
```

- [ ] **Step 4: Verify stale update `409`, unassigned evidence denial and search bounds**
- [ ] **Step 5: Update docs and commit `feat(cs): add support case queue`**

### Task CSS-003: Return and Simulated Refund Decision

**Files:**

- Create: `backend/services/order-service/src/features/disputes/disputeService.js`
- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `frontend/app/support/cases/[id]/page.js`
- Test: `backend/services/order-service/test/dispute-decision.integration.test.js`

**Interfaces:**

- Produces: `POST /api/orders/support/cases/:id/decision {decision, reason, version}`
- Produces: `refund.approved.v1` or `refund.rejected.v1`

- [ ] **Step 1: Write failing double-decision/evidence tests**
- [ ] **Step 2: Run targeted test; confirm decision endpoint missing**
- [ ] **Step 3: Implement one-way audited decision**

```js
const DECISIONS = ["APPROVE_SIMULATED_REFUND", "REJECT"];
```

- [ ] **Step 4: Verify required reason, one decision, Admin hold conflict and audit**
- [ ] **Step 5: Update docs and commit `feat(cs): add audited dispute decisions`**

### Task CSS-004: Extended FAQ and SLA

**Files:**

- Create: `backend/services/chat-service/src/features/help-content/`
- Create: `frontend/app/support/help-content/page.js`
- Create: `backend/services/chat-service/src/features/sla/priority.js`
- Modify: `backend/services/chat-service/prisma/schema.prisma`
- Test: `backend/services/chat-service/test/help-content.integration.test.js`
- Test: `backend/services/chat-service/src/features/sla/priority.test.js`

**Interfaces:** Produces published FAQ revisions and deterministic `calculatePriority(caseData)`

- [ ] **Step 1: Write failing publish/version/priority tests**
- [ ] **Step 2: Run tests and confirm modules absent**
- [ ] **Step 3: Implement draft→published revision and rule-based priority**

```js
function calculatePriority({ fraudRisk, minutesWaiting, refundAmount }) {
  return fraudRisk === "high" || refundAmount >= 10000
    ? "urgent"
    : minutesWaiting >= 240
      ? "high"
      : "normal";
}
```

- [ ] **Step 4: Verify unauthorized publish, overdue clock and deterministic ordering**
- [ ] **Step 5: Update docs and commit `feat(cs): add help content and SLA queue`**
