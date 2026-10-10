# Buyer Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งมอบ Buyer journey ตั้งแต่ค้นหา ล็อกสินค้า ชำระเงินจำลอง ติดตาม ไปจนถึงรีวิว/ติดต่อผู้ขาย

**Architecture:** Buyer UI ใช้ Gateway; Product เป็น provider ของ catalog/reservation และ Order เป็น owner ของ transaction state การจองต้องใช้ compare-and-set ที่ Product แล้วมี release/reconciliation หาก Order write ล้มเหลว

**Tech Stack:** Next.js 15, React 18, Express, Prisma, PostgreSQL, Node test runner, Jest

## Global Constraints

- Owner: วิศิษฏ์; Reviewer: เอกตระการ
- Trace: `UR-01`–`UR-07`, `UC-01`–`UC-05`
- ใช้ contracts จาก `../integration.md`; ห้ามอ่าน Product/Order database ข้าม service
- Mock payment เท่านั้น; ห้ามรับ card/bank fields
- Product reservation, Order, Mock Payment attempt, style profile และ wishlist ต้อง persist
  ผ่าน Prisma ใน PostgreSQL จริง ห้ามใช้ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase; รอบนี้คงเฉพาะ functional
  ownership/role checks ที่จำเป็นต่อ Buyer flow
- ทุก Task อัปเดต `progress.md`, append `changelog.md`, เพิ่มบทเรียนใน `teachme.md`

## Current Delivery Status (2026-09-07)

| Task      | Status           | Note                                                                                                        |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `BUY-001` | Verified locally | Catalog filters + hybrid search ผ่าน forced PostgreSQL acceptance                                           |
| `BUY-002` | Verified locally | Atomic 10-minute reservation/Cart ผ่าน PostgreSQL concurrency and recovery evidence                         |
| `BUY-003` | Not complete     | ยังไม่มี explicit state table, `PaymentAttempt` และ deterministic/idempotent Mock Payment                   |
| `BUY-004` | Partial          | Review/list/summary/media มีแล้ว; Contact Seller และ forced cross-service acceptance ยังขาด                 |
| `BUY-005` | Partial          | Swipe feed/choose/navigation มีแล้ว; direct choose acceptance, wishlist/style profile/recommendation ยังขาด |

---

## Requirement Traceability

| UR      | Functional Requirement             | Active/Deferred NFR                                   | Workflow | Task / Phase                                         |
| ------- | ---------------------------------- | ----------------------------------------------------- | -------- | ---------------------------------------------------- |
| `UR-01` | `FR-1.1.2`, `FR-1.1.3`, `FR-1.1.4` | `NFR-P-01`, `NFR-P-03`, `NFR-SC-01`                   | `WF-03`  | `BUY-005` / Extended                                 |
| `UR-02` | `FR-1.2.1`                         | `NFR-P-01`, `NFR-SC-02`, `NFR-U-03`                   | `WF-03`  | `BUY-001` / Core                                     |
| `UR-03` | `FR-1.3.1`                         | `NFR-P-05`                                            | `WF-02`  | Seller `SEL-002` provider, `BUY-001` consumer / Core |
| `UR-04` | `FR-2.1.1`, `FR-2.1.2`             | ไม่มี NFR เฉพาะ                                       | `WF-07`  | `BUY-004` / Core                                     |
| `UR-05` | `FR-2.2.1`, `FR-2.2.2`             | `NFR-P-02` shared Chat target                         | `WF-06`  | `BUY-004` + CS `CSS-001` / Core                      |
| `UR-06` | `FR-1.4.1`                         | `NFR-AR-01`, `NFR-AR-02`                              | `WF-04`  | `BUY-002` / Core                                     |
| `UR-07` | `FR-3.1.1`                         | `NFR-P-04`, `NFR-AR-03`; `NFR-CP-01` (Security Phase) | `WF-05`  | `BUY-003` / Core                                     |

### PostgreSQL acceptance for Buyer

