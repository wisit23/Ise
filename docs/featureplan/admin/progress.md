# Admin Feature Progress

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-10

**Status:** Planning revised - implementation not started

**Plan coverage:** Explicit trace rows cover `UR-22`–`UR-26` through FR, active/deferred NFR,
`WF-01`, `WF-08`, `WF-09` and `ADM-001`–`ADM-005`

**Confirmed evidence:** Auth schema has `ADMIN`, `KycStatus` and `Report`, but current source lacks
the functional multi-role catalog, persisted KYC decision API, moderation workspace and simulated hold flow

**Post-pull audit:** Auth seed now creates four deterministic demo Seller accounts with one shared
development password; this is seed data only and does not satisfy `ADM-001`, Synthetic KYC or RBAC acceptance

**Shared refactor evidence:** Auth access tokens now carry a database-derived `displayName` and refresh
rebuilds claims from the stored User. This supports trusted ProductVideo attribution but does not complete `ADM-001`

**Database acceptance:** Auth/Product/Order PostgreSQL tests are required; no new
`REQUIRE_INTEGRATION=1` Admin test has run in this planning round

**Deferred:** Production privileged-audit, encryption, PDPA and PCI-DSS hardening

**Blocker:** `ADM-001` remains the Phase 0 provider for all six Role Features

**Next action:** Write the failing `ADM-001` role-assignment migration/integration tests against `reloop_auth`

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-24

**Status:** ADM-001 implemented — pending Reviewer verification and integration test run

**ADM-001 evidence:** เพิ่ม `RoleCode` enum (BUYER/SELLER/CUSTOMER_SERVICE/ADMIN/MARKETING/EXECUTIVE)
และ `UserRole` model ใน `reloop_auth` schema; เพิ่ม `backend/shared/src/permissions.js`
(permission catalog + `hasPermission`/`permissionsForRoles`) และ `requirePermission` ใน
`authMiddleware.js`; `authService.js` มี `getUserRoles`/`assignRole`/`removeRole` และ
access token ตอนนี้มี `roles[]`/`permissions[]` นอกเหนือจาก legacy `role`

**Migration strategy:** ผู้ใช้เดิมที่ยังไม่มีแถวใน `UserRole` จะ resolve permission จาก
legacy `role` column โดยอัตโนมัติ (ไม่ต้อง backfill migration แยก); แถวจะถูกสร้างจริง
เมื่อมีการ assign/remove role ครั้งแรกผ่าน `authService`

**Next action:** รัน `REQUIRE_INTEGRATION=1 node --test test/multi-role.integration.test.js`
ต่อ `reloop_auth` จริง แล้วขอ Reviewer (อชิรวินท์) ตรวจ evidence ก่อนเริ่ม `ADM-002`

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-25

**Status:** ADM-001 Done — pending Reviewer sign-off before starting ADM-002 implementation

**ADM-001 evidence:** `RoleCode` enum + `UserRole` model migrated into `reloop_auth`
(`prisma/migrations/20260824151942_add_multi_role_foundation`); `backend/shared/src/permissions.js`
permission catalog + `requirePermission` middleware; `authService.js` มี `getUserRoles`/
`assignRole`/`removeRole`; access/refresh token claims มี `roles[]`/`permissions[]`

**Test run:** `node --test backend/shared/src/permissions.test.js backend/shared/src/authMiddleware.test.js`
→ 10/10 pass; `REQUIRE_INTEGRATION=1 node --test test/multi-role.integration.test.js` ต่อ `reloop_auth`
จริง → 1/1 pass (2026-08-25) — คลุม legacy-role fallback, role promotion, role-removal freshness
และ minimum-one-role invariant

**Next action:** ขอ Reviewer (อชิรวินท์) ตรวจ evidence ข้างต้น แล้วเริ่ม `ADM-002` (Test-KYC Review Queue)

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-25

**Status:** ADM-001, ADM-002 Done — pending Reviewer sign-off before starting ADM-003

**ADM-002 evidence:** เพิ่ม `KycApplication` model (`reloop_auth`, migration
`20260824194716_add_kyc_applications`) แยกจาก `SellerProfile.kycStatus` เพื่อเก็บประวัติ
submit/resubmit ทุกรอบพร้อม `version` สำหรับ optimistic lock; เพิ่ม
`GET /admin/kyc` (list queue) และ `POST /admin/kyc/:id/decision` ใน auth-service
คุ้มครองด้วย `requirePermission("admin:kyc:decide")`; approve/reject sync
`SellerProfile.kycStatus`/`verifiedAt` ในทรานแซกชันเดียวกับการตัดสินใจ
เพิ่มหน้า `frontend/app/admin/kyc` สำหรับคิวตรวจ

