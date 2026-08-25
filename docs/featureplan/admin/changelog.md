# Admin Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-22`–`UR-26`
- กำหนด Admin เป็น owner ของ shared RBAC contract และ privileged audit
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-22`–`UR-26` พร้อม FR, NFR, `WF-01`, `WF-08`, `WF-09` และ Task/Phase
- คง `ADM-001` เป็น Phase 0 functional role provider ของทั้ง 6 Features
- เพิ่ม PostgreSQL acceptance สำหรับ KYC decision, report/moderation และ simulated fund hold
- คง Mock fund/payment state และ Synthetic KYC boundary; ห้าม mock/in-memory database
- ย้าย production privileged audit, encryption, PDPA และ PCI-DSS hardening ไป Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Admin implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `ADM-001`–`ADM-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, shared RBAC, synthetic/simulated boundary และ deferred security decisions
- ไม่มี Admin implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull Source Audit

- พบ Auth seed สำหรับ demo Seller 4 บัญชีใน source ที่ pull มา
- ยืนยันว่า seed ดังกล่าวไม่ใช่ Synthetic KYC, role catalog หรือ Admin acceptance evidence
- Admin status, blocker และ `ADM-001` next action ยังคงเดิม
- ไม่ได้แก้ Admin application code หรือรัน Admin PostgreSQL acceptance test

## 2026-08-10 — Trusted Display Name Claim

- Auth access token เพิ่ม `displayName` ที่ประกอบจาก User ในฐานข้อมูล และ refresh token flow สร้าง claim ใหม่
  จาก User ปัจจุบัน
- gateway/shared auth middleware ส่งต่อ identity ที่ verify แล้วให้ ProductVideo provider
- เพิ่ม middleware tests สำหรับ token ใหม่และ backward-compatible token เก่าที่ไม่มี `displayName`
- การเปลี่ยนแปลงนี้รองรับ trusted attribution เท่านั้น; ไม่ได้ทำ functional role catalog, Synthetic KYC
  decision หรือ `ADM-001` acceptance


## 2026-08-24 — ADM-001 Multi-Role Permission Foundation

- เพิ่ม `RoleCode` enum และ `UserRole` model ใน `backend/services/auth-service/prisma/schema.prisma`
  (BUYER, SELLER, CUSTOMER_SERVICE, ADMIN, MARKETING, EXECUTIVE)
- เพิ่ม `backend/shared/src/permissions.js` เป็น permission catalog กลาง พร้อม
  `hasPermission`/`permissionsForRoles`
- เพิ่ม `requirePermission(permission)` middleware ใน `backend/shared/src/authMiddleware.js`
  คืน `403 {error:{code,message,requestId}}` ตาม response contract; ยังคง `requireRole` เดิมไว้
- `authService.js` เพิ่ม `getUserRoles`, `assignRole`, `removeRole`; access/refresh token
  claims เพิ่ม `roles[]` และ `permissions[]`
- ผู้ใช้เดิมที่ไม่มีแถว `UserRole` ยัง resolve ผ่าน legacy `role` column ได้ (ไม่ต้อง backfill)
- เพิ่มเทสต์: `permissions.test.js`, `authMiddleware.test.js` (เคสใหม่),
  `multi-role.integration.test.js` (ต่อ `reloop_auth` จริง, ใช้ `REQUIRE_INTEGRATION=1`)
- ยังไม่ได้รัน integration test จริงในรอบนี้ — รอ Reviewer confirm ก่อนนับ `ADM-001` เป็น Done

## 2026-08-25 — ADM-001 Verified Done

- รัน `npx prisma migrate dev --name add_multi_role_foundation` ต่อ `reloop_auth` จริงสำเร็จ
- รัน unit test (`permissions.test.js`, `authMiddleware.test.js`) → 10/10 pass
- รัน `REQUIRE_INTEGRATION=1 node --test test/multi-role.integration.test.js` ต่อ `reloop_auth`
  จริง → 1/1 pass
- แก้บั๊กเล็กใน test cleanup (`multi-role.integration.test.js`): เพิ่ม `sellerProfile.deleteMany`
  ก่อน `user.deleteMany` เพื่อไม่ให้ชน FK constraint