- `BUY-001`: query filter results from `reloop_product`; no hardcoded catalog is accepted
- `BUY-002`: two-buyer concurrency, expiry and compensation read state back from
  `reloop_product` and `reloop_order`
- `BUY-003`: Mock Payment attempt and every Order transition survive process restart in
  `reloop_order`
- `BUY-004`: review uniqueness is enforced by persisted Order/Review data
- `BUY-005`: style profile and wishlist ownership persist in service-owner databases
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task BUY-001: Catalog Search and Filters

**Files:**

- Create: `backend/services/product-service/src/features/catalog/catalogQuery.js`
- Create: `backend/services/product-service/src/features/catalog/catalog.contract.test.js`
- Modify: `backend/services/product-service/src/controllers/productController.js`
- Modify: `backend/services/product-service/src/models/productModel.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `frontend/app/products/page.js`
- Test: `backend/services/product-service/test/catalog.integration.test.js`
- Test: `frontend/app/products/products.test.js`

**Interfaces:**

- Consumes: Seller `ProductSummary` with `brand`, `size`, `condition`, `price`, `styleTags`
- Produces: `GET /api/products/search?q&category&brand&size&condition&minPrice&maxPrice&page&limit`

- [ ] **Step 1: Write failing query contract test**

```js
test("search combines price, size and condition filters", async () => {
  const res = await request(app).get(
    "/search?minPrice=500&maxPrice=1500&size=M&condition=Good",
  );
  assert.equal(res.status, 200);
  assert.ok(
    res.body.items.every(
      (p) =>
        p.price >= 500 &&
        p.price <= 1500 &&
        p.size === "M" &&
        p.condition === "Good",
    ),
  );
});
```

- [x] **Step 2: Run `node --test backend/services/product-service/src/features/catalog/catalog.contract.test.js`**

Historical red phase: test เคย FAIL ก่อน query builder/fields รองรับครบ; current contract tests ผ่านแล้ว

- [ ] **Step 3: Implement one query builder and Buyer controls**

```js
function buildCatalogWhere(filters, { PrismaClient }) {
  const clauses = [PrismaClient.sql`status = ${filters.status}`];
  if (filters.style)
    clauses.push(PrismaClient.sql`AND ${filters.style} = ANY(tags)`);
  if (filters.minPrice !== undefined)
    clauses.push(PrismaClient.sql`AND price >= ${filters.minPrice}`);
  if (filters.q)
    clauses.push(
      PrismaClient.sql`AND (search_text ILIKE '%' || ${filters.q} || '%' OR ${filters.q} <% search_text)`,
    );
  return PrismaClient.join(clauses, " ");
}
```

Source จริงเพิ่ม equality clauses สำหรับ category/brand/size/condition และ max price ด้วย; ranked
query ใช้ `search_vector`/Trigram ใน `productModel` โดย reuse predicate เดียวกันแทน Prisma `contains`.

- [x] **Step 4: Apply Product schema and run real-database/Jest tests, then lint**

Run:

```powershell
docker compose exec product-service npx prisma db push --schema prisma/schema.prisma
docker compose exec -e REQUIRE_INTEGRATION=1 product-service node --test test/catalog.integration.test.js
npm --workspace frontend test -- products.test.js
npm run lint
```

Expected: filter combinations, empty result, invalid range and pagination pass

- [x] **Step 5: Update Buyer docs and commit**

```powershell
git add backend/services/product-service/src/features/catalog frontend/app/products docs/featureplan/buyer
git commit -m "feat(buyer): add catalog filters"
```

### Task BUY-002: Atomic 10-Minute Reservation and Cart

**Files:**

- Create: `backend/services/product-service/src/features/reservations/reservationRoutes.js`
- Create: `backend/services/product-service/src/features/reservations/reservationService.js`
- Create: `backend/services/order-service/src/features/checkout/checkoutService.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `backend/services/order-service/prisma/schema.prisma`
- Modify: `frontend/app/cart/page.js`
- Test: `backend/services/order-service/test/reservation-concurrency.integration.test.js`

