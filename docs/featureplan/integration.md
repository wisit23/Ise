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

Campaign states: `draft → pending_approval → approved → published → ended` หรือ `rejected`

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

## Provider/consumer ownership

| Provider              | Consumer                                   | Reviewer ที่ต้องร่วม |
| --------------------- | ------------------------------------------ | -------------------- |
| Seller/Product        | Buyer, Marketing, Admin                    | Buyer + Admin        |
| Buyer/Order           | Seller, Customer Service, Admin, Executive | Seller + CS          |
| Admin/Auth-RBAC       | ทุก Feature                                | ตัวแทนทุก Role       |
| Customer Service/Chat | Buyer, Seller, Admin                       | Buyer + Admin        |
| Marketing/Campaign    | Buyer, Executive                           | Buyer + Executive    |
| Executive/Analytics   | ไม่มี write consumer                       | Marketing            |

## Merge gates

### Gate 1 — Core

- Provider/consumer contract tests ผ่าน
- migration apply และ recovery path ผ่าน
- permission-negative tests ของทุก staff Role ผ่าน
- Buyer → Seller → reserve → mock pay → ship → receive → review ผ่าน
- Dashboard แสดง unavailable/partial state โดยไม่ปลอมเป็นเลขศูนย์
- เอกสารสี่ไฟล์ของทุก Feature ตรงกับหลักฐาน

### Gate 2 — Extended

- Core ของ Feature ที่เกี่ยวข้องอยู่สถานะ Done
- Extended contract ผ่าน review ก่อน consumer implementation
- Recommendation ต้องเรียกความสามารถตามจริง ไม่ใช้คำว่า AI หากเป็น rule-based
- Auction, bulk action, export และ anomaly alert ผ่าน abuse/authorization review