- `ADM-001` เปลี่ยนสถานะเป็น Done ตาม PostgreSQL acceptance evidence จริง (ไม่ใช่แค่ unit test)

## 2026-08-25 — ADM-002 Test-KYC Review Queue

- เพิ่ม `KycApplication` model ใน `reloop_auth` (migration `add_kyc_applications`) —
  แยกจาก `SellerProfile.kycStatus` เพื่อเก็บประวัติทุกรอบ submit/resubmit
  พร้อม `version` (optimistic lock) และ `decidedBy`/`decidedAt`
- เพิ่ม `adminKycService.js`/`adminKycRoutes.js`: `GET /admin/kyc` (list queue,
  default status PENDING), `POST /admin/kyc/:id/decision` — คุมด้วย
  `requirePermission("admin:kyc:decide")`, เช็ค stale version (409) และ
  double-decision (409) ก่อนเขียน
- Decision ที่ผ่านจะ sync `SellerProfile.kycStatus`/`verifiedAt` ในคำสั่งเดียวกัน
- เพิ่ม `frontend/app/admin/kyc/page.js` — คิวตรวจ พร้อมช่องกรอกเหตุผลก่อนอนุมัติ/ปฏิเสธ
  (server บังคับ reason ที่ backend อยู่แล้ว ฝั่ง UI แค่กันพลาดก่อนส่ง)
- เพิ่มเทสต์ `admin-kyc.integration.test.js` ต่อ `reloop_auth` จริง: wrong-role denial,
  stale-version conflict, approve+seller-status sync, double-decision conflict
- รันเทสต์ครบ: unit 10/10, integration 3/3 (`admin-kyc`, `multi-role`, `register-login`)

## 2026-08-25 — ADM-003 Reports, User Suspension and Product Moderation

- auth-service: `Report` เพิ่ม `reviewedAt`/`reviewedBy`/`actionTaken`; เพิ่ม `AdminAudit`
  (append-only audit log) — migration `add_reports_and_admin_audit`
- เพิ่ม `reportService.js`/`reportRoutes.js`: `GET /admin/reports`,
  `POST /admin/reports/:id/review`, `POST /admin/reports/:id/action`
  (`SUSPEND_USER`/`REMOVE_PRODUCT`/`DISMISS`), `POST /admin/users/:id/suspend`,
  `POST /admin/users/:id/restore`, `GET /admin/users/:id/safety-summary`
- action บนรายงานที่ยังไม่ผ่าน review (`OPEN`) ถูกปฏิเสธด้วย 409; suspend ตัวเองถูกปฏิเสธ
  ด้วย 403; suspend ซ้ำ/action ซ้ำถูกปฏิเสธด้วย 409
- เพิ่ม `productModerationClient.js` (auth-service) เรียก product-service ผ่าน HTTP +
  internal token แทนการเขียน DB ข้าม service (ตาม ADM-DEC-001)
- product-service: `Product` เพิ่ม `moderatedAt`/`moderationReason`/`preRemovalStatus`
  (`prisma db push` — service นี้ไม่มี migration history เดิม); เพิ่ม
  `moderationRoutes.js`/`moderationService.js`: `POST /internal/moderation/:id/remove`,
  `POST /internal/moderation/:id/restore` (internal token เท่านั้น) — remove ทำให้หายจาก
  feed/search ทันที, restore คืนสถานะเดิมก่อนถูกลบ (ไม่ force เป็น "available" เสมอไป)
- `completedOrders` ใน safety summary ยังเป็น `null`/unavailable ตามที่ตกลงไว้
  (order-service นอก scope ไฟล์ของ ADM-003)
- เพิ่มหน้า `frontend/app/admin/reports/page.js`
- เพิ่มเทสต์: `admin-reports.integration.test.js` (auth-service, ใช้ stub Express
  แทน product-service จริงเพื่อทดสอบ cross-service call), `moderation.integration.test.js`
  (product-service)
