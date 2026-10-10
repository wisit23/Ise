# RE-LOOP Feature Integration Contract

## Gate 0: สัญญาที่ต้องยืนยันก่อน Parallel Implementation

### Identity context

ทุก service อ่าน identity จาก JWT ที่ตรวจแล้วและใช้ shape เดียวกัน:

```js
{
  userId: "uuid",
  roles: ["BUYER", "SELLER"],
  permissions: ["product:write", "order:read:own"]
}
```

Role ที่ระบบต้องรองรับคือ `BUYER`, `SELLER`, `CUSTOMER_SERVICE`, `ADMIN`, `MARKETING`
และ `EXECUTIVE` ห้ามเชื่อถือการซ่อนปุ่มฝั่ง Frontend เป็น authorization

### Response contracts

```js
// success list
{
  (items, page, limit, total, totalPages);
}

// error
{
  error: {
    (code, message, requestId);
  }
}
```

HTTP status ที่ใช้ร่วมกัน: `400` validation, `401` unauthenticated, `403` forbidden,
`404` not found, `409` state/idempotency conflict และ `503` dependency unavailable

### Core entity contracts

```js
// ProductSummary
{
  (id, sellerId, title, price, category, condition, size, status, media);
}

// OrderSummary
{
  (id,
    buyerId,
    sellerId,
    productId,
    productTitle,
    price,
    status,
    reservationId,
    reservationExpiresAt,
    trackingNumber,
    carrier,
    createdAt,
    updatedAt);
}

// CampaignSummary
{
  (id,
    name,
    status,
    startsAt,
    endsAt,
    discountType,
    discountValue,
    targetSegment);
}

// ExecutiveMetricPoint
{
  (period, gmv, platformRevenue, completedOrders, activeUsers);
}
```

Product states: `available → reserved → sold`; `reserved → available` เมื่อหมดเวลา/ยกเลิก

Order states:
`pending_payment → paid → awaiting_shipment → shipped → delivered → completed`
และแตกแขนงไป `cancelled` หรือ `disputed` ตาม transition ที่ Order service อนุญาต

### BUY-002 reservation contract — implemented, pending integration review

- `POST /internal/products/:id/reservations` รับ `{buyerId}` และคืน
  `{reservationId, expiresAt, product}`; ผลใหม่เป็น `201`, retry ของ Buyer เดิมเป็น `200`
- `DELETE /internal/products/:id/reservations/:reservationId` ปลดได้เฉพาะ reservation ที่ ID ตรงกัน
- `PATCH /internal/products/:id/reservations/:reservationId/complete` ขายได้เฉพาะ reservation ที่ยังไม่หมดอายุ
- Product เป็น owner ของ atomic inventory lock/expiry; Order persist `reservationId` และ
  `reservationExpiresAt` โดยไม่อ่าน Product database ข้าม service
- `pending` ยังคงอ่านได้สำหรับ legacy rows แต่ Order ใหม่เริ่มที่ `pending_payment`

Campaign states: `draft → pending_approval → approved → published → ended` หรือ `rejected`

### Chat contract — implemented, `CHAT-001`–`CHAT-005` (pending integration review)

`chat-service` เป็น Owner เดียวของข้อความทุกชนิดในระบบ เก็บใน **MongoDB** (ไม่ใช่ PostgreSQL —
ดูเหตุผลใน [`chat/decision.md`](chat/decision.md)) รายละเอียดเต็มอยู่ที่
[`chat/plan.md`](chat/plan.md); นี่คือสรุป Contract สำหรับ Feature อื่นที่จะต่อเข้ามา

**Public API** (ผ่าน Gateway `/api/chat`, ต้องมี Bearer JWT — เฉพาะ `contextType: "PRODUCT"`
สร้างได้ผ่านทางนี้):