**Test run (2026-08-25):** unit 10/10 pass; `REQUIRE_INTEGRATION=1` integration
(`admin-kyc`, `multi-role`, `register-login`) 3/3 pass ต่อ `reloop_auth` จริง

**Next action:** ขอ Reviewer ตรวจ evidence `ADM-001`+`ADM-002` แล้วเริ่ม `ADM-003`
(Reports, User Suspension and Product Moderation)

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-25

**Status:** ADM-001, ADM-002, ADM-003 Done — pending Reviewer sign-off before starting ADM-004

**ADM-003 evidence:** `Report` มี `reviewedAt`/`reviewedBy`/`actionTaken`; เพิ่ม `AdminAudit`
(append-only) ใน `reloop_auth` (migration `add_reports_and_admin_audit`); report lifecycle
`OPEN→REVIEWED→ACTIONED|DISMISSED` บังคับตามลำดับ (action ก่อน review = 409); `SUSPEND_USER`
สั่งผ่าน `reportService.suspendUser` (self-suspend + duplicate-suspend ปฏิเสธด้วย 403/409);
`REMOVE_PRODUCT` สั่งผ่าน `productModerationClient` → product-service
`POST /internal/moderation/:id/remove` (internal token เท่านั้น, ไม่มีเขียน DB ข้าม service);
Product ใน `reloop_product` เพิ่ม `moderatedAt`/`moderationReason`/`preRemovalStatus` (db push,
ไม่มี migration history เดิมของ service นี้) — removed สินค้าหายจาก feed/search และ restore
กลับสถานะเดิมได้ถูกต้อง

**Known limitation:** `completedOrders` ใน user safety summary คืนค่า `null` +
`completedOrdersAvailable:false` เพราะ order-service อยู่นอก scope ไฟล์ของ `ADM-003`
(ดู `ADM-DEC-011`) — ต้อง contract review กับเจ้าของ Order ก่อนเพิ่มทีหลัง

**Test run (2026-08-25):** auth-service integration 4/4 pass (kyc, reports, multi-role,
register-login), unit 2/2; product-service integration 2/2 pass (moderation, product-crud),
unit 8/8 — ทั้งหมดต่อ `reloop_auth`/`reloop_product` จริง, `REQUIRE_INTEGRATION=1`

**Next action:** ขอ Reviewer ตรวจ evidence `ADM-001`–`ADM-003` แล้วเริ่ม `ADM-004`
(Dispute Evidence and Simulated Fund Hold, order-service)

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-25

**Status:** ADM-001–ADM-004 Done — pending Reviewer sign-off before starting ADM-005

**ADM-004 evidence:** `Order` (`reloop_order`) เพิ่ม `paymentSimulationStatus`
(`RELEASE_PENDING`⇄`ON_HOLD`), `version` (optimistic lock), `holdReason`/`heldAt`/`heldBy`,
`preDisputeStatus`; เพิ่ม `DisputeEvidence` และ `DisputeAudit` (append-only, log ทั้ง
`EVIDENCE_VIEWED`/`HOLD`/`RELEASE`); `POST /admin/:id/hold` และ `POST /admin/:id/release`
คุ้มครองด้วย `requirePermission("admin:dispute:hold"/"admin:dispute:release")`; hold ทำให้
`Order.status` แตกไป `disputed` และ release คืนสถานะเดิม; เพิ่มหน้า
`frontend/app/admin/disputes/[id]`

**Known limitation:** Evidence ยังเป็นการ seed ตรงผ่าน Prisma (ไม่มี endpoint ให้ CS/Chat ส่งเข้ามาจริง)
เพราะ CS/Chat feature ยังไม่ถูกสร้าง — ดู `ADM-DEC-013`

**Test run (2026-08-25):** order-service integration 1/1 pass (`admin-hold`, ต่อ `reloop_order`
จริง, `REQUIRE_INTEGRATION=1`), unit 5/5 pass — ไม่มี regression

**Next action:** ขอ Reviewer ตรวจ evidence `ADM-001`–`ADM-004` แล้วเริ่ม `ADM-005`
(Extended Safe Operations: bounded bulk actions + audit query)

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-25

**Status:** ADM-001–ADM-005 Done — pending Reviewer sign-off (all six tasks in plan.md implemented)

