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
- Produces: `GET /api/products/search?q&category&style&brand&size&condition&minPrice&maxPrice&page&limit`

- [x] **Step 1: Write failing query contract test**

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

- [ ] **Step 2: Run `node --test backend/services/product-service/src/features/catalog/catalog.contract.test.js`**

Expected: FAIL เพราะ query builder/fields ยังไม่รองรับครบ

- [x] **Step 3: Implement one query builder and Buyer controls**

```js
function buildCatalogWhere({
  q,
  category,
  brand,
  size,
  condition,
  minPrice,
  maxPrice,
}) {
  return {
    status: "available",
    ...(category && { category }),
    ...(brand && { brand }),
    ...(size && { size }),
    ...(condition && { condition }),
    ...((minPrice || maxPrice) && {
      price: {
        ...(minPrice && { gte: Number(minPrice) }),
        ...(maxPrice && { lte: Number(maxPrice) }),
      },
    }),
    ...(q && {
      OR: ["title", "description", "category", "brand"].map((field) => ({
        [field]: { contains: q, mode: "insensitive" },
      })),
    }),
  };
}
```

- [x] **Step 4: Apply Product schema and run real-database/Jest tests, then lint**

Run:

```powershell
docker compose exec product-service npx prisma db push --schema prisma/schema.prisma
docker compose exec -e REQUIRE_INTEGRATION=1 product-service node --test test/catalog.integration.test.js
npm --workspace frontend test -- products.test.js
npm run lint
```

Expected: filter combinations, empty result, invalid range and pagination pass

- [ ] **Step 5: Update Buyer docs and commit**

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
const updated = await tx.product.updateMany({
  where: { id: productId, status: "available" },
  data: {
    status: "reserved",
    reservedBy: buyerId,
    reservationExpiresAt: expiresAt,
  },
});
if (updated.count !== 1) throw conflict("product is already reserved");
```

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

- Modify: `backend/services/review-service/src/controllers/reviewController.js`
- Modify: `frontend/app/products/[id]/page.js`
- Modify: `frontend/app/store/[sellerId]/page.js`
- Modify: `frontend/app/orders/page.js`
- Test: `backend/services/review-service/test/review-crud.integration.test.js`
- Test: `frontend/app/products/[id]/product-detail.test.js`

**Interfaces:**

- Consumes: CS `POST /api/chat/rooms` body `{sellerId, productId}`
- Consumes: Review summary `{total, averageRating}`
- Produces: one review per completed Order

- [ ] **Step 1: Add failing tests for non-party review and Contact Seller**
- [ ] **Step 2: Run Review integration and Product detail Jest tests; confirm failures**
- [ ] **Step 3: Enforce Order participant/status server-side and create-or-open chat room**

```js
await apiFetch("/api/chat/rooms", {
  method: "POST",
  token,
  body: { sellerId: product.sellerId, productId: product.id },
});
```

- [ ] **Step 4: Run tests; verify duplicate review `409`, forged buyer `403`, guest redirects**
- [ ] **Step 5: Update docs and commit `feat(buyer): complete trust and contact journey`**

### Task BUY-005: Extended Discovery

**Refactored source baseline (partial evidence, not acceptance):** `frontend/app/swipe/page.js`
เรียก public `GET /api/products/videos/feed`, มี empty/error/product-link tests และเล่นเฉพาะ
คลิปที่ active เพื่อลดงาน browser แต่ยังไม่มี persisted choose/swipe action หรือหลักฐานว่า
ผ่าน `UR-11`

**Files:**

- Create: `backend/services/product-service/src/features/wishlist/`
- Create: `backend/services/product-service/src/features/recommendations/`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Create: `frontend/app/style-profile/page.js`
- Create: `frontend/app/wishlist/page.js`
- Modify: `frontend/app/page.js`
- Modify: `frontend/app/swipe/page.js`
- Create: `frontend/components/swipe/SwipeFeedViewer.js`
- Create: `frontend/components/swipe/SwipeVideoCard.js`
- Test: `backend/services/product-service/src/features/recommendations/recommendation.test.js`
- Test: `frontend/app/swipe/page.test.js`

**Interfaces:**

- Produces: `RecommendationStrategy.rank({userId, candidates, limit})`
- Consumes: Seller/Product `GET /api/products/videos/feed` under Marketing `MKT-005` requirement acceptance

- [ ] **Step 1: Write failing deterministic ranking, wishlist ownership and `/swipe` consumer-state tests**
- [ ] **Step 2: Run targeted tests; confirm recommendation/wishlist modules are missing and pulled Swipe UI is feed-only**
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
