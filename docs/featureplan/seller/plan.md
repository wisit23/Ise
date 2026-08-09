# Seller Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งมอบ Seller journey ตั้งแต่ synthetic KYC, listing/media, inventory, shipping และ performance insight

**Architecture:** Auth owns seller/KYC state; Product owns listing/media/inventory; Order owns shipping transitions Seller UI เป็น consumer ของทั้งสามและไม่เขียน database ข้าม service

**Tech Stack:** Next.js, Express, Prisma, PostgreSQL, synthetic document-reference adapter,
Node/Jest tests

## Global Constraints

- Owner: เอกตระการ; Reviewer: วิศิษฏ์
- Trace: `UR-32`–`UR-39` และ Buyer `UR-03`
- KYC ใช้ synthetic content; application, document reference, status และ decision ต้อง persist
  ใน `reloop_auth` จริง ส่วน Product media persist metadata ใน `reloop_product`
- Listing ห้าม publish ก่อน KYC approved และอย่างน้อย 4 ภาพ
- ห้ามใช้ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase; encryption/PDPA hardening ทำภายหลัง
- ใช้ contracts จาก `../integration.md`

---

## Requirement Traceability

| UR      | Functional Requirement             | Active/Deferred NFR                  | Workflow                             | Task / Phase                                                 |
| ------- | ---------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------------ |
| `UR-32` | `FR-1.1.1`                         | `NFR-SC-01`, `NFR-U-02`              | `WF-02`                              | `SEL-002` + Buyer `BUY-001` / Core                           |
| `UR-33` | `FR-1.3.1`, `FR-1.3.2`             | `NFR-SC-01`                          | `WF-02`                              | `SEL-002` / Core                                             |
| `UR-34` | `FR-2.2.1`, `FR-2.2.3`             | `NFR-P-02`                           | `WF-06`                              | `SEL-005` / Extended                                         |
| `UR-35` | `FR-1.3.3`, `FR-1.3.4`             | `NFR-P-03`                           | `WF-05`                              | `SEL-003` / Core                                             |
| `UR-36` | `FR-1.4.2`, `FR-1.4.3`, `FR-1.4.4` | `NFR-P-01`, `NFR-SC-02`, `NFR-AR-04` | `WF-03`                              | `SEL-004` + Buyer `BUY-005` / Core + Extended                |
| `UR-37` | `FR-2.1.1`, `FR-2.1.2`, `FR-4.2.1` | `NFR-SP-02` (Security Phase)         | `WF-01`, `WF-07`                     | `SEL-001`, `SEL-004`, Buyer `BUY-004` / Core                 |
| `UR-38` | `FR-1.4.5`, `FR-1.4.6`             | `NFR-AR-03`, `NFR-AR-04`             | `WF-02`                              | `SEL-005` / Extended                                         |
| `UR-39` | `FR-1.3.5`, `FR-4.2.6`, `FR-5.2.5` | `NFR-M-03`                           | ไม่มี Workflow ประมูลเฉพาะใน Req Doc | `SEL-005` + Admin `ADM-005` + Marketing `MKT-005` / Extended |

### PostgreSQL acceptance for Seller

- `SEL-001`: KYC application/resubmission/decision status is read back from `reloop_auth`
- `SEL-002`: listing, four image rows, ordering and edit rules are verified in `reloop_product`
- `SEL-003`: inventory/shipping actions persist in Product/Order owner databases
- `SEL-004`: insight aggregates are calculated from persisted view/wishlist/order facts
- `SEL-005`: quick replies, comparable-sale evidence and auction submission persist in owner databases
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task SEL-001: Synthetic KYC Submission

**Files:**

- Create: `backend/services/auth-service/src/features/kyc/kycRoutes.js`
- Create: `backend/services/auth-service/src/features/kyc/kycService.js`
- Create: `backend/services/auth-service/src/features/kyc/syntheticDocumentStore.js`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Create: `frontend/app/seller/verification/page.js`
- Test: `backend/services/auth-service/test/kyc.integration.test.js`

