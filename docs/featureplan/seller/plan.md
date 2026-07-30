# Seller Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งมอบ Seller journey ตั้งแต่ synthetic KYC, listing/media, inventory, shipping และ performance insight

**Architecture:** Auth owns seller/KYC state; Product owns listing/media/inventory; Order owns shipping transitions Seller UI เป็น consumer ของทั้งสามและไม่เขียน database ข้าม service

**Tech Stack:** Next.js, Express, Prisma, PostgreSQL, private object-storage adapter, Node/Jest tests

## Global Constraints

- Owner: เอกตระการ; Reviewer: วิศิษฏ์
- Trace: `UR-32`–`UR-39` และ Buyer `UR-03`
- KYC ใช้ synthetic data/private storage; Product media เป็น public
- Listing ห้าม publish ก่อน KYC approved และอย่างน้อย 4 ภาพ
- ใช้ contracts จาก `../integration.md`

---

## Requirement Traceability

| Requirement                             | Task                                  |
| --------------------------------------- | ------------------------------------- |
| `UR-32` visibility without followers    | `SEL-002` + Buyer `BUY-001`           |
| `UR-33` create/edit listing             | `SEL-002`                             |
| `UR-34` quick replies                   | `SEL-005`                             |
| `UR-35` sold/inventory status           | `SEL-003`                             |
| `UR-36` listing views                   | `SEL-004`                             |
| `UR-37` verification/review/sales trust | `SEL-001`, `SEL-004`, Buyer `BUY-004` |
| `UR-38` price recommendation            | `SEL-005`                             |
| `UR-39` auction submission              | `SEL-005`, Marketing `MKT-005`        |

### Task SEL-001: Synthetic KYC Submission

**Files:**

- Create: `backend/services/auth-service/src/features/kyc/kycRoutes.js`
- Create: `backend/services/auth-service/src/features/kyc/kycService.js`
- Create: `backend/shared/src/storage/objectStorage.js`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Create: `frontend/app/seller/verification/page.js`
- Test: `backend/services/auth-service/test/kyc.integration.test.js`

**Interfaces:**

- Produces: `POST /api/auth/seller/kyc` multipart synthetic file + consent
- Produces: `GET /api/auth/seller/kyc` → `{status, submittedAt, decisionReason}`
- Consumes: Admin decision contract from `ADM-002`

- [ ] **Step 1: Write failing private-object and resubmission tests**

```js
assert.equal((await submitKyc(sellerToken, fakePdf)).status, 201);
assert.equal((await publicGet(returned.objectKey)).status, 404);
assert.equal((await submitKyc(sellerToken, fakePdf)).status, 409);
```

- [ ] **Step 2: Run integration test and confirm routes/storage adapter missing**
- [ ] **Step 3: Implement `ObjectStorage.putPrivate()` and `PENDING` transition**

```js
class ObjectStorage {
  putPrivate({ key, contentType, body }) {}
  getSignedPrivateUrl({ key, expiresInSeconds }) {}
  deletePrivate({ key }) {}
}
```

- [ ] **Step 4: Verify file type/size, non-seller `403`, public denial and cleanup**
- [ ] **Step 5: Update Seller docs and commit `feat(seller): add private test KYC submission`**

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
async function getSellerMetrics({ sellerId, from, to }) {
  return {
    views,
    wishlistCount,
    chatStarts,
    completedSales,
    revenue,
    dailySeries,
  };
}
```

- [ ] **Step 4: Verify cross-seller denial, empty series and timezone boundary**
- [ ] **Step 5: Update docs and commit `feat(seller): serve verified seller insights`**

### Task SEL-005: Extended Seller Tools

**Files:**

- Create: `backend/services/chat-service/src/features/quick-replies/`
- Create: `backend/services/product-service/src/features/pricing/priceStrategy.js`
- Create: `frontend/app/seller/auctions/page.js`
- Test: `backend/services/product-service/src/features/pricing/priceStrategy.test.js`

**Interfaces:**

- Produces: `PriceStrategy.recommend({brand, condition, completedComparables})`
- Consumes: Marketing auction event and Admin auction approval contracts

- [ ] **Step 1: Write failing quick-reply ownership and deterministic price tests**
- [ ] **Step 2: Run targeted tests and confirm modules missing**
- [ ] **Step 3: Implement rule-based price range with evidence count**

```js
return { min, median, max, comparableCount, method: "completed-sales-median" };
```

- [ ] **Step 4: Verify sparse-data fallback, no cross-seller quick replies and auction lock**
- [ ] **Step 5: Update docs and commit `feat(seller): add extended seller tools`**