```
POST   /api/chat/conversations                 create-or-open (PRODUCT เท่านั้น)
GET    /api/chat/conversations                  inbox ของฉัน
GET    /api/chat/conversations/:id              รายละเอียดห้อง (403 ถ้าไม่ใช่คู่สนทนา)
GET    /api/chat/conversations/:id/messages     ?before=<messageId>&limit=  (cursor, ไม่ใช่ offset)
POST   /api/chat/conversations/:id/messages     ส่งข้อความ TEXT — {body}
POST   /api/chat/conversations/:id/read         mark read
GET    /api/chat/unread-count                   {total}
```

**Internal API** (ตรงไปที่ `CHAT_SERVICE_URL`, ต้องมี `x-internal-token` — ไม่ผ่าน Gateway,
ยิงจาก Backend service เท่านั้น ไม่ใช่จาก Frontend):

```
POST   /internal/conversations                        create-or-open — contextType "ORDER"|"SUPPORT"
                                                        เท่านั้น (PRODUCT/DIRECT ยังไม่รองรับทางนี้)
                                                        body: {contextType, contextId, participants:[{userId,role}], createdBy}
                                                        → 201 ห้องใหม่ / 200 ห้องเดิม (ไม่ error ซ้ำ)
GET    /internal/conversations/by-context/:type/:id   ค้นห้องจาก orderId/ticketId
POST   /internal/conversations/:id/messages           ส่งข้อความใด ๆ (ปกติใช้ type:"SYSTEM")
                                                        ไม่เช็ค participant/LOCKED — Caller ถูกเชื่อถือ
                                                        body: {senderId, senderRole, type, body, payload}
POST   /internal/conversations/:id/participants       เพิ่มคู่สนทนา (เช่น CS agent) — idempotent
PATCH  /internal/conversations/:id/status             ACTIVE | ARCHIVED | LOCKED
GET    /internal/conversations/:id/transcript         ประวัติเต็มไม่ pagination — สำหรับหลักฐาน
```

ตัวอย่าง Consumer จริงตัวแรก: `order-service/src/services/chatClient.js` — ทุกครั้งที่ Order
เปลี่ยนสถานะเป็น `confirmed`/`shipped`/`completed`/`cancelled`, `orderController.updateStatus`
เรียก `chatClient.notifyOrderStatusChanged(order, status)` แบบ best-effort (กลืน error เอง
ไม่มีทางทำให้ Order update ล้มเพราะ chat-service ล่ม) เปิด/เปิดซ้ำห้อง `ORDER:<orderId>` แล้วส่ง
SYSTEM message เข้าไป

Event ที่ประกาศไว้ใน `shared/src/events.js` (**ยังไม่ publish จริง — รอ `CHAT-006`** ต่อ Redis
adapter): `CHAT_CONVERSATION_OPENED`, `CHAT_MESSAGE_CREATED`

**สิ่งที่ยังไม่ทำ (นอกขอบเขต `CHAT-001`–`CHAT-006`):** ไฟล์แนบ, Rate limit, Admin moderation/
`chat:read:any` permission (`CHAT-007`); ย้าย Support Ticket message มารวม (`CHAT-008`) —
`support-service`'s `TicketMessage` ยังเป็น Ticket Communication หลักของ CS จนกว่าจะทำ `CHAT-008`

### Event envelope

```js
{
  eventId: "uuid",
  eventType: "order.completed.v1",
  occurredAt: "2026-07-30T00:00:00.000Z",
  aggregateId: "order-uuid",
  payload: {}
}
```

Consumer เก็บ `eventId` ที่ประมวลผลแล้วเพื่อให้ retry ไม่สร้างผลซ้ำ

## Integration surfaces

ไฟล์ต่อไปนี้ต้องมี integration review ก่อน merge:

- `backend/gateway/src/app.js`
- `backend/shared/src/authMiddleware.js`, `events.js`, `errors.js`, `index.js`
- `backend/services/*/src/app.js`
- `backend/services/*/prisma/schema.prisma`
- `frontend/components/NavBar.js`, `frontend/lib/api.js`
- `docker-compose.yml`, `.env.example`, root `package.json`

