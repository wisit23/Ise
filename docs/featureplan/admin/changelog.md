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
  - unit 8/8 — ไม่มี regression

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

## 2026-08-26 — Report Creation Endpoint, WARN_USER Decision, Ticket Counterparty Targeting

ผู้ใช้ตั้งข้อสังเกตว่า `report:create` permission มีอยู่แล้วแต่ไม่มี endpoint ไหนใช้จริง (ไม่มีทางส่ง
Report เข้ามาเลยนอกจาก Seed Data) และ Admin มีแค่ "แบน" เป็นทางเลือกเดียวเวลาตัดสิน Report/Ticket —
ทั้งที่บางเคสความผิดไม่ถึงขั้นแบน แถมบางครั้งคนที่ควรถูกจัดการไม่ใช่คนที่แจ้งเรื่องเข้ามาด้วยซ้ำ

**Report creation, wired end-to-end:**

- `backend/services/auth-service/src/features/reports/reportService.js` เพิ่ม
  `createReport({reporterId, targetId, productId, reason})` (ต้องมี `targetId` หรือ `productId`
  อย่างน้อยหนึ่ง, ปฏิเสธ self-report)
- `reportRoutes.js` เพิ่ม `POST /reports` (`requireAuth` + `report:create`)
- `frontend/components/ReportModal.js` (ใหม่) — Modal ใช้ซ้ำได้ทั้งหน้าสินค้าและหน้าร้าน
- ปุ่ม "รายงานสินค้า/ผู้ขายรายนี้" ใน `frontend/app/products/[id]/page.js` และ "รายงานร้านค้านี้"
  ใน `frontend/app/store/[sellerId]/page.js` (ซ่อนเมื่อผู้ดูคือเจ้าของสินค้า/ร้านเอง)

**WARN_USER — decision ที่ไม่ใช่การแบน:**

- เพิ่ม `"WARN_USER"` เข้า `VALID_DECISIONS` ของ `actionReport` และ `warnUser({targetId, adminId,
reason, requestId})` (บันทึก `USER_WARNED` audit, **ไม่แตะ** `user.status` — ต่างจาก suspend)
- `POST /admin/users/:id/warn` endpoint ใหม่ (reuse permission `admin:user:suspend` เดิม)
- `AdminInboxSection.js`: ปุ่ม "ตักเตือน" คู่กับ "แบนผู้ใช้นี้" ทั้งใน Report-decision dropdown และการ์ด
  ผู้ใช้บนตั๋วที่ถูก Escalate

**Ticket counterparty (`targetId`) — แก้ปัญหา "ทำไมแบนผู้แจ้ง":**
ผู้ใช้ชี้ตรงๆ ว่าปุ่มแบน/ตักเตือนบนตั๋วที่ Escalate เดิมยิงไปที่ `selectedTicket.requesterId` เสมอ —
ผิดตั้งแต่ต้นเวลาเรื่องจริงคือคนอื่นที่ผู้แจ้งกำลังร้องเรียน (เช่น ผู้ซื้อแจ้งว่าผู้ขายไม่จัดส่งของ)
`SupportTicket` เดิมไม่มีแนวคิดคู่กรณีเลย ต่างจาก `Report` ที่มี `targetId` อยู่แล้ว

- `SupportTicket` (schema ฝั่ง `support-service`, ดูรายละเอียดที่ `customer-service/changelog.md`)
  เพิ่ม `targetId String?` — soft reference แบบเดียวกับ `orderId`, derive จาก order ที่ผู้แจ้งเลือกตอน
  เปิดตั๋ว (buyer↔seller สลับฝั่งอัตโนมัติ)
- `AdminInboxSection.js` เพิ่มการ์ด "คู่กรณี (Target)" แยกจากการ์ด "ผู้แจ้ง (Requester)" เดิม แสดงเมื่อ
  `selectedTicket.targetId` มีค่า พร้อมปุ่มตักเตือน/แบนของตัวเอง ผูกกับ `targetId` ไม่ใช่ `requesterId`
  (reuse `handleWarnUser`/`handleBanUser` เดิม แค่ส่ง id คนละตัว)