**ADM-005 evidence:** เพิ่ม `BulkActionRun` (`reloop_auth`, migration `add_bulk_action_runs`)
สำหรับ idempotency replay; เพิ่ม action-registry pattern (`actionRegistry.js`) — engine
(`bulkActionService.executeBatch`) ไม่ผูกกับ action เฉพาะเจาะจง ตอนนี้มี `SUSPEND_USER`
(reuse `reportService.suspendUser` จาก ADM-003) เป็น handler แรก; `POST /admin/bulk`
รับ `{action, ids, reason, dryRun, idempotencyKey}` ตาม contract ใน plan.md ตรงตัว — cap 100,
permission ตรวจต่อ action, partial failure ไม่ abort ทั้ง batch, replay จาก idempotencyKey
ไม่รันซ้ำ; เพิ่ม `GET /admin/audit` (`auditQuery.js`) คุมด้วย `admin:audit:read`

**Auction scope decision:** `adminAuctionRoutes.js` ที่ plan.md ระบุไว้เดิม **ไม่ได้ทำ** เพราะ
`Auction` อยู่นอก Release A scope ทั้งโปรเจกต์ (ยืนยันจาก `database/ER-changes.md`) ไม่ใช่แค่ Admin —
ออกแบบ registry ให้เพิ่ม `AUCTION_DECISION` handler ได้ทันทีที่ Auction มีอยู่จริง โดยไม่ต้องแก้
engine/route/เทสต์เดิม ดู `ADM-DEC-015`

**Test run (2026-08-25):** auth-service integration 5/5 pass ×2 รอบ (kyc, reports, bounded-bulk,
multi-role, register-login), unit 2/2 pass ต่อ `reloop_auth` จริง, `REQUIRE_INTEGRATION=1`

**Next action:** ขอ Reviewer ตรวจ evidence ครบทั้ง `ADM-001`–`ADM-005` ก่อนเปลี่ยนสถานะเป็น Done
อย่างเป็นทางการ; ตาม `plan.md` Global Constraints — `NFR-SP-*`/`NFR-CP-*` และ privileged audit
hardening ยังเป็น Deferred Security Phase ไม่ถือว่า Done ในรอบนี้

**2026-08-26 update:** หลัง Merge ทุกทีมเข้า `main` พบว่า Admin ยังใช้งานไม่ครบ (สถานะส่งไม้ต่อ
รั่วนอกเคสระดับแอดมิน, ไม่มีทางลบสินค้า/อนุมัติประมูลผ่าน UI ทั้งที่ Backend มีอยู่แล้ว) แก้ครบและ
ยืนยันผ่าน Browser จริงกับ Docker Stack แล้ว — รายละเอียดทั้งหมดอยู่ที่ `changelog.md` หัวข้อ
"Complete the Admin Story" ไม่กระทบสถานะ `ADM-001`–`ADM-005` เดิมข้างต้น (เป็นงานเชื่อม/ทำให้
สมบูรณ์บน UI ไม่ใช่ Feature ใหม่ตาม Task ID)

**2026-08-26 update 2:** เพิ่ม Report creation endpoint ที่เคยขาด (`report:create` permission มีมา
นานแล้วแต่ไม่มี route ใช้), เพิ่ม `WARN_USER` เป็น Decision ที่ไม่ใช่การแบนสำหรับทั้ง Report และ Ticket,
และเพิ่มแนวคิดคู่กรณี (`targetId`) ให้ `SupportTicket` เพื่อให้ Admin แบน/ตักเตือน "คนที่ถูกร้องเรียน"
ได้จริง แทนที่จะบังคับเลือกได้แค่ผู้แจ้ง — รายละเอียดที่ `changelog.md` หัวข้อ "Report Creation Endpoint,
WARN_USER Decision, Ticket Counterparty Targeting" ไม่กระทบสถานะ `ADM-001`–`ADM-005` เดิม (เป็นงาน
เชื่อม/เสริม UI เดิมเช่นกัน)

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-06

**Status:** Role ADMIN replaced 100% by TRUST_AND_SAFETY — Complete across Monorepo

**Evidence:**

- `RoleCode` และ `Role` enum ใน `reloop_auth` schema ถูกแทนที่ด้วย `TRUST_AND_SAFETY` อย่างสมบูรณ์ ข้อมูลแถวเดิมใน Postgres ถูกแปลงเป็น `TRUST_AND_SAFETY` เรียบร้อย
- `ROLE_PERMISSIONS` ใน `backend/shared/src/permissions.js` ใช้ key `TRUST_AND_SAFETY`
- ทุก Microservice (`product-service`, `order-service`, `support-service`, `auth-service`) ตรวจสอบและบังคับสิทธิ์ด้วย `TRUST_AND_SAFETY`
- Frontend UI (`NavBar`, `workspace`, `profile`, `DashboardSection`, `DisputeDetailPanel`, etc.) แสดงชื่อและบทบาทเป็น **Trust and Safety** โดยหัวเมนูโปรไฟล์ตัดชื่อเก่า "แอดมิน ระบบ" เหลือเพียง "Trust and Safety" อย่างกระชับตามคำสั่งผู้ใช้
- ทดสอบผ่านครบทั้งหมด: Shared tests (10/10 pass), Auth-service integration tests (4/4 pass), Order-service admin-hold test (1/1 pass), Product-service auction tests (17/17 pass), Frontend suites (11/11 pass, 37/37 tests), Lint สะอาด 0 errors