- รันเทสต์ครบ: auth-service integration 4/4 + unit 2/2, product-service integration 2/2
  + unit 8/8 — ไม่มี regression

  ## 2026-08-25 — ADM-004 Dispute Evidence and Simulated Fund Hold

- order-service: `Order` เพิ่ม `paymentSimulationStatus`, `version` (optimistic lock),
  `holdReason`/`heldAt`/`heldBy`, `preDisputeStatus`; เพิ่ม `DisputeEvidence` และ
  `DisputeAudit` (`prisma db push` — service นี้ไม่มี migration history เดิม เหมือน
  `product-service`, ดู `ADM-DEC-012`)
- เพิ่ม `adminDisputeService.js`/`adminDisputeRoutes.js`: `GET /admin/:id` (ดู order +
  evidence, บันทึก audit `EVIDENCE_VIEWED`), `POST /admin/:id/hold`
  (`RELEASE_PENDING→ON_HOLD`, แตก `Order.status` ไป `disputed`), `POST /admin/:id/release`
  (คืนสถานะเดิม) — ทั้งคู่เช็ค stale version (409) และ duplicate hold/release (409)
- ไม่มี field ธนาคาร/payment processor ใดๆ — เป็น simulation ล้วน ตาม `ADM-DEC-003`
- เพิ่มหน้า `frontend/app/admin/disputes/[id]/page.js`
- เพิ่มเทสต์ `admin-hold.integration.test.js` ต่อ `reloop_order` จริง: wrong-role denial,
  evidence-access audit, stale-version conflict (hold และ release), duplicate-hold conflict,
  recovery ด้วย version ที่ถูกต้อง
- รันเทสต์ครบ: integration 1/1, unit 5/5 — ไม่มี regression

## 2026-08-25 — ADM-005 Extended Safe Operations

- เพิ่ม `BulkActionRun` ใน `reloop_auth` (migration `add_bulk_action_runs`) — เก็บผลลัพธ์
  batch ไว้ replay ตาม `idempotencyKey`
- เพิ่ม `actionRegistry.js`: engine ไม่ผูกกับ action เฉพาะ — เพิ่ม action ใหม่ = เพิ่ม entry เดียว
  ไม่ต้องแก้ route/engine/เทสต์เดิม; มี `SUSPEND_USER` เป็น handler แรก (reuse
  `reportService.suspendUser`)
- เพิ่ม `bulkActionService.executeBatch`: cap 100 (`MAX_BATCH_SIZE`), permission ตรวจต่อ action,
  `dryRun` เรียก `handler.preview()` ไม่เขียนจริง, partial failure ไม่ abort ทั้ง batch,
  idempotencyKey replay ไม่รันซ้ำ
- เพิ่ม `POST /admin/bulk` endpoint เดียวรับ `action` จาก body ตาม contract ใน plan.md
- เพิ่ม `auditQuery.js`/`auditRoutes.js`: `GET /admin/audit` คุมด้วย `admin:audit:read`
  รองรับ filter actorId/action/targetId
- เพิ่มหน้า `frontend/app/admin/audit/page.js`
- เพิ่มเทสต์ `bounded-bulk.integration.test.js`: cap, unsupported action, permission ต่อ action,
  dry-run ไม่เขียนจริง, partial failure, idempotency replay, audit query permission
- **ตัด auction ออกจาก scope** ตามที่ตกลง — `Auction` ไม่มีใน Release A ทั้งโปรเจกต์
  (`database/ER-changes.md`), บันทึกเป็น `ADM-DEC-015`
- **แก้บั๊ก test isolation:** `admin-reports.integration.test.js` และ
  `bounded-bulk.integration.test.js` เคยใช้ `adminId` คงที่ `"admin-1"` ร่วมกัน ทำให้ cleanup
  ของไฟล์หนึ่งลบ `AdminAudit` ของอีกไฟล์เมื่อรันพร้อมกัน (`node --test` concurrent by default) —
  เปลี่ยนเป็น `adminId` ที่ unique ต่อ run (timestamp-based) ทั้งสองไฟล์
- รันเทสต์ครบ: integration 5/5 ×2 รอบ (ยืนยันไม่ flaky), unit 2/2 — ไม่มี regression