- ยืนยันด้วย Browser จริง: Login เป็น Buyer สร้างตั๋วผูกกับ Order จริง → `target_id` ใน DB ตรงกับ
  Seller ของ Order นั้น (ไม่ใช่ผู้แจ้ง) → Escalate ตั๋ว → Login เป็น Admin เปิดเคสระดับแอดมิน เห็นการ์ด
  "คู่กรณี" แสดง Seller ID แยกจากการ์ดผู้แจ้งที่แสดง Buyer ID ถูกต้อง
- `npm test` (backend) 108/84/0/24 เท่าเดิม, `npm run test:frontend` 28/28 เท่าเดิม, `eslint` สะอาด
  ทุกไฟล์ที่แก้

## 2026-09-02 — UI-SYSTEM-001 (Frontend Design System / Refactor)

- `AdminInboxSection.js` 887 → 338 บรรทัด แตกเป็น `admin-inbox/AdminInboxTable`,
  `admin-inbox/ReportCasePanel` และส่วนที่ใช้ร่วมกับ CS ที่ `support/sections/case/`
  (`CaseDrawer`, `TicketCasePanel`, `CaseUserCard`) — logic การดึงข้อมูลและสิทธิ์ยังอยู่ที่
  Container เดิมทั้งหมด ไม่ได้ย้าย
- การ์ด "ผู้แจ้ง (Requester)" กับ "คู่กรณี (Target)" ที่เคยเป็น Markup ชุดเดียวกันเขียนซ้ำสองรอบ
  รวมเป็น `CaseUserCard` ตัวเดียว โดยปุ่มตักเตือน/แบนจะโผล่เฉพาะเมื่อผู้เรียกส่ง Handler มาให้
  (CS จึงเห็นการ์ดเดียวกันโดยไม่มีปุ่มที่จะ 403)
- `alert()` 2 จุดใน Admin Inbox (`ระงับบัญชีผู้ใช้สำเร็จ`, `บันทึกการตักเตือนสำเร็จ`) → Toast;
  `window.confirm` ตอนแบน และ `window.prompt` ตอนตักเตือน → `ConfirmDialog` ที่ตรวจเหตุผล
  แบบ inline ได้ ไม่บล็อกทั้งแท็บ
- `ProductsSection` ลบสินค้าเคยใช้ `window.confirm` ที่บอกได้แค่ชื่อสินค้า → `ConfirmDialog`
  ที่บอกผลจริงของการลบ (ซ่อนจากผู้ซื้อทันที ผู้ขายเห็นสถานะ "ถูกลบโดยแอดมิน")
- แก้บั๊ก: `ConfirmDialog` เปิดขึ้นมาอยู่ **ใต้** Case Drawer เพราะ Modal เป็น z-50 ส่วน Drawer
  เป็น z-[100] และไม่มีใครกำหนดลำดับไว้ → ตั้งชื่อ Stacking Order ใน `tailwind.config.js`
  (`z-nav` < `z-dropdown` < `z-drawer` < `z-modal` < `z-toast`) แล้วย้าย z-index ทั้ง 7 จุดมาใช้
- พบบั๊กฝั่ง Backend ที่ **ยังไม่แก้**: Admin เห็นและ Action ตั๋วจาก Queue ได้ แต่
  GET `/api/support/tickets/:id` ตอบ 403 สำหรับตั๋วใบเดียวกัน ทำให้หลังตักเตือนสำเร็จเคยมี
  ข้อความ "you do not have access to this ticket" สีแดงขึ้นใต้ Toast ที่บอกว่าสำเร็จ —
  ฝั่ง UI ไม่แสดงข้อความนั้นแล้ว (การ Refresh ที่ล้มเหลวไม่ใช่ Action ที่ล้มเหลว) แต่
  ความไม่สอดคล้องของสิทธิ์ระหว่าง Queue กับ Detail endpoint ยังอยู่