**Interfaces:**

- Produces: `POST /internal/products/:id/reservations` → `{reservationId, expiresAt}`
- Produces: `DELETE /internal/products/:id/reservations/:reservationId`
- Produces: Order fields `reservationId`, `reservationExpiresAt`, status `pending_payment`

- [x] **Step 1: Write failing 2-buyer concurrency test**

```js
const attempts = await Promise.all([
  reserve(productId, "buyer-a"),
  reserve(productId, "buyer-b"),
]);
assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
```

- [x] **Step 2: Run the integration test with PostgreSQL**

Run: `$env:REQUIRE_INTEGRATION='1'; node --test backend/services/order-service/test/reservation-concurrency.integration.test.js`

Expected: FAIL เพราะ Product ยัง update status แบบไม่ compare-and-set และไม่มี expiry

- [x] **Step 3: Implement compare-and-set and compensation**

```js
const claimed = await prisma.product.updateMany({
  where: {
    id: productId,
    OR: [
      { status: "available" },
      { status: "reserved", reservationExpiresAt: { lte: now } },
    ],
  },
  data: {
    status: "reserved",
    reservationId,
    reservedBy: buyerId,
    reservationExpiresAt: expiresAt,
  },
});
if (claimed.count !== 1) throw conflict("product is already reserved");
```

Release/confirm ต้องใช้ `where: { id, status: "reserved", reservationId }` เพื่อไม่ให้ request เก่า
เปลี่ยน reservation รอบใหม่.

`checkoutService.reserve()` ต้อง release reservation เดิมเมื่อสร้าง Order ไม่สำเร็จ และ worker
ต้องคืน `available` เฉพาะ reservation ที่ expiry ตรงกันเพื่อไม่ปลด lock ใหม่

- [x] **Step 4: Verify concurrency, expiry and compensation**

Expected: ผู้ชนะหนึ่งคน; restart แล้ว expiry ยังทำงาน; retry ไม่สร้าง Order ซ้ำ

Verified 2026-08-10: PostgreSQL integration ได้ `201/409` สำหรับ Buyer สองคน, retry คืน Order เดิม,
stale release ไม่ปลด reservation ใหม่ และ Product Service process ที่เริ่มใหม่ sweep reservation
หมดอายุได้ ส่วน compensation เมื่อ Order write ล้มเหลวผ่าน targeted unit test

- [x] **Step 5: Update docs and commit**

```powershell
git add backend/services/product-service backend/services/order-service frontend/app/cart docs/featureplan/buyer
git commit -m "Reservation (10 Minute) & Cart"
```

### Task BUY-003: Mock Checkout and Fulfillment Tracking

**Files:**

- Create: `backend/services/order-service/src/features/orders/orderState.js`
- Create: `backend/services/order-service/src/features/payments/mockPaymentService.js`
- Modify: `backend/services/order-service/src/controllers/orderController.js`
- Modify: `backend/services/order-service/prisma/schema.prisma`
- Modify: `frontend/app/orders/page.js`
- Test: `backend/services/order-service/src/order-state.test.js`
- Test: `backend/services/order-service/test/mock-payment.integration.test.js`

**Interfaces:**

- Produces: `transitionOrder({ order, actor, nextStatus })`
- Produces: `PATCH /api/orders/:id/transitions` body `{nextStatus, trackingNumber?, carrier?}`
- Produces: persisted `PaymentAttempt {id, orderId, idempotencyKey, result, createdAt}`

**Current baseline (2026-09-07):** Order API/UI มี `PATCH /:id/status` และ `PATCH /:id/pay` เดิม
แต่ยังไม่มี explicit actor/state table, `PaymentAttempt`, idempotency key หรือ restart acceptance;
จึงห้ามนับ route ที่มีอยู่เป็น `BUY-003` completion.

- [ ] **Step 1: Write failing state/actor table tests**