**Interfaces:**

- Produces: `POST /api/auth/seller/kyc` multipart synthetic file + acknowledgement
- Produces: `GET /api/auth/seller/kyc` → `{status, submittedAt, decisionReason}`
- Consumes: Admin decision contract from `ADM-002`

- [ ] **Step 1: Write failing PostgreSQL persistence and resubmission tests**

```js
assert.equal((await submitKyc(sellerToken, fakePdf)).status, 201);
assert.equal(
  (await prisma.kycApplication.findUnique({ where: { sellerId } })).status,
  "PENDING",
);
assert.equal((await submitKyc(sellerToken, fakePdf)).status, 409);
```

- [ ] **Step 2: Run integration test and confirm routes/storage adapter missing**
- [ ] **Step 3: Implement persisted `KycApplication` and synthetic document reference**

```js
await prisma.kycApplication.create({
  data: {
    sellerId,
    documentRef: syntheticDocumentStore.put(fakePdf),
    status: "PENDING",
  },
});
```

- [ ] **Step 4: Apply Auth schema and verify type/size, persisted status, resubmission and cleanup**

Run:

```powershell
docker compose exec auth-service npx prisma db push --schema prisma/schema.prisma
docker compose exec -e REQUIRE_INTEGRATION=1 auth-service node --test test/kyc.integration.test.js
```

Expected: test creates and reads a real `KycApplication` row, rejects duplicate pending submission
and deletes only its synthetic fixture during cleanup

- [ ] **Step 5: Update Seller docs and commit `feat(seller): persist synthetic KYC submission`**

### Task SEL-002: Listing and Media Workspace

**Files:**

- Create: `backend/services/product-service/src/features/listings/listingService.js`
- Modify: `backend/services/product-service/src/controllers/productController.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `frontend/app/sell/page.js`
- Modify: `frontend/components/MediaUploader.js`
- Test: `backend/services/product-service/test/product-crud.integration.test.js`

**Interfaces:**

- Produces: Product fields `brand`, `styleTags`, four-or-more image media
- Produces: `createListing({seller, input})`, `updateListing({sellerId, productId, patch})`

- [ ] **Step 1: Add failing tests for KYC, 4 images, ownership and immutable reserved listing**
- [ ] **Step 2: Run Product integration test and confirm failures**
- [ ] **Step 3: Implement validated listing service**

```js
if (seller.kycStatus !== "VERIFIED")
  throw forbidden("seller verification required");