- ยืนยันด้วย Browser จริงกับ Docker Stack ด้วยบัญชี Demo Admin: ตารางเคส, Report panel,
  Ticket panel, การตักเตือนทั้งกรณีไม่กรอกเหตุผล (ถูกบล็อก) และกรอกเหตุผล (สำเร็จ ขึ้น Toast),
  Disputes ทั้ง 5 เคส Seed และ Dialog ลบสินค้า
- รายละเอียดเต็มและผลตรวจอยู่ที่ [`docs/featureplan/changelog.md`](../changelog.md) และ [`docs/progress.md`](../../progress.md) Task `UI-SYSTEM-001`; กติกา UI อยู่ที่ [`docs/ui-conventions.md`](../../ui-conventions.md)

## 2026-09-06 — 100% Complete Replacement of Role ADMIN with TRUST_AND_SAFETY

ลบและแทนที่บทบาท `ADMIN` ออกจากทั้งระบบ 100% โดยเปลี่ยนเป็น `TRUST_AND_SAFETY` (Trust and Safety) ในทุกเลเยอร์ของระบบ โดยไม่มีการคง enum ค่า `ADMIN` ไว้เป็นหนี้ทางเทคนิค:

**Shared & Database Schema:**
- `backend/shared/src/permissions.js`: เปลี่ยน key ใน `ROLE_PERMISSIONS` จาก `ADMIN` เป็น `TRUST_AND_SAFETY` และปรับ `ALL_ROLES` ให้มี `TRUST_AND_SAFETY` แทน `ADMIN`
- `backend/services/auth-service/prisma/schema.prisma`: แทนที่ `ADMIN` ด้วย `TRUST_AND_SAFETY` ใน `enum Role` และ `enum RoleCode`
- PostgreSQL migration: รันสคริปต์อัปเดตข้อมูลเดิมใน `users` และ `user_roles` ที่เคยมี role `ADMIN` ให้กลายเป็น `TRUST_AND_SAFETY` จากนั้น `prisma db push --accept-data-loss` สำเร็จ ไม่พบข้อผิดพลาด
- `seed-admin-demo.js` & `seed.js`: อัปเดตสคริปต์ seed ให้สร้างบัญชีด้วย role `TRUST_AND_SAFETY` (`admin@test.local`)

**Backend Microservices Role Guards:**
- `backend/services/product-service/src/controllers/productController.js`: `requireSellerRole` และ `adminSearch` เปลี่ยนจากการเช็ค `ADMIN` เป็น `TRUST_AND_SAFETY`
- `backend/services/product-service/src/routes/uploadRoutes.js`: `requireRole("SELLER", "TRUST_AND_SAFETY")`
- `backend/services/product-service/src/features/product-videos/productVideoService.js`: `UPLOAD_ROLES` เปลี่ยนเป็น `new Set(["SELLER", "TRUST_AND_SAFETY"])`
- `backend/services/product-service/src/features/auctions/auctionService.js`: เปลี่ยน role checks สำหรับการอนุมัติ/ปฏิเสธ/ยกเลิกประมูลจาก `ADMIN` เป็น `TRUST_AND_SAFETY`
- `backend/services/support-service/src/features/tickets/ticketService.js` & `helpService.js`: `AGENT_ROLES` เปลี่ยนจาก `ADMIN` เป็น `TRUST_AND_SAFETY`
- `backend/services/order-service/src/features/support/supportService.js` & `disputeService.js`: `AGENT_ROLES` เปลี่ยนจาก `ADMIN` เป็น `TRUST_AND_SAFETY`

