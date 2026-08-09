# Admin Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง shared RBAC และ Admin workspace สำหรับ KYC, report, ban และ dispute actions ที่ตรวจสอบย้อนหลังได้

**Architecture:** Auth owns identity/roles/KYC/account status; Product owns product moderation; Order owns hold/dispute Admin ส่ง owner commands ผ่าน API ไม่เขียน database ข้าม service

**Tech Stack:** Express, Prisma/PostgreSQL, JWT, Next.js `/admin`, Node/Jest tests

## Global Constraints

- Owner: สิรดนัย; Reviewer: อชิรวินท์
- Trace: `UR-22`–`UR-26`, `UC-06`, `UC-10`, `UC-11`
- Functional role/ownership checks, reason และ version check อยู่ใน Core
- Production security hardening และ privileged audit hardening ทำใน Deferred Security Phase
- KYC decision, report, moderation state และ simulated fund hold ต้อง persist ใน PostgreSQL จริง
  ห้ามใช้ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase
- `ADM-001` เป็น Gate 0 blocker ของทุก Feature

---

## Requirement Traceability

| UR      | Functional Requirement | Active/Deferred NFR                      | Workflow         | Task / Phase                        |
| ------- | ---------------------- | ---------------------------------------- | ---------------- | ----------------------------------- |
| `UR-22` | `FR-4.2.1`             | `NFR-SP-02` (Security Phase)             | `WF-01`          | `ADM-002` + Seller `SEL-001` / Core |
| `UR-23` | `FR-4.2.2`, `FR-4.2.3` | `NFR-P-01`                               | `WF-09`          | `ADM-003` / Core                    |
| `UR-24` | `FR-4.2.4`, `FR-4.2.5` | ไม่มี NFR เฉพาะ                          | `WF-09`          | `ADM-003` / Core                    |
| `UR-25` | `FR-3.2.3`             | `NFR-M-01`; `NFR-SP-03` (Security Phase) | `WF-08`          | `ADM-004` + CS `CSS-003` / Core     |
| `UR-26` | `FR-3.2.4`             | `NFR-BR-01`                              | `WF-08`, `WF-09` | `ADM-004` / Core                    |

### PostgreSQL acceptance for Admin

- `ADM-001`: role assignment/migration is verified in `reloop_auth`
- `ADM-002`: Synthetic KYC queue/decision/version persists in `reloop_auth`
- `ADM-003`: report lifecycle and owner-service moderation outcome persist in Auth/Product databases
- `ADM-004`: dispute evidence reference and simulated hold/release persist in `reloop_order`
- `ADM-005`: auction decision and bounded operation result persist in owner databases
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task ADM-001: Multi-Role Permission Foundation

**Files:**

- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Modify: `backend/services/auth-service/src/services/authService.js`
- Modify: `backend/shared/src/authMiddleware.js`
- Create: `backend/shared/src/permissions.js`
- Test: `backend/shared/src/permissions.test.js`
- Test: `backend/services/auth-service/test/multi-role.integration.test.js`

**Interfaces:**

- Produces: `{userId, roles, permissions}` identity context in `../integration.md`
- Produces: `requirePermission(permission, resourceCheck?)`

- [ ] **Step 1: Write failing multi-role and missing-permission tests**

```js
assert.equal(hasPermission(["CUSTOMER_SERVICE"], "support:case:read"), true);
assert.equal(hasPermission(["MARKETING"], "admin:user:ban"), false);
```

- [ ] **Step 2: Run tests; confirm single `role` JWT/schema cannot pass**
- [ ] **Step 3: Add `RoleCode`, `UserRole` and permission catalog**

```js
function requirePermission(permission) {
  return (req, res, next) =>
    req.permissions?.includes(permission)
      ? next()
      : res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            requestId: req.id,
          },
        });
}
```

- [ ] **Step 4: Verify migrated Buyer/Seller, role removal freshness and staff denial**
- [ ] **Step 5: Update Admin/root docs and commit `feat(auth): add multi-role permissions`**

### Task ADM-002: Test-KYC Review Queue

**Files:**

- Create: `backend/services/auth-service/src/features/adminKyc/adminKycRoutes.js`
- Create: `backend/services/auth-service/src/features/adminKyc/adminKycService.js`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Create: `frontend/app/admin/kyc/page.js`
- Test: `backend/services/auth-service/test/admin-kyc.integration.test.js`