**Next action:** นำเสนอการเปลี่ยนแปลงให้ผู้ใช้งาน และพร้อมทำงานต่อตามที่ได้รับมอบหมาย

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-06

**Status:** Removed Auction Approvals from Trust & Safety Scope — Complete

**Evidence:**

- ตัดแท็บ "อนุมัติประมูล" (`auction_approvals`) ออกจาก Workspace ของ Trust & Safety ใน `frontend/app/workspace/page.js` และลบไฟล์คอมโพเนนต์ `AuctionApprovalsSection.js`
- ปรับปรุง Backend `auctionService.js` โดยตัด `TRUST_AND_SAFETY` ออกจากสิทธิ์การจัดการประมูลทั้งหมด และกำหนดให้สิทธิ์ `approve`/`reject` เป็นของบทบาท `MARKETING`
- ไม่มีการแก้ไขไฟล์ในฝั่งทีมการตลาด (`frontend/components/marketing/`) คงไว้เพื่อรอการ merge ร่วมกับเพื่อนร่วมทีมที่รับผิดชอบส่วนนั้น
- ผลการทดสอบ: Backend auction unit tests 17/17 pass, Frontend tests 11/11 suites (37/37 tests) pass, ESLint สะอาด 0 errors / 0 warnings

**Next action:** พร้อมส่งมอบงานและประสานงาน merge กับเพื่อนร่วมทีมที่ดูแลงานฝั่ง Marketing

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-06

**Status:** Renamed "เคสระดับแอดมิน" to "เคส Trust & Safety" — Complete

**Evidence:**

- เปลี่ยน label ของแท็บ `admin_inbox` ใน `frontend/app/workspace/page.js` เป็น `"เคส Trust & Safety"`
- เปลี่ยนข้อความนำทางใน `frontend/components/support/sections/DashboardSection.js` เป็น `sub="ดูที่เคส Trust & Safety"`
- ผลการทดสอบ: Frontend tests 11/11 suites (37/37 tests) pass, ESLint สะอาด 0 errors / 0 warnings

**Next action:** พร้อมทำงานต่อตามที่ได้รับมอบหมาย

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-07

**Status:** Protect Requester & Prioritize Counterparty in Ticket Moderation (ADM-DEC-019) — Complete

**Evidence:**

- แก้ปัญหาการแบนผิดตัวระหว่างผู้แจ้งปัญหา (Requester) และคู่กรณี (Target) โดยสลับลำดับการ์ดให้แสดงคู่กรณีไว้ด้านบนสุดเป็นเป้าหมายหลักในการจัดการ
- แยกสไตล์ปุ่มชัดเจน: ปุ่มคู่กรณีเป็นสีแดงเด่นชัด `[แบนคู่กรณี]` ส่วนปุ่มผู้ส่งคำร้องปรับเป็นปุ่มรองสีเทาอ่อน `[แบนผู้แจ้ง (ระวัง)]`
- รองรับตั๋วที่ไม่ได้ผูกออเดอร์โดยแสดงกล่องสีส้มพร้อมช่องกรอก User ID ของคู่กรณีด้วยตนเองเพื่อดำเนินการ
- เพิ่มรายละเอียดในโมดอลยืนยัน (ConfirmDialog) ระบุรหัสผู้ใช้และบทบาทชัดเจน พร้อมคำเตือนพิเศษ `⚠️` หากพยายามแบนผู้ส่งคำร้อง
- ปรับตารางคิวเคสแสดงคอลัมน์ `คู่กรณี / ผู้แจ้ง` เพื่อให้เห็นเป้าหมายตั้งแต่ภาพรวม
- ผูก `targetId` ในตั๋ว `#CS-000002` และอัปเดตฐานข้อมูล `reloop_support` รวมทั้ง seed script ให้เรียบร้อย
- ผลการทดสอบ: Frontend tests 11/11 suites (37/37 tests) pass, ESLint สะอาด 0 errors / 0 warnings

**Next action:** นำเสนอผลการแก้ไขและส่งมอบให้ผู้ใช้งาน/ทีมงานทดสอบระบบ

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-07

**Status:** Backend Architecture Refactoring for Trust & Safety (ADM-DEC-020) — Complete

