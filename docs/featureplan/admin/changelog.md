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

## 2026-08-26 — Complete the Admin Story: Unified Workspace, Direct Product Moderation, Auction Approval

หลังรอบ merge ทั้ง 5 ทีมเข้า `main` ผู้ใช้ระบุว่า Admin ยังไม่สมบูรณ์: (1) สถานะ "ส่งเรื่องต่อ Admin"
ของตั๋วรั่วไปโผล่นอกหน้าเคสระดับแอดมิน และ (2) Admin ควรระงับบัญชี/ลบสินค้าได้จริงจากหน้าเดียว ไม่ใช่แค่ผ่าน Report ที่บังเอิญมี

**แก้บั๊ก "สถานะส่งไม้ต่อรั่ว":**
- `TicketsSection.js` (แท็บ Tickets ทั่วไป) เคยมี Option `ESCALATED` ในตัวกรองสถานะสำหรับ ADMIN
  ทำให้ตั๋วที่ส่งต่อ Admin โผล่ซ้ำได้ทั้งใน Tickets ทั่วไปและ "เคสระดับแอดมิน" — ตัด Option นี้ทิ้ง
  ให้ ESCALATED โผล่เฉพาะใน `AdminInboxSection` เท่านั้น
- `DashboardSection.js` เพิ่ม `userRole` prop: การ์ด "Escalated Tickets" (เดิมเป็น 0 เสมอสำหรับ
  CUSTOMER_SERVICE เพราะ backend บล็อกอยู่แล้วตั้งแต่รอบ merge ก่อนหน้า) เปลี่ยนเป็นการ์ด
  "Urgent Tickets" สำหรับ CS agent, ส่วน ADMIN คลิกการ์ด Escalated แล้วพาไปที่ "เคสระดับแอดมิน" โดยตรง
  แทนที่จะไปหน้า Tickets ที่ตัด Option ออกแล้ว

**แก้บั๊กจริงที่เจอระหว่างทดสอบ (ไม่ใช่แค่ design):**
- `AdminInboxSection`'s report action เคยยิง `/admin/reports/:id/action` ตรงๆ โดยไม่เคยเรียก
  `/admin/reports/:id/review` ก่อน — `reportService.actionReport` บังคับ lifecycle
  `OPEN -> REVIEWED -> ACTIONED|DISMISSED` เข้มงวด ทำให้ปุ่ม "จัดการ" ของ Report ที่ยังเป็น OPEN
  (ค่า default ของหน้า) 409 ทุกครั้ง แก้โดยเรียก review ก่อน action อัตโนมัติเมื่อ status ยังเป็น OPEN
  ยืนยันด้วยการยิง API ตรงผ่าน Docker stack จริง (insert report ทดสอบ → review → action → DISMISSED สำเร็จ)
- `productModerationService.restoreProduct` ส่ง `reason: null` เข้า `AdminAudit.create` แต่ field
  `reason` เป็น `String` (ไม่ nullable) ใน schema — Prisma โยน 500 ทุกครั้งที่กู้คืนสินค้า พบจาก
  การทดสอบจริงกับ Docker (`PrismaClientValidationError: Argument reason must not be null`)
  แก้โดยใส่ reason คงที่ที่อธิบายว่าเป็นการกู้คืนแบบ direct moderation

**เพิ่มความสามารถ Admin ที่ backend มีอยู่แล้วแต่ไม่เคยมี UI เรียกใช้:**
- **ลบ/กู้คืนสินค้าโดยตรง** (ไม่ต้องพึ่ง Report ที่บังเอิญมี `productId`): เพิ่ม
  `backend/services/auth-service/src/features/productModeration/` (routes + service) —
  `POST /admin/products/:id/remove|restore`, คุมด้วย permission `admin:moderation:remove` ที่มีอยู่แล้ว,
  เขียน audit log ผ่าน `reportService.recordAdminAction` เส้นทางเดียวกับ Report flow;
  เพิ่ม `GET /admin/search` ใน product-service (ต่างจาก `/search` สาธารณะที่ล็อก `status=available`
  เสมอ — Admin ต้องค้นได้ทุกสถานะ รวมถึง `removed` เพื่อกู้คืน) และ `restoreProduct()` ใน
  `productModerationClient.js`; เพิ่ม `ProductsSection.js` (Admin-only) ใน workspace