**Interfaces:**

- Consumes: Seller persisted Synthetic KYC application/document reference
- Produces: `POST /api/auth/admin/kyc/:id/decision {decision, reason, version}`

- [ ] **Step 1: Write failing wrong-role, stale-version and double-decision tests**
- [ ] **Step 2: Run integration test; confirm routes missing**
- [ ] **Step 3: Implement Synthetic KYC lookup and compare-version decision**

```js
async function decideKyc({
  applicationId,
  decision,
  reason,
  version,
  adminId,
}) {
  return updateExactlyOnce({
    applicationId,
    decision,
    reason,
    version,
    adminId,
  });
}
```

- [ ] **Step 4: Verify persisted approve/reject, resubmission state and Seller status response**
- [ ] **Step 5: Update docs and commit `feat(admin): add test KYC decisions`**

### Task ADM-003: Reports, User Suspension and Product Moderation

**Files:**

- Create: `backend/services/auth-service/src/features/reports/reportRoutes.js`
- Create: `backend/services/product-service/src/features/moderation/moderationRoutes.js`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Create: `frontend/app/admin/reports/page.js`
- Test: `backend/services/product-service/test/moderation.integration.test.js`

**Interfaces:**

- Produces: report lifecycle `OPEN → REVIEWED → ACTIONED|DISMISSED`
- Produces: user safety summary `{completedOrders, reportCount, priorActions}`
- Produces: Product owner command `POST /internal/moderation/:id/remove`
- Produces: Auth owner command `POST /api/auth/admin/users/:id/suspend`

- [ ] **Step 1: Write failing reason/permission/idempotency tests**
- [ ] **Step 2: Run tests and confirm missing routes**
- [ ] **Step 3: Implement owner-local command, user safety summary projection and append-only audit**

```js
async function recordAdminAction({
  actorId,
  action,
  targetId,
  reason,
  requestId,
}) {
  return prisma.adminAudit.create({
    data: { actorId, action, targetId, reason, requestId },
  });
}
```

- [ ] **Step 4: Verify self-suspend denial, duplicate action, restore and listing visibility**
- [ ] **Step 5: Update docs and commit `feat(admin): add report moderation`**

### Task ADM-004: Dispute Evidence and Simulated Fund Hold

**Files:**

- Create: `backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js`
- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `frontend/app/admin/disputes/[id]/page.js`
- Test: `backend/services/order-service/test/admin-hold.integration.test.js`

**Interfaces:**

- Consumes: CS case and Chat evidence projection
- Produces: `POST /api/orders/admin/:id/hold {reason, version}` and release counterpart

- [ ] **Step 1: Write failing non-Admin, stale-version and duplicate-hold tests**
- [ ] **Step 2: Run targeted test; confirm endpoints absent**
- [ ] **Step 3: Implement simulated hold state without bank fields**

```js
async function holdSimulatedFunds({ orderId, reason, version, adminId }) {
  return transitionPaymentSimulation({
    orderId,
    from: "RELEASE_PENDING",
    to: "ON_HOLD",
    reason,
    version,
    adminId,
  });
}
```

- [ ] **Step 4: Verify evidence access audit, CS decision conflict and recovery**
- [ ] **Step 5: Update docs and commit `feat(admin): add audited order holds`**

### Task ADM-005: Extended Safe Operations

**Files:**

- Create: `backend/services/product-service/src/features/auctions/adminAuctionRoutes.js`
- Create: `backend/services/auth-service/src/features/audit/auditQuery.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `backend/services/auth-service/prisma/schema.prisma`
- Create: `frontend/app/admin/audit/page.js`
- Test: `backend/services/auth-service/test/bounded-bulk.integration.test.js`

**Interfaces:** Bounded batch command `{ids, action, reason, dryRun, idempotencyKey}`

- [ ] **Step 1: Write failing cap/dry-run/idempotency tests**
- [ ] **Step 2: Run tests and confirm feature flag/routes absent**
- [ ] **Step 3: Implement max-100 batch with preview and per-item result**

```js
const MAX_BATCH_SIZE = 100;
if (ids.length > MAX_BATCH_SIZE) throw badRequest("batch exceeds 100 items");
```

- [ ] **Step 4: Verify partial failure, replay, auction decision and export permissions**
- [ ] **Step 5: Update docs and commit `feat(admin): add bounded operations`**