**Evidence:**

- ห่อหุ้มคำสั่งฐานข้อมูลที่ต้องสอดคล้องกันแบบ All-or-Nothing ด้วย `prisma.$transaction` ครบทั้ง `auth-service` (`decideKyc` + `sellerProfile` + `adminAudit`) และ `order-service` (`holdSimulatedFunds`/`releaseSimulatedFunds` + `disputeAudit`) ป้องกันสถานะค้างครึ่งทาง (Inconsistent State)
- บันทึก Audit Trail สำหรับการอนุมัติและปฏิเสธ KYC (`KYC_APPROVED`, `KYC_REJECTED`) ลงใน `adminAudit` อย่างครบถ้วน 100% ปิดช่องว่าง NFR-SP-03
- เพิ่มคำสั่ง `WARN_USER` และ `RESTORE_USER` ลงใน Action Registry ของ Bulk Engine ใน `auth-service` รองรับการ Dry-run, Idempotency และ Batch Limit
- เพิ่ม Timeout 5,000ms พร้อม AbortSignal ใน `productModerationClient.js` รองรับ HTTP 504 อย่างปลอดภัย
- ยกระดับสิทธิ์ของ `TRUST_AND_SAFETY` ใน `support-service` (`assertAccess`) ให้สามารถเปิดดูตั๋วทุกใบในระบบได้โดยไม่ติด 403 แม้จะมีสตาฟฟ์ CS ท่านอื่นรับผิดชอบอยู่
- ผลการทดสอบ: PostgreSQL integration tests ครบทุก Service (`bounded-bulk`, `admin-reports`, `admin-kyc`, `admin-hold`, `moderation`, `ticket-lifecycle`) ผ่าน 100%, Frontend tests (11/11 suites, 37/37 tests) pass, ESLint สะอาด 0 errors / 0 warnings

**Next action:** นำเสนอผลการ Refactor ให้ผู้ใช้งาน และพร้อมสำหรับการพัฒนาในเฟสถัดไป

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-07

**Status:** Frontend Trust & Safety Architecture & UX Refactoring (ADM-DEC-021) — Complete

**Evidence:**

- ปรับปรุง `KycSection.js`: เพิ่มฟิลเตอร์สถานะ (`PENDING`, `VERIFIED`, `REJECTED`, `ALL`), Pagination, ครอบคำตัดสินใจด้วย `ConfirmDialog`, แจ้งเตือนผลลัพธ์ผ่าน `useToast`, และปรับการ์ดข้อมูลผู้ขายด้วย `Badge`
- ปรับปรุง `AuditSection.js`: เปลี่ยนหัวข้อเป็น "Audit Log ของ Trust & Safety" และคอลัมน์เป็น "ผู้ดำเนินการ (Staff ID)", แก้ไขฟิลด์ `actorId`/`targetId`/`reason`, เพิ่ม Pagination, Dropdown Action Filter และช่องค้นหา Target ID
- ปรับปรุง `ProductsSection.js`: ปรับสถานะเป็น "ถูกระงับโดย Trust & Safety", เพิ่ม Pagination สำหรับผลการค้นหาสินค้า และแจ้งเตือน Toast เมื่อกู้คืนสินค้า
- ปรับปรุง `AdminDisputeDetailPage.js`: เพิ่ม `ConfirmDialog` สำหรับการระงับเงิน (`Hold`) และปล่อยเงิน (`Release`) พร้อมปรับข้อความเตือนให้สอดคล้องกับ Trust & Safety
- ปรับปรุง `AdminInboxSection.js`: ปรับข้อความโมดอลยกระดับเคสเป็น "ส่งต่อให้ทีม Trust & Safety?"
- ผลการทดสอบ: Frontend unit tests 11/11 suites (37/37 tests) pass, ESLint 0 errors / 0 warnings สะอาดทั้ง monorepo

**Next action:** ส่งมอบงานให้ผู้ใช้งานและพร้อมสำหรับการทดสอบระบบบนหน้าจอจริง

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-09-08

**Status:** Unified Search Center & Direct Moderation (ADM-DEC-022) — Complete

**Evidence:**