**Frontend UI & Navigation:**
- `frontend/components/NavBar.js`: `ROLE_LABEL` เปลี่ยนจาก `ADMIN: "แอดมิน"` เป็น `TRUST_AND_SAFETY: "Trust and Safety"`; `isSupportAgent` รองรับ `TRUST_AND_SAFETY`
- `frontend/app/profile/page.js`: `ROLE_LABEL` มี `TRUST_AND_SAFETY: "Trust and Safety"`
- `frontend/app/workspace/page.js`: สิทธิ์การเข้าถึงแท็บควบคุมความปลอดภัย และ Badge เปลี่ยนเป็น `"Trust and Safety"`
- `frontend/components/support/sections/DashboardSection.js`: ตรวจสอบ `isAdmin = userRole === "TRUST_AND_SAFETY"`
- `frontend/components/support/sections/disputes/DisputeDetailPanel.js`: ปุ่มจัดการระงับเงิน และข้อความแจ้งเตือนเปลี่ยนเป็น `Trust & Safety`
- `frontend/app/admin/disputes/[id]/page.js`: การป้องกันการเข้าถึงตรวจสอบ `user?.role === "TRUST_AND_SAFETY"`
- `frontend/app/support/cases/[id]/page.js` & `tickets/[id]/page.js`: `isAgent` รองรับ `TRUST_AND_SAFETY`
- `frontend/components/NavBar.js`: แก้ไขส่วนหัวของเมนูโปรไฟล์ให้แสดงเฉพาะข้อความ `"Trust and Safety"` บรรทัดเดียวอย่างกระชับเมื่อผู้ใช้ถือบทบาท `TRUST_AND_SAFETY` โดยไม่แสดงชื่อเดิม "แอดมิน ระบบ" พร้อมทั้งอัปเดตชื่อสตาฟฟ์ในฐานข้อมูลจริงและ seed.js เป็น "Trust and Safety"

**Tests Verification:**
- `backend/shared/src/permissions.test.js` & `authMiddleware.test.js`: 10/10 pass
- `backend/services/auth-service/test/`: `admin-kyc`, `admin-reports`, `bounded-bulk`, `multi-role` 4/4 pass (พร้อมทั้ง sync `KycApplication` test fields `storageKey`/`fileType` ให้ตรงกับ schema ล่าสุด)
- `backend/services/order-service/test/admin-hold.integration.test.js`: 1/1 pass
- `backend/services/product-service/src/features/auctions/auctionService.test.js`: 17/17 pass
- `backend/services/support-service/src/`: 10/10 pass
- `npm run test:frontend`: 11/11 suites pass (37/37 tests pass)
- `npm run lint`: 0 errors / 0 warnings สะอาดทั้ง monorepo

## 2026-09-06 — Remove Auction Approvals from Trust & Safety Scope

นำระบบและหน้าที่การอนุมัติประมูล (Auction Approvals) ออกจากบทบาท `Trust and Safety` ตามขอบเขตความรับผิดชอบ (Separation of Concerns) โดยงานส่วนนี้เป็นของทีมการตลาด (Marketing) และปฏิบัติตามคำสั่งที่ไม่แตะต้องโค้ดฝั่ง Marketing เพื่อรอ merge กับทีม:

**Frontend Workspace Changes:**
- `frontend/app/workspace/page.js`: ลบ import `AuctionApprovalsSection`, นำ `{ key: "auction_approvals", label: "อนุมัติประมูล", icon: "sell" }` ออกจากรายการแท็บ `ADMIN_SECTIONS` และลบ block แสดงผล `{section === "auction_approvals" && ...}`
- `frontend/components/support/sections/AuctionApprovalsSection.js`: ลบไฟล์คอมโพเนนต์นี้ออกจากระบบอย่างสมบูรณ์

**Backend Authorization:**
- `backend/services/product-service/src/features/auctions/auctionService.js`: ตัด `TRUST_AND_SAFETY` ออกจากสิทธิ์ `approve`, `reject`, `schedule`, `cancel`, และ `submit` โดยคงการตรวจสอบสิทธิ์ `approve`/`reject` ไว้เฉพาะบทบาท `MARKETING`
- `backend/services/product-service/src/features/auctions/auctionService.test.js`: ปรับ unit tests ให้การอนุมัติประมูลปฏิเสธ `TRUST_AND_SAFETY` ด้วย 403 Forbidden และยอมรับเฉพาะ `MARKETING`

**Scope Boundary & Isolation:**
- ไม่มีการแตะต้องหรือแก้ไขไฟล์ในส่วนของ Marketing (`frontend/components/marketing/` ฯลฯ) คงไว้สำหรับการ merge ร่วมกับเพื่อนร่วมทีมที่รับผิดชอบส่วนดังกล่าวโดยตรง