if (input.media.filter((m) => m.type === "image").length < 4) {
  throw badRequest("at least four product images are required");
}
```

- [ ] **Step 4: Verify create/edit/media ordering, published listing appears in public feed without follower rules, and reserved/sold edit denial**
- [ ] **Step 5: Update docs and commit `feat(seller): harden listing workspace`**

### Task SEL-003: Inventory and Shipping Actions

**Files:**

- Create: `frontend/app/seller/inventory/page.js`
- Modify: `frontend/app/seller/dashboard/page.js`
- Modify: `backend/services/product-service/src/features/listings/listingService.js`
- Test: `frontend/app/seller/inventory/inventory.test.js`

**Interfaces:**

- Consumes: Buyer `PATCH /api/orders/:id/transitions`
- Produces: Seller actions `pause`, `publish`, `mark_sold`; cannot override reservation/order

- [ ] **Step 1: Write failing permission/state tests for pause/publish/ship**
- [ ] **Step 2: Run targeted backend/Jest tests and confirm missing workflow**
- [ ] **Step 3: Implement owner-only inventory actions and Seller shipment form**

```js
await apiFetch(`/api/orders/${orderId}/transitions`, {
  method: "PATCH",
  token,
  body: { nextStatus: "shipped", carrier, trackingNumber },
});
```

- [ ] **Step 4: Verify Buyer cannot ship, Seller cannot ship another order, sold stays hidden**
- [ ] **Step 5: Update docs and commit `feat(seller): add inventory and shipping actions`**

### Task SEL-004: Server-Side Seller Insights

**Files:**

- Create: `backend/services/product-service/src/features/insights/insightRoutes.js`
- Create: `backend/services/order-service/src/features/metrics/sellerMetrics.js`
- Modify: `frontend/app/seller/dashboard/page.js`
- Test: `backend/services/order-service/test/seller-metrics.integration.test.js`

**Interfaces:**

- Produces: `{views, wishlistCount, chatStarts, completedSales, revenue, dailySeries}`
- Consumes: Product view/wishlist and Order completed aggregates

- [ ] **Step 1: Write failing aggregate tests with known fixtures**
- [ ] **Step 2: Run integration test; confirm current client-side calculation is insufficient**
- [ ] **Step 3: Implement owner-scoped aggregate endpoints with date bounds**

```js
function mergeSellerMetrics(productMetrics, orderMetrics) {
  return {
    views: productMetrics.views,
    wishlistCount: productMetrics.wishlistCount,
    chatStarts: productMetrics.chatStarts,
    completedSales: orderMetrics.completedSales,
    revenue: orderMetrics.revenue,
    dailySeries: orderMetrics.dailySeries,
  };
}
```

- [ ] **Step 4: Verify cross-seller denial, empty series and timezone boundary**
- [ ] **Step 5: Update docs and commit `feat(seller): serve verified seller insights`**

### Task SEL-005: Extended Seller Tools

**Refactored source baseline (partial evidence, not acceptance):** ProductVideo แยกเป็น
route/controller/service/repository, feed query ใช้ Product `available`, ชื่อผู้ขายมาจาก signed
JWT และ client-supplied `sellerName` ถูก ignore แล้ว แต่ยังไม่มี PostgreSQL integration run,
schema apply หรือ contract review ของ `UR-11`

**Files:**

- Create: `backend/services/chat-service/src/features/quick-replies/`
- Create: `backend/services/product-service/src/features/pricing/priceStrategy.js`
- Create: `frontend/app/seller/auctions/page.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Create: `backend/services/product-service/src/features/product-videos/`
- Modify: `backend/services/product-service/src/routes/productRoutes.js`
- Modify: `backend/services/auth-service/src/services/authService.js`
- Modify: `backend/shared/src/authMiddleware.js`
- Modify: `frontend/app/seller/videos/new/page.js`
- Modify: `frontend/components/VideoUploader.js`
- Test: `backend/services/product-service/src/features/pricing/priceStrategy.test.js`
- Test: `backend/services/product-service/test/product-crud.integration.test.js`
- Test: `backend/services/product-service/src/features/product-videos/productVideoService.test.js`
- Test: `backend/services/product-service/src/features/product-videos/productVideoRepository.test.js`

**Interfaces:**

- Produces: `PriceStrategy.recommend({brand, condition, completedComparables})`
- Provides: Seller/Product video upload/feed contract for Marketing `MKT-005` and Buyer `BUY-005`
- Consumes: Marketing auction event and Admin auction approval contracts

- [ ] **Step 1: Write failing quick-reply, deterministic price and ProductVideo provider contract tests**
- [ ] **Step 2: Run targeted tests; confirm missing modules and record pulled ProductVideo baseline gaps**
- [ ] **Step 3: Implement rule-based price range with evidence count**

```js
const prices = completedComparables
  .map(({ price }) => Number(price))
  .sort((a, b) => a - b);
const middle = Math.floor(prices.length / 2);
return {
  min: prices[0],
  median:
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle],
  max: prices.at(-1),
  comparableCount: prices.length,
  method: "completed-sales-median",
};
```

- [ ] **Step 4: Verify sparse-data fallback, cross-seller denial, allowed feed Product states, trusted seller identity and auction lock**
- [ ] **Step 5: Update docs and commit `feat(seller): add extended seller tools`**