- เปลี่ยนหน้าแท็บ "ค้นหาออเดอร์" สู่ "ศูนย์ค้นหาข้อมูล Trust & Safety (Unified Search Center)" โดยมี dropdown ตัวเลือก 4 ประเภท: รหัสคำสั่งซื้อ (`orderId`), รหัสผู้ซื้อ (`buyerId`), รหัสผู้ขาย (`sellerId`), และรหัสผู้ใช้ทั่วไป (`userId`) พร้อม dynamic placeholder และปุ่มล้างคำค้นหา
- แสดงการ์ดข้อมูลโปรไฟล์ผู้ใช้ฉบับเต็ม: ชื่อ, อีเมล, โทรศัพท์, สิทธิ์ผู้ใช้, สถานะบัญชี (`ACTIVE`/`SUSPENDED`), ปุ่มคัดลอก User ID, สถิติความปลอดภัย 3 ด้าน (`reportCount`, `warningCount`, `suspensionCount`) และข้อมูลร้านค้า KYC (`sellerProfile`)
- เพิ่มการดำเนินการควบคุมความปลอดภัยโดยตรงบนการ์ดผู้ใช้: `[ตักเตือนผู้ใช้ (Warn)]`, `[ระงับบัญชี (Ban)]`, และ `[ปลดการระงับ (Restore)]` ควบคุมด้วย `ConfirmDialog` ที่บังคับระบุเหตุผลเพื่อบันทึกลง Audit Log และแจ้งเตือนผลผ่าน Toast พร้อมรีเฟรชข้อมูลทันที
- แสดงประวัติคำสั่งซื้อที่เกี่ยวข้องกับผู้ใช้ และเพิ่มปุ่มทางลัด `[ตรวจสอบผู้ซื้อ]` / `[ตรวจสอบผู้ขาย]` บนการ์ดคำสั่งซื้อเพื่อสืบค้นข้อมูลต่อได้ทันทีในคลิกเดียว
- พัฒนา Backend Endpoint `GET /admin/users/:id` ใน `auth-service` พร้อมฟังก์ชัน `getUserDetail(identifier)` รองรับการค้นหาจาก ID, Email และชื่อร้านค้า
- ผลการทดสอบ: Frontend unit tests 11/11 suites (37/37 tests) pass, ESLint 0 errors / 0 warnings สะอาดทั้ง monorepo, Shared RBAC tests (4/4 pass)

**Next action:** ส่งมอบงานให้ผู้ใช้งานตรวจสอบและทดสอบการใช้งานจริง

> Updated: 2026-09-18 — TSR-01 / ข้อ 1 Ban enforcement

**Status:** In progress — ได้รับอนุญาตเฉพาะทำให้ Ban ระงับการใช้งานจริง

**Scope:** login/refresh, protected API ของทุก service ผ่าน shared middleware, session เดิมหลัง Ban/Restore และข้อความแจ้งผู้ใช้

**Approach:** ใช้ RefreshToken.id เป็น sid, ตรวจสถานะจาก Auth ทุกคำขอ, เพิกถอน session/Audit แบบ atomic; ดู ADM-DEC-023

**Verification:** Pending — จะใช้ฐาน PostgreSQL ทดสอบแยกและทดสอบ gateway/direct service; ยังไม่อ้างว่าทำงานครบ

**Remaining plan:** Hold/Release, Inbox, KYC UI, Audit UI, role UI และ workflow อื่นยังไม่เริ่ม

> Updated: 2026-09-19 — ข้อ 1 Ban enforcement เท่านั้น

**Status:** Implementation complete; targeted verification passed; ยังไม่ rollout Docker stack หลัก

**Completed:** ปิด login/refresh ของบัญชีถูกระงับ, ตรวจ session จริงที่ Auth/Gateway/shared middleware, เพิกถอนทุก session พร้อม Audit แบบ atomic, ป้องกัน login แข่งกับ Ban, Restore ต้อง login ใหม่ และ Frontend แสดงเหตุผลการระงับโดยไม่ logout เมื่อ Auth ขัดข้องชั่วคราว

**Evidence:**

- Backend targeted: 30/30 passed, 0 skipped — `account-suspension.integration.test.js`, Auth register-login/multi-role/admin-reports/bounded-bulk/admin-kyc, shared authMiddleware/permissions/sessionValidation และ Gateway app tests
- Ban integration: 8 scenarios + parent test รวม 9 ผ่าน ใช้ PostgreSQL แยกและ HTTP Auth จริง ครอบคลุม active/legacy sessions, RBAC/self-ban denial, multi-session Ban, Restore, pre-rollout suspended account, concurrent login/Ban, audit failure rollback และ Auth unavailable ผ่าน Gateway/direct services
- Frontend: `node ../node_modules/jest/bin/jest.js --runInBand --coverage=false` จาก frontend ผ่าน 12/12 suites, 46/46 tests รวม API session tests ใหม่ 9 รายการ
- Lint: `node node_modules/eslint/bin/eslint.js backend frontend scripts` ผ่าน; `git -c core.whitespace=cr-at-eol diff --check` ผ่าน (ไฟล์เดิมส่วนใหญ่ใช้ CRLF)
- ฐานทดสอบใช้ PostgreSQL ชั่วคราวแยกบน `127.0.0.1:55439/tsr01_test` เฉพาะ Auth schema; การรันยืนยันตั้ง `DATABASE_URL_AUTH` และ `REQUIRE_INTEGRATION=1` ไม่ใช้ฐานหลัก