```js
assert.equal(canTransition("pending_payment", "BUYER", "paid"), true);
assert.equal(canTransition("paid", "BUYER", "shipped"), false);
assert.equal(canTransition("awaiting_shipment", "SELLER", "shipped"), true);
```

- [ ] **Step 2: Run `node --test backend/services/order-service/src/order-state.test.js`**

Expected: FAIL เพราะยังใช้ arbitrary `PATCH /:id/status`

Run real-database test separately:

```powershell
docker compose exec -e REQUIRE_INTEGRATION=1 order-service node --test test/mock-payment.integration.test.js
```

Expected: FAIL เพราะยังไม่มี `PaymentAttempt` table และ Mock Payment service

- [ ] **Step 3: Implement explicit state table and deterministic mock payment**

```js
const TRANSITIONS = {
  pending_payment: { BUYER: ["paid", "cancelled"] },
  paid: { SYSTEM: ["awaiting_shipment"] },
  awaiting_shipment: { SELLER: ["shipped"] },
  shipped: { BUYER: ["delivered"] },
  delivered: { BUYER: ["completed", "disputed"] },
};
```

`mockPaymentService.pay()` ต้องสร้าง `PaymentAttempt` และ transition Order ใน Prisma
transaction เดียวกัน การเรียกซ้ำด้วย `idempotencyKey` เดิมต้องคืนผลเดิมโดยไม่สร้างแถวซ้ำ

- [ ] **Step 4: Verify persisted Mock Payment, forbidden transitions, restart and four Buyer tabs**

Expected: API returns `403/409`; UI maps `pending_payment`, `awaiting_shipment`, `shipped`,
`completed` without client-only mutation; process restart แล้วยังอ่าน Order/PaymentAttempt เดิมได้

- [ ] **Step 5: Update docs and commit**

```powershell
git add backend/services/order-service frontend/app/orders docs/featureplan/buyer
git commit -m "feat(buyer): add explicit order tracking states"
```

### Task BUY-004: Seller Trust, Review and Contact Entry

**Files:**

- Modify: `backend/services/review-service/prisma/schema.prisma`
- Modify: `backend/services/review-service/src/controllers/reviewController.js`
- Modify: `backend/services/review-service/src/models/reviewModel.js`
- Create: `backend/services/review-service/src/{routes,middleware,controllers}/upload*`
- Modify: `backend/gateway/src/app.js`, `docker-compose.yml`
- Modify: `frontend/app/products/[id]/page.js`
- Modify: `frontend/app/store/[sellerId]/page.js`
- Modify: `frontend/app/orders/page.js`
- Create: `frontend/components/ReviewMediaUploader.js`
- Create: `frontend/components/ReviewMediaGallery.js`
- Test: `backend/services/review-service/test/review-crud.integration.test.js`
- Test: `backend/services/review-service/src/reviewMedia.test.js`
- Test: `backend/services/review-service/src/reviewUpload.test.js`
- Test: `frontend/components/ReviewMediaUploader.test.js`
- Test: `frontend/components/ReviewMediaGallery.test.js`

**Interfaces:**

- Consumes: Order lookup เพื่อยืนยัน `buyerId`, `sellerId`, `productId` และ `completed`
- Consumes: CS `POST /api/chat/rooms` body `{sellerId, productId}` — ยังไม่มี Buyer entry ใน source
- Consumes: Review summary `{total, averageRating}` และ paginated seller review list
- Produces: one review per completed Order พร้อม ordered image/video media
- Produces: `POST /api/reviews/uploads` และ public `/review-uploads/*`

**Current partial implementation (2026-09-07):**

- Orders page สร้างรีวิวและอ่าน review history; review-service ตรวจ Order owner/status และ `orderId` unique
- Product detail/Storefront แสดง aggregate และรายการรีวิวแบบแบ่งหน้า
- `ReviewPhoto`/`ReviewVideo`, uploader และ gallery/lightbox มีแล้ว; storage ใหม่อยู่ใน review-service
- ยังไม่มี Contact Seller/create-or-open chat entry, forced cross-service review-create acceptance,
  duplicate/forged-buyer HTTP test และ restart read-back จึงยังไม่ปิด `BUY-004`