**Tests Verification:**
- Backend auctions unit tests: 17/17 pass
- Frontend unit tests (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo

## 2026-09-06 — Rename "เคสระดับแอดมิน" to "เคส Trust & Safety"

ปรับปรุงข้อความบน UI เพื่อให้สอดรับกับการเปลี่ยนบทบาทจาก `ADMIN` เป็น `TRUST_AND_SAFETY` 100%:

**UI Changes:**
- `frontend/app/workspace/page.js`: เปลี่ยนชื่อแท็บ `admin_inbox` จาก `"เคสระดับแอดมิน"` เป็น `"เคส Trust & Safety"`
- `frontend/components/support/sections/DashboardSection.js`: เปลี่ยนข้อความนำทางบนการ์ด KPI Escalated Tickets สำหรับเจ้าหน้าที่จาก `"ดูที่เคสระดับแอดมิน"` เป็น `"ดูที่เคส Trust & Safety"`
- `frontend/components/support/sections/tickets/TicketsTable.js`: อัปเดต inline comments ให้สื่อถึงบทบาท Trust and Safety

**Tests Verification:**
- Frontend unit tests (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo

## 2026-09-07 — Protect Requester & Prioritize Counterparty in Ticket Moderation (ADM-DEC-019)

แก้ไขปัญหาเจ้าหน้าที่สับสนและแบนผู้แจ้งปัญหา (Requester) แทนคู่กรณีที่ถูกร้องเรียน (Target) ในหน้าเคส Trust & Safety:

**Frontend Changes:**
- `frontend/components/support/sections/case/CaseUserCard.js`: เพิ่ม props `warnLabel`, `banLabel`, และ `isRequester` เพื่อปรับข้อความและปุ่มสำหรับผู้ส่งคำร้องให้เป็นสีเทาอ่อน/ขอบบาง ป้องกันการเข้าใจผิดว่าเป็นปุ่มลงโทษคู่กรณีหลัก
- `frontend/components/support/sections/case/TicketCasePanel.js`:
  - สลับลำดับการ์ดนำ `คู่กรณี (Target - ผู้ถูกร้องเรียน)` มาแสดงเป็นอันดับแรกด้านบนสุด พร้อมปุ่มแบนสีแดง `[แบนคู่กรณี]`
  - นำการ์ด `ผู้แจ้ง (Requester - ผู้ส่งคำร้อง)` ไปแสดงด้านล่าง พร้อมปุ่ม `[แบนผู้แจ้ง (ระวัง)]`
  - หากตั๋วไม่มี `targetId` ผูกไว้ (เช่น เปิดตั๋วทั่วไปไม่ได้เลือกเลขออเดอร์) จะแสดงกล่องสีส้มพร้อมช่องกรอก User ID ของคู่กรณีด้วยตนเอง เพื่อให้ระบุตัวคนทำผิดและดำเนินการได้ทันที
  - แถบสรุปด้านบนขยายเป็น 4 คอลัมน์ แสดงทั้ง `คู่กรณี (Target)` และ `ผู้แจ้ง (Requester)` ชัดเจน
- `frontend/components/support/sections/AdminInboxSection.js`:
  - ส่งต่อ `roleLabel` ("คู่กรณี" หรือ "ผู้แจ้ง") ไปยัง `pendingAction`
  - ปรับปรุง `confirmCopy` ในโมดอล `ConfirmDialog` ให้ระบุ User ID และบทบาทที่จะแบนอย่างละเอียด พร้อมแสดงคำเตือนพิเศษ `⚠️ ยืนยันการระงับบัญชีผู้แจ้งปัญหา?` หากผู้ใช้พยายามแบนผู้ส่งคำร้อง
  - Map `targetId` จากรายงาน (`REPORT`) เข้ารายการตารางเคส
- `frontend/components/support/sections/admin-inbox/AdminInboxTable.js`:
  - ปรับปรุงคอลัมน์ในตารางจากเดิม "รหัสลูกค้า (ID)" เป็น "คู่กรณี / ผู้แจ้ง" เพื่อแสดงรหัสคู่กรณี (สีส้ม) และผู้แจ้ง (สีเทา) ให้เห็นตั้งแต่ภาพรวม

**Backend / Database Changes:**
- `backend/services/support-service/prisma/seed.js`: เพิ่ม `targetId: SELLER_DENIM` ให้กับตั๋วข้อพิพาท `#CS-000002` และปรับการ upsert ให้ sync `targetId` เสมอ
- อัปเดตข้อมูลตั๋ว `#CS-000002` ในฐานข้อมูลจริง `reloop_support` ให้มี `target_id = 10000000-0000-0000-0000-000000000001` (Denim Seller) เรียบร้อยแล้ว

**Tests Verification:**
- Frontend unit tests (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo

## 2026-09-07 — Backend Architecture Refactoring for Trust & Safety (ADM-DEC-020)

Refactor ปรับปรุงคุณภาพโค้ด สถาปัตยกรรม และความเสถียรของ Backend ที่เกี่ยวข้องกับระบบ **Trust & Safety** ข้าม 4 Microservices:

**1. Database Atomicity (`prisma.$transaction`):**
- `backend/services/auth-service/src/features/adminKyc/adminKycService.js`: ห่อหุ้มการอัปเดต `kycApplication` + `sellerProfile` + การบันทึก `adminAudit` ให้อยู่ใน Transaction เดียว ป้องกันข้อมูลค้างหรือสถานะไม่ตรงกันหากคำสั่งใดคำสั่งหนึ่งล้มเหลว
- `backend/services/order-service/src/features/adminDisputes/adminDisputeService.js`: ห่อหุ้มการสั่งพักเงิน (`holdSimulatedFunds`) และการคืนเงิน (`releaseSimulatedFunds`) ให้อยู่ใน Transaction เดียวกันกับการบันทึก `disputeAudit`

**2. Complete Audit Logging:**
- บันทึก Audit Trail สำหรับการตัดสินใจ KYC (`KYC_APPROVED`, `KYC_REJECTED`) ลงในตาราง `admin_audits` อย่างครบถ้วน ปิดช่องว่าง NFR-SP-03
- `reportService.js`: ปรับปรุง Safety Summary ให้นับจำนวนการระงับบัญชี (`suspensionCount`) และการตักเตือน (`warningCount`) เพิ่มเติม

**3. Expanded Bulk Moderation Registry:**
- `backend/services/auth-service/src/features/bulkActions/actionRegistry.js`: เพิ่มคำสั่ง `WARN_USER` และ `RESTORE_USER` รองรับการ Dry-run, Idempotency และจำกัดจำนวนต่อรอบ (Max batch size 100)
- `bulkActionService.js`: ทำความสะอาดการส่งต่อพารามิเตอร์ `staffId`, `actorId`, และ `requestId`

**4. Service-to-Service HTTP Resilience:**
- `backend/services/auth-service/src/services/productModerationClient.js`: เพิ่ม Timeout 5,000ms ด้วย `AbortSignal.timeout` พร้อมจัดการ Error 504 Timeout ป้องกันปัญหาระบบค้างเมื่อเรียกข้ามเครือข่ายไปยัง `product-service`

**5. Support Oversight Authorization:**
- `backend/services/support-service/src/features/tickets/ticketService.js`: ปรับปรุง `assertAccess` ให้บทบาท `TRUST_AND_SAFETY` มีสิทธิ์ตรวจสอบและดูแลตั๋วทุกใบได้เสมอ แม้ตั๋วจะมีเจ้าหน้าที่ CS ท่านอื่นรับผิดชอบอยู่ก็ตาม (ขจัดปัญหา 403 Forbidden ที่เคยพบ)

**Tests Verification:**
- Shared permissions & authMiddleware unit tests: 10/10 pass
- Auth-service PostgreSQL integration tests (`admin-kyc`, `admin-reports`, `bounded-bulk`): 3/3 pass (ครอบคลุมทั้ง `SUSPEND_USER`, `WARN_USER`, และ `RESTORE_USER`)
- Order-service PostgreSQL integration test (`admin-hold`): 1/1 pass
- Product-service PostgreSQL integration test (`moderation`): 1/1 pass
- Support-service unit & integration tests (`ticketState`, `priority`, `ticket-lifecycle`): pass ครบทุกข้อ
- Frontend test suites (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo

## 2026-09-07 — Frontend Trust & Safety Architecture & UX Refactoring (ADM-DEC-021)

Refactor ปรับปรุงประสบการณ์ใช้งาน สถาปัตยกรรมคอมโพเนนต์ และความปลอดภัยในการใช้งาน (Safety Guards) ของระบบ **Trust & Safety** บน Frontend:

**1. KYC Section Modernization & Controls (`frontend/components/support/sections/KycSection.js`):**
- เพิ่มตัวเลือกกรองสถานะ (`PENDING`, `VERIFIED`, `REJECTED`, `ALL`) ทำให้สามารถเรียกดูใบสมัครที่ผ่านการตัดสินแล้วย้อนหลังได้
- เพิ่มระบบ Pagination เชื่อมต่อกับ Backend Pagination API
- นำ `ConfirmDialog` มาครอบการตัดสินใจอนุมัติ (`VERIFY`) และปฏิเสธ (`REJECT`) ป้องกันการกดพลาด พร้อมแจ้งเตือนผ่าน Toast
- จัดรูปแบบการแสดงผลใหม่ด้วย `Badge` และดีไซน์การ์ดข้อมูลร้านค้าที่อ่านง่ายและสบายตา

**2. Audit Log Overhaul (`frontend/components/support/sections/AuditSection.js`):**
- ปรับคำศัพท์จาก "Audit Log ของแอดมิน" เป็น "Audit Log ของ Trust & Safety" และเปลี่ยนชื่อคอลัมน์เป็น "ผู้ดำเนินการ (Staff ID)"
- แก้ไขการอ่านฟิลด์ข้อมูลจริง (`actorId`, `targetId`, `reason`) ขจัดปัญหาค่าว่าง/ขีดค้างในตาราง
- เพิ่มตัวกรองประเภทการกระทำ (Action Filter) แบบ Dropdown และช่องค้นหารหัสเป้าหมาย (Target ID)
- เพิ่ม Pagination รองรับการดูประวัติขนาดใหญ่

**3. Product Moderation Polish (`frontend/components/support/sections/ProductsSection.js`):**
- ปรับปรุงข้อความสถานะสินค้าเป็น "ถูกระงับโดย Trust & Safety"
- เพิ่ม Pagination สำหรับผลลัพธ์การค้นหาสินค้า
- เพิ่ม Toast แจ้งเตือนเมื่อกู้คืนสินค้าสำเร็จ

**4. Dispute Fund Management Safeguards (`frontend/app/admin/disputes/[id]/page.js`):**
- ครอบคำสั่งระงับเงิน (`Hold`) และปล่อยเงิน (`Release`) ด้วย `ConfirmDialog` พร้อมคำอธิบายผลกระทบทางการเงินชัดเจน
- ปรับปรุงข้อความคำเตือนให้อ้างอิงถึงทีม Trust & Safety

**5. Escalation Copy Alignment (`frontend/components/support/sections/AdminInboxSection.js`):**
- ปรับปรุงข้อความส่งต่อตั๋วเป็น "ส่งต่อให้ทีม Trust & Safety?"

**Tests Verification:**
- Frontend unit tests (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo
- Shared RBAC tests: 10/10 pass

## 2026-09-08 — Unified Search Center & Direct Moderation (ADM-DEC-022)

ยกระดับหน้าแท็บค้นหาใน Workspace สู่ **"ศูนย์ค้นหาข้อมูล Trust & Safety (Unified Search Center)"** ค้นหาข้อมูลได้หลากหลายและสั่งการควบคุมความปลอดภัยได้ทันที:

**1. Multi-Entity Search Dropdown & Dynamic Placeholders (`frontend/components/support/sections/OrdersSection.js`):**
- เพิ่มตัวเลือกประเภทการค้นหาใน `RadioSelect`:
  - `orderId`: ค้นหารหัสคำสั่งซื้อ (Order ID)
  - `buyerId`: ค้นหาด้วยรหัสหรืออีเมลของผู้ซื้อ (Buyer ID / Email)
  - `sellerId`: ค้นหาด้วยรหัส อีเมล หรือชื่อร้านค้าของผู้ขาย (Seller ID / Shop / Email)
  - `userId`: ค้นหาด้วยรหัสหรืออีเมลของผู้ใช้ทั่วไป (User ID / Email)
- ปรับเปลี่ยนข้อความ Placeholder อัตโนมัติตามประเภทที่เลือก พร้อมปุ่มล้างคำค้นหา (Clear input)

**2. User Profile & Safety Summary Card:**
- แสดงข้อมูลโปรไฟล์: ชื่อ-นามสกุล, อีเมล, เบอร์โทรศัพท์, สิทธิ์ผู้ใช้ (Roles), สถานะบัญชี (`ACTIVE` / `SUSPENDED`)
- ปุ่มคัดลอก User ID พร้อม visual feedback
- สถิติด้านความปลอดภัย 3 ด้าน: รายงานที่ได้รับ (`reportCount`), การตักเตือน (`warningCount`), ประวัติการถูกระงับบัญชี (`suspensionCount`)
- ข้อมูลผู้ขาย (Seller Profile): แสดงชื่อร้านค้า, สถานะ KYC (`VERIFIED` / `PENDING` / `REJECTED`), เลขบัตรประชาชน, บัญชีธนาคาร, ที่อยู่

**3. Direct Moderation Actions with ConfirmDialog:**
- เพิ่มปุ่มสั่งการระดับ Trust & Safety บนการ์ดผู้ใช้:
  - `[ตักเตือนผู้ใช้ (Warn)]`: เปิด `ConfirmDialog` ระบุเหตุผล และเรียก `POST /api/auth/admin/users/:id/warn`
  - `[ระงับบัญชี (Ban)]`: แสดงเมื่อผู้ใช้ยังไม่ถูกระงับ เปิด `ConfirmDialog` (Danger tone) และเรียก `POST /api/auth/admin/users/:id/suspend`
  - `[ปลดการระงับ (Restore)]`: แสดงเมื่อผู้ใช้ถูกระงับ เปิด `ConfirmDialog` และเรียก `POST /api/auth/admin/users/:id/restore`
- ทุกคำสั่งบังคับระบุเหตุผลเพื่อบันทึก Audit Log พร้อมแสดงผลผ่าน Toast และรีเฟรชข้อมูลสถานะผู้ใช้แบบ real-time

**4. Associated Orders List & Order Jump Integration:**
- แสดงรายการคำสั่งซื้อจริงทั้งหมดที่เกี่ยวข้องกับผู้ใช้ที่ค้นหา
- ในการ์ดแสดงผลการค้นหาคำสั่งซื้อ (`orderId`) เพิ่มปุ่มด่วน `[ตรวจสอบผู้ซื้อ]` และ `[ตรวจสอบผู้ขาย]` เพื่อสลับประเภทค้นหาและเจาะลึกข้อมูลประวัติผู้ใช้ได้ทันทีในคลิกเดียว

**5. Backend Endpoint Extension (`auth-service`):**
- เพิ่มฟังก์ชัน `getUserDetail(identifier)` ใน `backend/services/auth-service/src/features/reports/reportService.js` รองรับการค้นหาผู้ใช้จาก ID, Email, และ Shop Name พร้อมคืน `safetySummary` และ `sellerProfile`
- เพิ่ม Route `GET /admin/users/:id` ใน `reportRoutes.js` ป้องกันด้วย `requireAuth` และสิทธิ์ `admin:report:read` / `support:case:read`
- เพิ่มชุดทดสอบ Integration ใน `test/admin-reports.integration.test.js`

**Tests Verification:**
- Frontend unit tests (`npm run test:frontend`): 11/11 suites pass (37/37 tests pass)
- Lint check (`npm run lint`): 0 errors, 0 warnings สะอาดทั้ง monorepo
- Shared RBAC tests (`permissions.test.js`): 4/4 pass