**Known verification limits:**

- Backend broad run: 123 tests = 111 passed / 7 failed / 5 skipped ไม่ใช่ผลผ่านทั้งระบบ; 5 failures เป็น Product schema ที่ไม่มีในฐานทดสอบ และ 2 Checkout failures ยืนยันซ้ำด้วย test + middleware ก่อนแก้แล้วล้มเหลวเหมือนกัน
- Lint `.` ยังมี 10 errors ในไฟล์ untracked เดิมภายใต้ `.codex_tmp_review_comments`; ไม่อยู่ในงานนี้
- ยังไม่ได้ทดสอบผ่าน browser หรือ rebuild/restart Docker stack หลัก; ต้องใช้ Auth/Gateway/shared consumers/Frontend รุ่นนี้ร่วมกันเพื่อให้พฤติกรรมใหม่มีผล ดู runtime config ใน ADM-DEC-023 addendum
- คำขอที่ผ่าน auth ก่อน Ban commit อาจทำงานต่อจนจบได้; ไม่ได้ยกเลิกธุรกรรมที่เริ่มไปแล้ว

**Scope stop:** หยุดที่ข้อ 1 Ban enforcement ตามคำสั่งผู้ใช้ ไม่เริ่ม Hold/Release, Inbox, KYC/Audit UI, role UI หรือข้ออื่น และไม่ถือว่า TSR-01 ส่วน role UI เสร็จแล้ว

- Test cleanup (2026-09-19): ลบ container/volume `ise-tsr01-postgres` และไฟล์ baseline ชั่วคราวของงานนี้แล้ว ไม่แตะ container ของ stack หลัก

> Updated: 2026-09-19 — Ban browser-QA seed

**Status:** Seed implementation complete; รอผลการรันกับ local Docker stack และ browser-flow smoke check

**Fixtures:** Trust & Safety `trust.ban@test.local` และเป้าหมาย Buyer `buyer.ban@test.local` ใช้รหัสผ่าน `BanDemo123!` ทั้งคู่ รันด้วย `npm run seed:ban-demo` ใน auth-service

**Reset behavior:** ตั้งสองบัญชีเป็น ACTIVE, sync legacy role + UserRole และ revoke session เก่า; ไม่ลบ AdminAudit เดิม

**Scope:** ใช้ยืนยันข้อ 1 ผ่านหน้าเว็บเท่านั้น ไม่เพิ่มฟีเจอร์ moderation อื่น

> Updated: 2026-09-20 — TSR-02 Complete Hardening & Full Concurrency Verification (10 Review Priorities Passed 100%)

**Status:** TSR-02 Remediated, Verified, and Complete on PostgreSQL Database

**Completed Requirements & Hardening (10/10):**