- [x] **Step 1: Implement Review schema/list/summary/order-eligibility and Buyer/Product/Store UI baseline**
- [x] **Step 2: Implement ordered image/video metadata, uploader/gallery and review-owned file storage**
- [ ] **Step 3: Run forced PostgreSQL + cross-service create tests for completed order, forged buyer `403`, duplicate `409`, media persistence and restart read-back**
- [ ] **Step 4: Implement and test Contact Seller/create-or-open chat with guest redirect**

```js
await apiFetch("/api/chat/rooms", {
  method: "POST",
  token,
  body: { sellerId: product.sellerId, productId: product.id },
});
```

- [ ] **Step 5: Reconcile the 5-vs-8 media limit, update docs, obtain Reviewer acceptance and commit `feat(buyer): complete trust and contact journey`**

### Task BUY-005: Extended Discovery

**Current source baseline (partial evidence, not acceptance; updated 2026-09-07):**
`frontend/app/swipe/page.js` เรียก public `GET /api/products/videos/feed`, มี empty/error/product-link
states และเล่นเฉพาะ active clip. `SwipeChoice` กับ `POST /api/products/videos/:id/choose` persist
bookmark แบบ idempotent ตาม `MKT-DEC-006`; viewer รองรับ touch/keyboard navigation แล้ว แต่ยังไม่มี
specific choose contract/PostgreSQL acceptance, Buyer-only role enforcement หรือ chosen-state read-back หลัง reload. Wishlist, style profile และ recommendation modules ยังไม่มี

**Files:**

- Create: `backend/services/product-service/src/features/wishlist/` — planned
- Create: `backend/services/product-service/src/features/recommendations/` — planned
- Modify: `backend/services/auth-service/prisma/schema.prisma` — planned style profile
- Existing: `backend/services/product-service/src/features/product-videos/`
- Existing: `backend/services/product-service/prisma/schema.prisma` (`SwipeChoice`)
- Create: `frontend/app/style-profile/page.js` — planned
- Create: `frontend/app/wishlist/page.js` — planned
- Modify: `frontend/app/page.js` — planned recommendation surface
- Modify: `frontend/app/swipe/page.js`
- Create: `frontend/components/swipe/SwipeFeedViewer.js`
- Create: `frontend/components/swipe/SwipeVideoCard.js`
- Test: `backend/services/product-service/src/features/recommendations/recommendation.test.js` — planned
- Test: `frontend/app/swipe/page.test.js`
- Test: `frontend/components/swipe/SwipeFeedViewer.test.js`
- Missing: choose service/API/PostgreSQL tests, Buyer-only role enforcement และ chosen-state read-back

**Interfaces:**

- Produces: `RecommendationStrategy.rank({userId, candidates, limit})` — planned, not implemented
- Consumes: Seller/Product `GET /api/products/videos/feed` under Marketing `MKT-005` requirement acceptance
- Produces: `POST /api/products/videos/:id/choose` → one `SwipeChoice` per user/card (implemented; acceptance pending)

- [ ] **Step 1: Write failing deterministic ranking, wishlist ownership and `/swipe` consumer-state tests**
- [ ] **Step 2: Run targeted tests; confirm recommendation/wishlist modules are missing and persisted choose lacks direct contract/PostgreSQL acceptance**
- [ ] **Step 3: Persist Buyer style profile and implement rule-based strategy plus labelled fallback; do not call it AI**

```js
class RecommendationStrategy {
  async rank({ userId, candidates, limit }) {
    return candidates.slice(0, limit);
  }
}
```

- [ ] **Step 4: Verify cold start, deleted product, cross-user wishlist, feed empty/error states and contract fallback**
- [ ] **Step 5: Update docs and commit `feat(buyer): add extended discovery`**