- **อนุมัติ/ปฏิเสธคำขอเปิดประมูล**: `auctionService.approve/reject` (จาก `feature-admin`/`marketing`)
  มีอยู่ครบตั้งแต่รอบ merge แต่ไม่มี Frontend เรียกใช้เลย — คำขอเปิดประมูลค้างที่ `pending_approval`
  ตลอดไปโดยไม่มีทางอนุมัติผ่าน UI (ยืนยันจาก Seed Data จริงที่ค้างอยู่ 1 รายการตอนทดสอบ) เพิ่ม
  `AuctionApprovalsSection.js` (Admin-only) เรียก `PATCH /api/products/auctions/:id/approve|reject`
  ที่มีอยู่แล้ว ทดสอบจริงผ่าน Docker stack: อนุมัติสำเร็จ → เห็นในฝั่ง Marketing ทันทีว่า
  "อนุมัติแล้ว รอตั้งเวลา" พร้อมตั้งเวลาได้จริง
- ทั้งสอง Section ใหม่อยู่ใน `ADMIN_SECTIONS` ของ `frontend/app/workspace/page.js` — มองเห็นเฉพาะ ADMIN

**เชื่อมฝั่ง Dispute เข้ากับ Admin Fund Hold ที่มีอยู่แล้ว:**
- ปุ่ม "ส่งเรื่องให้ Admin (Escalate)" เดิมใน `DisputesSection.js` ส่ง decision `"ESCALATE"` ที่
  `disputeService.js`'s whitelist (`APPROVE_REFUND`/`REJECT`) ไม่รองรับ — เป็นปุ่มพังมาตั้งแต่รอบก่อน
  (บันทึกไว้เป็น known issue ไม่แก้ตอนนั้น) ตอนนี้ตัดปุ่มออก เปลี่ยนเป็นข้อความแนะนำให้ติดต่อทีม
  Admin โดยตรงแทน — CS ไม่มี permission `admin:dispute:hold` อยู่แล้วตามการออกแบบ RBAC เดิม
- เพิ่มลิงก์ "จัดการการระงับเงิน (Admin)" ใน `DisputesSection.js`'s slide-over (แสดงเฉพาะ
  `userRole === "ADMIN"`) พาไปหน้า `/admin/disputes/[id]` (hold/release) ที่มีอยู่แล้วแต่ไม่เคยถูกลิงก์
  จากที่ไหนในระบบเลยตั้งแต่สร้างมา
- `/admin/disputes/[id]/page.js` เพิ่มการ์ดแสดงสถานะเคสฝั่ง CS (`disputeCase`, ที่ API คืนมาให้แล้ว
  ตั้งแต่รอบ merge dispute hold ↔ `payoutHeld`) พร้อมคำเตือนเมื่อกด "ปล่อยเงิน" ขณะเคส CS ยังไม่ตัดสิน
  ว่าเงินจะยังถูกพักไว้ต่อ (สอดคล้องกับ Logic ที่ `adminDisputeService.releaseSimulatedFunds` บังคับไว้)

**ยืนยันผลทั้งหมดผ่าน Browser จริงกับ Docker Stack** (ไม่ใช่แค่ Unit Test): Login ครบทั้ง ADMIN/
CUSTOMER_SERVICE, เดิน Flow ลบสินค้า → ค้นหาแบบ `status=removed` → กู้คืน, อนุมัติประมูล → เห็นผลฝั่ง
Marketing, เปิดเคส Dispute แล้วเห็นลิงก์ Admin เฉพาะ role ที่ถูกต้อง, Report review→action สำเร็จไม่ 409
อีกต่อไป — `npm test` (backend) 108 เทสต์ ผ่าน 84 ไม่มี fail, `npm run test:frontend` 28/28 ผ่าน,
`next build` (production) สำเร็จครบ 22 route, `eslint` สะอาดทั้ง repo