1. **Mandatory Claim before writing/deciding case:** บังคับตรวจสอบ `assignedTo === userId` ทั้งใน `disputeService.decide` และ `addEvidence` สำหรับเจ้าหน้าที่; เคสที่ `assignedTo === null` เป็น read-only (ตอบ 403 Forbidden); เคสที่ escalate แล้ว T&S ต้อง Claim ก่อนจึงจะตัดสินได้; UI ทั้งใน `DisputeDetailPanel.js` และหน้าเคสเดี่ยว `/support/cases/[id]` ซ่อนและล็อกฟอร์มการตัดสินจนกว่าจะ Claim สำเร็จ
2. **Atomic CAS on Order state transitions:** ทั้ง `openDispute()` และ `decide()` อัปเดต `Order` ผ่าน conditional CAS (`tx.order.updateMany({ where: { id, version: expectedVersion, status: expectedStatus } })`) ตรวจสอบ affected rows (`count === 0`) และคืน 409 Conflict หากสถานะหรือ version เปลี่ยนพร้อมกัน; กำจัด `tx.order.update({ where: { id } })` ออกจาก state transition สำคัญทั้งหมด 100%
3. **Payment flow hardening:** guard hold/dispute และ Order CAS ทำงานร่วมกับ transactional `ProductSyncEvent` outbox; Order transition กับ event commit ใน transaction เดียวกัน, worker retry จน Product service ตอบรับ, API คืน 202 เมื่อ projection ยัง pending และ client retry event เดิมได้; Product reservation completion รองรับ retry แบบ idempotent
4. **Idempotent backfill & anomaly audit:** backfill re-read Order/Dispute/Hold ภายใน transaction ต่อรายการ, ใช้ Order version/status/dispute-status CAS, เก็บ `preDisputeStatus` ก่อนเปลี่ยนเป็น disputed และใช้ unique nullable `dedupeKey` ป้องกัน concurrent backfill สร้าง Hold ซ้ำ จึงไม่สามารถชุบ dispute ที่ถูกตัดสินหลัง initial scan กลับมาได้
5. **Validate Reassign target & multi-role actor:** ตรวจสอบผู้รับโอนเคสผ่าน Auth ว่ามีตัวตน, ACTIVE และมี CS/T&S role; actor authorization ใช้ `req.userRoles` จึงรองรับ staff role ที่เป็น secondary role; internal Auth lookup มี timeout 5 วินาทีและไม่รับ `toRole` จาก client
6. **Define Order statuses eligible for Hold:** กำหนดสถานะคำสั่งซื้อที่ T&S มีสิทธิ์ Hold ได้อย่างชัดเจน (`confirmed`, `shipped`, `completed`, `disputed`); ปฏิเสธสถานะ `pending`, `pending_payment`, `cancelled`, `refunded` (400 Bad Request) และบังคับตรวจใน atomic CAS transaction
7. **Clean legacy hold fields:** ใน `adminDisputeService.releaseSimulatedFunds` เคลียร์ `heldBy: null` ควบคู่กับ `heldAt: null` และ `holdReason: null` เพื่อให้ `paymentSimulationStatus`, `payoutHeld`, และ active `OrderHold` สอดคล้องกันเสมอ
8. **Real Concurrency Integration Tests (Promise.all):** เพิ่ม integration tests ใน `backend/services/order-service/test/dispute-ownership-hold.integration.test.js` จำลองการแข่งขันพร้อมกันจริงผ่าน `Promise.all` 5 scenarios:
   - 2 agents concurrent Claim race (หนึ่ง 200, หนึ่ง 409)
   - 2 admins concurrent Hold race with same version (หนึ่ง 200, หนึ่ง 409)
   - Dispute Decision vs T&S Hold race on Order CAS (หนึ่ง 200, หนึ่ง 409)
   - Hold eligibility + Concurrent Pay race (หนึ่ง 200, หนึ่ง 409)
   - Reassign vs Decision race on Dispute (หนึ่ง 200, หนึ่ง 409)
9. **Ownership test flow update:** ปรับ test flow ของการ escalate เป็น Escalate → T&S Claim → Decide อย่างสมบูรณ์ พร้อมทดสอบว่า unassigned CS/T&S ไม่สามารถตัดสินหรืออัปโหลดหลักฐานได้ (403 Forbidden)
10. **Post-verification documentation:** เอกสาร `remediation-plan.md`, `progress.md`, และ `changelog.md` ได้รับการอัปเดตหลังจากทดสอบผ่าน 100% บน PostgreSQL จริง

**Verification Evidence:**

- Primary Integration Suite (`REQUIRE_INTEGRATION=1 node --test test/dispute-ownership-hold.integration.test.js`): **10/10 tests passed (0 skip, 0 fail)** รวม Product service failure → persisted outbox → retry สำเร็จ และ multi-role queue access
- Negative integration-gate check: บังคับ `REQUIRE_INTEGRATION=1` กับ DB ที่เข้าไม่ได้แล้ว suite **exit 1, 0 skipped**
- Full Integration Suites:
  - `admin-hold.integration.test.js`: **1/1 passed**
  - `dispute-decision.integration.test.js`: **2/2 passed**
  - `evidence-access.integration.test.js`: **1/1 passed**
  - `support-lookup.integration.test.js`: **1/1 passed**
- Unit Tests:
  - `disputeOwnership.test.js`: **6/6 passed**
  - `holdBackfillService.test.js`: **3/3 passed**
  - `orderTransitionService.test.js`: **7/7 passed**
  - `productSyncService.test.js`: **2/2 passed**
  - `authClient.test.js`: **1/1 passed**
  - Product `reservationService.test.js`: **3/3 passed**
  - `checkoutService.test.js`: **2/2 passed**
- Full Backend Suite: `npm test` → **128 passed, 0 failed, 19 skipped** (integration ของ service อื่นที่ไม่มี DB ใน environment นี้)
- Frontend Tests: `npm test` (Frontend Jest): **12/12 suites passed (46/46 tests)**
- ESLint production scope: `npx eslint backend frontend scripts` ผ่าน 0 errors
- Backfill Execution: `scripts/backfillHolds.js` → scanned 63 orders, 0 holds created, 0 ambiguous, 100% idempotent