Owner เปิด PR ขนาดเล็กสำหรับ contract/schema/router ก่อน แล้วจึง rebase Feature branch
ห้ามให้สอง Feature แก้ migration หรือ status enum เดียวกันโดยไม่มีลำดับ merge

### Refactored Swipe/ProductVideo baseline — not a frozen requirement contract

การตรวจ source หลัง pull พบ implementation ที่ใช้เป็น baseline ได้ แต่ยังห้ามนับเป็น Gate 2:

- `GET /api/products/videos/feed` เป็น public route ผ่าน Gateway และคืน paginated
  `ProductVideo` พร้อม Product relation เรียงใหม่สุดก่อน
- `POST /api/products/videos` ต้องมี token; Product service อนุญาต `SELLER`/`ADMIN`,
  ตรวจว่า Product เป็นของผู้ส่ง และ persist ใน Product PostgreSQL ผ่าน Prisma
- `/seller/videos/new` อัปโหลดไฟล์แล้วสร้างคลิป; `/swipe` เลื่อนดู feed และเปิดรายละเอียดสินค้า
- Source ยังไม่มี persisted choose/swipe direction; scrolling ไม่ใช่หลักฐานว่า `UR-11` ผ่าน
- ProductVideo implementation แยกเป็น `route -> controller -> service -> repository -> Prisma`
  และ repository filter เฉพาะ Product `available`
- Access token มี `displayName` จาก Auth database; Product service ignore `sellerName` จาก body
  และใช้ชื่อจาก verified token ลดการปลอมชื่อข้าม client
- `/swipe` เล่นเฉพาะ active video และ preload คลิปอื่นแบบ metadata เพื่อลดการ decode พร้อมกัน

จนกว่าจะนิยาม choose action/response contract และผ่าน PostgreSQL integration review ให้ Seller/Product เป็น provider, Buyer เป็น consumer และ Marketing
เป็น requirement owner/reviewer ของ `UR-11` โดยไม่มี Feature ใดอ้างว่า Swipe-to-Choose Done

## Provider/consumer ownership

| Provider              | Consumer                                      | Reviewer ที่ต้องร่วม |
| --------------------- | --------------------------------------------- | -------------------- |
| Seller/Product        | Buyer, Marketing, Admin                       | Buyer + Admin        |
| Seller/ProductVideo   | Buyer Swipe, Marketing `UR-11`                | Buyer + Marketing    |
| Buyer/Order           | Seller, Customer Service, Admin, Executive    | Seller + CS          |
| Admin/Auth-RBAC       | ทุก Feature                                   | ตัวแทนทุก Role       |
| Chat (`chat-service`) | Buyer, Seller, Customer Service, Admin, Order | Buyer + Admin        |
| Marketing/Campaign    | Buyer, Executive                              | Buyer + Executive    |
| Executive/Analytics   | ไม่มี write consumer                          | Marketing            |

## Merge gates

### Gate 1 — Core

- Provider/consumer contract tests ผ่าน
- migration apply และ recovery path ผ่าน
- permission-negative tests ของทุก staff Role ผ่าน
- Buyer → Seller → reserve → mock pay → ship → receive → review ผ่าน
- Dashboard แสดง unavailable/partial state โดยไม่ปลอมเป็นเลขศูนย์
- เอกสารหกไฟล์ของทุก Feature ตรงกับหลักฐาน

### Gate 2 — Extended

- Core ของ Feature ที่เกี่ยวข้องอยู่สถานะ Done
- Extended contract ผ่าน review ก่อน consumer implementation
- Recommendation ต้องเรียกความสามารถตามจริง ไม่ใช้คำว่า AI หากเป็น rule-based
- Auction, bulk action, export และ anomaly alert ผ่าน abuse/authorization review
