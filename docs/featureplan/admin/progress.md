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
5. **Validate Reassign target & role claims:** ตรวจสอบผู้รับโอนเคสผ่าน Auth ว่ามีตัวตน, ACTIVE และมี CS/T&S role; actor authorization อ่าน `req.userRoles` โดย middleware ยังคงบังคับแยก staff/customer identity และอนุญาต staff role เดียว; internal Auth lookup มี timeout 5 วินาทีและไม่รับ `toRole` จาก client
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

- Primary Integration Suite (`REQUIRE_INTEGRATION=1 node --test test/dispute-ownership-hold.integration.test.js`): **10/10 tests passed (0 skip, 0 fail)** รวม Product service failure → persisted outbox → retry สำเร็จ และ valid Customer Service queue access
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
- Full Backend/Integration Suite หลังรวมทุก branch: **469 passed, 0 failed, 1 skipped**; cross-service Support↔Chat ที่ production image ไม่มี `supertest` ยืนยันผ่าน live Gateway/Auth/Support/Chat และฐานข้อมูล exact-once แทน
- Frontend Tests: **45/45 suites passed (239/239 tests)** และ production build สร้าง static pages ครบ 27 หน้า
- ESLint production scope: `npx eslint backend frontend scripts` ผ่าน 0 errors
- Backfill Execution: `scripts/backfillHolds.js` → scanned 63 orders, 0 holds created, 0 ambiguous, 100% idempotent

> Updated: 2026-10-05 — TSR-03 Duplicate/Concurrent Commands, Atomic Audit and Truthful UI

**Status:** Implementation complete; targeted PostgreSQL/concurrency verification passed; runtime browser acceptance remains in TSR-15

**Completed:**

- KYC decisions now use `id + version + PENDING` CAS and update `KycApplication`, `SellerProfile`, and `AdminAudit` in one transaction. Two concurrent decisions produce one success, one 409, and one audit.
- Report review/action now use version/state CAS. Same-database user actions and report/audit finalization are transactional, preventing two staff decisions from both succeeding.
- Added durable `AdminOperation` records for cross-service product moderation. Auth stores operation intent before dispatch; Product stores `ProductModerationCommand` by idempotency key in the same transaction as its Product CAS update.
- REMOVE/RESTORE retries return the stored result for the exact same request, while reuse of a key with a different payload returns 409. A simulated lost response after Product success was recovered by retry without a second Product side effect or duplicate report audit.
- Bulk actions now claim `BulkActionRun` before side effects and bind actor/action/target IDs/reason through a canonical SHA-256 payload hash. Exact replay returns persisted results, concurrent processing conflicts, and per-item failures remain explicit.
- Inbox Ban now calls the single-user suspend endpoint, requires a real reason, and guards double submission. Product restore also requires a reason; the UI keeps the same operation key across failed retry attempts.
- Added Auth migration `20261005090000_tsr03_atomic_operations` and Product `ProductModerationCommand` schema. The complete Auth migration chain applied successfully on a disposable database.

**Verification evidence:**

- Auth TSR-03 integration: `admin-kyc`, `admin-reports`, and `bounded-bulk` **3/3 suites passed** on `tsr03_auth_test`; the report suite includes owner-success/client-timeout/retry recovery.
- Auth/shared/gateway regression selection: **36/36 tests passed**, 0 failed, 0 skipped.
- Product moderation integration: **1/1 suite passed** on `tsr03_product_test`, including replay, key/payload mismatch, reason enforcement, and concurrent different-key CAS.
- Auth migration deployment: **6/6 migrations applied** on `tsr03_migration_test`.
- Frontend: **45/45 suites, 238/238 tests passed**; production build completed with 27 static pages.
- Source quality: targeted ESLint passed and `git -c core.whitespace=cr-at-eol diff --check` passed.

**Next action:** Start TSR-04 product visibility/lifecycle remediation. Do not claim the urgent phase complete until removed products are hidden and non-purchasable through every public path and browser/runtime acceptance is captured under TSR-15.

## 2026-10-07 — Auth ER alignment correction

**Status:** Implementation and disposable-PostgreSQL verification complete; main-stack rollout pending.

- Auth Prisma now resolves to exactly 16 tables from `ER_auth.drawio`.
- Added the missing `role` and `shop_change_request_items` tables plus missing Buyer/Profile fields.
- Removed Auth-only structures not present in the approved design: `admin_operations`, `reports.version`, and extra Bulk columns.
- Refactored shop-change requests to normalized item rows while preserving the frontend response contract.
- Added migration `20261007130000_align_auth_er_design` and updated role/demo seeds.
- Auth container now runs the `prisma/migrate.js` deployment wrapper instead of lossy `db push`. It baselines a legacy db-push volume before `prisma migrate deploy`, preserving the shop-change data transformation.
- Verification: all 6 migrations applied on `auth_er_design_test_20261007`; database-to-schema diff reported no difference and PostgreSQL contained exactly the 16 approved tables. The legacy db-push baseline path also applied successfully on a second disposable database.
- Tests: targeted Auth tests 17 passed/0 failed/1 skipped; PostgreSQL integration 8/8 passed (`admin-kyc`, `admin-reports`, `bounded-bulk`, `executive-audit`); role/demo seed, targeted ESLint, formatting, and diff checks passed.
- Remaining: apply to the main `reloop_auth` environment and complete browser acceptance with the main stack.

## 2026-10-08 — TSR-04 Product Visibility and Lifecycle Remediation

**Status:** Core implementation and targeted verification complete; main-stack browser acceptance remains in TSR-15

**Completed:**

- Product moderation is an independent overlay (`moderatedAt`) over the current commerce status. Public detail, feed, search, store, filter options, video feed and auction reads exclude moderated products even when reservation/order/auction transitions change the underlying status.
- Added permission-gated staff detail/search routes. Sellers can still inspect their own moderated listing and reason, but seller update/delete/visibility and new video attachment are blocked with guarded writes.
- Seller dashboard/edit/upload-video UI now treats moderated listings as read-only, displays the moderation reason and removes invalid edit/upload actions.
- Reservation, campaign quote/hold, auction submit/bid and swipe-choice paths reject moderated products. Auction auto-open/close now uses expected-state plus unmoderated-product CAS so a stale lifecycle callback cannot overwrite a Trust & Safety cancellation.
- Restore derives the result from the current reservation/auction/commerce state. An auction with a winning order stays `reserved` until Order service reports payment/cancellation; expired or released cart reservations restore as `available`.
- No Prisma schema, migration or database-design file was changed as part of this TSR-04 continuation.

**Verification evidence:**

- Product moderation PostgreSQL integration: **1/1 passed**, covering public feed/detail/search/store/video, staff/owner access, seller mutation guards, reservation/checkout blocking, lifecycle overlay, replay/concurrency and state-aware restore.
- Targeted Product unit suites: **82/82 passed** for auction, product video, reservation and campaign paths.
- Product HTTP app tests: **10/10 passed**.
- Product PostgreSQL regression: catalog, CRUD, reservation, campaign and auction steps 1–7/9–10 passed; the pre-existing real BullMQ delayed-worker step timed out waiting for Redis execution and is not a TSR-04 assertion failure.
- Seller UI targeted Jest: **2/2 passed**. Full frontend run loaded **36 suites / 175 tests successfully**, while 10 suites could not load because installed `node_modules` is missing declared packages `socket.io-client` and `qrcode`.
- Targeted ESLint passed.

**Known boundary:** Existing media files remain directly reachable through public `/uploads/*` URLs when the URL is already known. Revoking direct media delivery requires a private-storage/signed-URL or CDN-purge policy outside the current Product visibility layer; no database schema change was attempted.

**Next action:** Start TSR-05 Inbox search/pagination/error-state remediation. Main-stack browser click-through and the complete acceptance matrix remain in TSR-15.

## 2026-10-08 — TSR-05 Inbox Contract and Detail (schema-frozen scope)

**Status:** Inbox implementation complete within the fixed-schema boundary; Report category/evidence acceptance remains blocked

- Split the Trust & Safety inbox into independent Report and escalated Ticket sub-tabs. Each preserves its own query, status, page and total instead of merging pages from two services.
- Report list now accepts `page`, `limit`, `status` and `q`; search covers report/reporter/target/product IDs, reason, and reporter name/email. An explicit empty status means all, while omitted status remains backward-compatible as OPEN.
- Service failures remain visible with source-specific retry. Opening a row fetches current detail rather than acting on a stale list snapshot.
- Report detail includes reporter/counterparty identity and safety counts, a user-history shortcut, product detail through an authenticated internal Product owner API, and the persisted decision/reason/actor/time from AdminAudit.
- Verification: frontend Inbox Jest **4/4**, Auth report-service unit **3/3**, Product moderation PostgreSQL integration **1/1**, targeted Prettier passed.
- Auth PostgreSQL suite could not reach the TSR-05 assertions because the existing disposable DB and generated Prisma contract disagree on `User.role` (`ADMIN`). No schema push, migration, or regeneration was performed.
- Fixed-schema limitation: `Report` has no category or evidence metadata/relation. Private evidence upload/download with authorization cannot be implemented durably without an approved persistence design; no data was packed into `reason` as a workaround.

**Next action:** Decide whether to authorize a schema/storage contract for Report categories/evidence. Otherwise continue TSR-06 while keeping TSR-05 marked partial.

## 2026-10-08 — TSR-06 KYC Storage, Atomic Submission and Document Audit (schema-frozen scope)

**Status:** Implementation complete within the fixed-schema boundary; historical profile snapshot and runtime persistence acceptance remain open

- KYC queue now distinguishes omitted status (legacy PENDING default) from explicit `status=ALL`; frontend sends ALL rather than encoding it as an empty query.
- Auth KYC storage is configurable through `KYC_STORAGE_DIR` and mounted as `auth_private_kyc` in Compose. Current running-container inventory found 0 DB-backed documents and 0 files, so no existing file migration is required before this rollout.
- Added `kyc:inventory`, a non-destructive DB/filesystem comparison with optional safe copy from a prior storage directory. Missing DB-backed files cause a non-zero result and orphan files are reported, not deleted.
- Submission now keeps the bounded upload in memory through validation, persists it immediately before a user-serialized DB transaction, commits role/profile/application together, and removes the new file if DB work fails.
- Authorized document reads verify that the file exists and append `KYC_DOCUMENT_VIEWED` to AdminAudit. Missing/legacy files render an unavailable state with seller-resubmission guidance.
- Historical application rows explicitly label joined SellerProfile data as current data. True per-submission snapshots cannot be persisted because the fixed `KycApplication` schema has no snapshot fields.
- Verification: KYC backend unit **5/5**, targeted Auth **22 passed / 0 failed / 1 DB-dependent skip**, frontend KYC/Inbox/API **15/15**, targeted ESLint/Prettier and `docker compose config` passed.
- PostgreSQL KYC integration remains blocked before its assertions by the same existing `User.role` test DB/Prisma drift; no DB push, migration or client regeneration was performed.

**Next action:** TSR-07 can proceed under the same schema boundary. Keep TSR-05 evidence and TSR-06 application snapshots explicitly partial unless persistence changes are authorized.

## 2026-10-08 — TSR-07 Decision-Ready User History (schema-frozen scope)

**Status:** Implementation complete within the fixed-schema boundary; Auth PostgreSQL and browser/runtime acceptance remain open

- Order service now owns a paginated `/support/users/:id/history` contract for buyer, seller, or combined history. It returns authoritative totals, per-status counts, buyer/seller counts and `completedOrders` defined strictly as `Order.status=completed`.
- The order history UI no longer merges two first pages or uses the displayed row count as the total. It separates loading, unavailable-with-retry and genuine empty states, and exposes previous/next page controls.
- Missing shipping facts stay explicit: late-shipment and package-issue metrics are `null` with availability flags and the UI says they await TSR-10 rather than rendering zero.
- Auth exposes paginated Report and Warning/Suspend/Restore histories. Request IDs correlate user sanctions back to their source Report audit, and the workspace deep link opens the current report detail in the Trust & Safety inbox.
- General user lookup no longer selects or returns full ID card, bank account or address fields. Those remain confined to the KYC workflow.
- Verification: Order PostgreSQL integration **1/1 passed** with two-page fixture, authoritative counts and `<2s` route assertion (the test body completed in 309.335 ms); Auth history/PII unit **2/2 passed**; frontend Orders/Inbox **7/7 passed**; targeted ESLint passed.
- Auth PostgreSQL integration is still blocked before TSR-07 assertions by the existing disposable DB/generated-client drift on `User.role` (`ADMIN`). No schema push, migration, client regeneration or schema-file edit was performed.

**Next action:** Start TSR-08 Audit search/export contract remediation. Keep production-like performance and browser click-through acceptance in TSR-15.

## 2026-10-09 — TSR-08 Owner Audit Search and Traceability (schema-frozen scope)

**Status:** Implementation complete within the fixed-schema boundary; durable operational-error correlation and browser/runtime acceptance remain open

- Corrected the UI action catalog to real persisted events, including `USER_WARNED`, `KYC_VERIFIED`, `KYC_REJECTED`, `REMOVE_PRODUCT` and `RESTORE_PRODUCT`.
- Auth audit now filters by actor, target, exact action, request ID and date range, and returns the shared source/event/actor/action/target/case/reason/time/reference shape.
- Added permission-gated owner read contracts for Order Hold audits, Order Dispute audits and Support Ticket audits. Each source retains its own page and total; no cross-database join or merged-page pagination was introduced.
- The Audit workspace has separate Auth, Hold, Dispute and Ticket sources, source-specific actions, loading/error/empty/retry states and deep links back to Report, user history, Order and Ticket records.
- Evidence access remains distinguishable as `VIEW_EVIDENCE` or `EVIDENCE_VIEWED`; ordinary case opens are not mislabeled as file access.
- Verification: backend contract unit **5/5 passed**; frontend Audit/Orders/Inbox **11/11 passed**; targeted ESLint passed. Read-only PostgreSQL checks returned Auth USER_WARNED=1, Order Hold=91, Order Dispute=390 and a valid empty Support STATUS_CHANGE query.
- Fixed-schema boundary: Support exposes its existing `dedupeKey` as an operation reference when present, but Order audit rows have no request/operation ID and there is no durable owner table for provider/network operational errors. The UI shows unavailable for missing references; no values were hidden in reason or unrelated fields.
- No Prisma schema, migration or database-design file was changed in TSR-08.

**Next action:** Start TSR-09 Workspace Ticket/FAQ/Dashboard remediation. Keep browser/main-stack and production-like performance acceptance in TSR-15.

## 2026-10-10 — TSR-09 Ticket, FAQ and Dashboard Workspace (schema-frozen scope)

**Status:** Core workspace acceptance implemented; FAQ audit persistence and main-stack browser acceptance remain open

- Ticket drawer now fetches current detail, renders the persisted thread, sends customer replies and clearly marked internal notes, and exposes every allowed lifecycle step: IN_PROGRESS, PENDING_USER, RESOLVED and CLOSED.
- Status writes require the loaded ticket version and return conflict on stale data. Escalated tickets have a versioned T&S/Admin takeover route that preserves the old/new assignee in append-only HANDOFF audit history.
- Requester reads continue to filter internal notes. Internal notes no longer count as the first customer-facing response.
- Support now owns one exact dashboard aggregate for totals/status/priority and an 8-day zero-filled trend; the graph no longer derives from the first 50 queue rows.
- Auth owns pending KYC/open Report summary and Order owns Dispute status/active T&S Hold summary. Dashboard keeps owner failures as Unavailable (not zero), links to each queue and supports retry.
- FAQ supports edit, publish and unpublish with optimistic version checks using existing fields. No unrelated Ticket audit table was reused for FAQ events.
- Remaining user-facing Admin escalation copy was changed to Trust & Safety.
- Verification: Support PostgreSQL integration **3/3 passed**, including internal-note privacy, pending/resume/resolve/close, stale-version conflict, exact aggregate, T&S takeover audit and FAQ edit/publish/unpublish. Frontend support Jest **24/24 passed** and Next production build passed all 27 generated pages/routes.
- No Prisma schema, migration, generated client or database-design file was changed in TSR-09.
- Fixed-schema limitation: HelpArticle has version/status fields but no FAQ audit relation/table. Durable actor/action audit for FAQ edit/publish/unpublish cannot be added without an approved persistence contract; this extension remains partial. Chat-service was unavailable during integration, so Ticket database workflow passed while real-time conversation browser acceptance remains in TSR-15.

**Next action:** Start TSR-10 evidence, buyer-seller Chat history and shipment facts. Do not treat Ticket replies as buyer-seller chat history.

## 2026-10-10 — TSR-10 Dispute Evidence, ORDER Chat and Shipment Facts (schema-frozen scope)

**Status:** Evidence and buyer-seller Chat acceptance implemented; carrier/tracking/receipt facts remain unavailable under the fixed Order schema

- Hold detail now reuses the exact `DisputeEvidence` records from its linked `DisputeCase`. Legacy `AdminDisputeEvidence` remains clearly labeled as a reference and is not exposed as a raw trusted file URL.
- Evidence is streamed only through the authorized Dispute endpoint. Successful opens append `VIEW_EVIDENCE`; a missing backing file returns 404 and appends `EVIDENCE_MISSING`. Opening the Hold page itself no longer pretends a file was viewed.
- Chat internal contract now validates ORDER context, supports bounded cursor pagination and streams attachments through a scoped internal route. Order service verifies T&S/Admin case ownership and exact buyer/seller participants, removes storage keys from responses and records history/attachment access or provider failure in Dispute audit.
- The Workspace Dispute drawer renders read-only buyer/seller history, older-page loading and authorized attachment opening. It distinguishes no ORDER conversation from an empty transcript.
- Chat runtime now starts without `prisma db push`; future create-or-open calls use a deterministic Mongo `_id` derived from the context key so the existing `_id` uniqueness provides race safety without adding an index/schema change.
- Shipping output is deliberately honest: it exposes persisted Order status and created/updated timestamps with `available=false`, null carrier/tracking number and a reason. It does not claim live carrier integration or infer shipped/received timestamps.
- Verification: Order PostgreSQL integration **3/3 passed**; Chat Mongo integration **14/14 passed** after deterministic identity handling; targeted Chat unit **10/10 passed**; frontend Chat **2/2 passed**; Next production build compiled and generated all **27** pages. The combined Audit/Chat Jest run had Chat pass while one pre-existing Audit date-filter timing assertion failed; TSR-10 production build and targeted test remain green.
- No Prisma schema, migration, generated client or database-design file was changed for TSR-10.
- Fixed-schema limitations: Order has no carrier, tracking number, shippedAt or receivedAt, so real package tracking and a receipt-aware dispute window cannot be implemented safely. Legacy admin evidence lacks a private storage key. Existing historical duplicate Chat context rows are not deleted; deterministic IDs prevent new duplicates, while cleanup or a unique context-key index would be data/schema maintenance.
- Browser click-through on the full main stack remains part of TSR-15.

**Next action:** Start TSR-11 request-info/deadline flow. Preserve fixed-schema truthfulness and do not encode missing recipient/question/reply linkage into unrelated fields.

## 2026-10-10 — TSR-14 Bulk Account Actions UI (schema-frozen scope)

**Status:** UI implementation and frontend verification complete; current PostgreSQL/Audit acceptance blocked by Auth DB/generated-client drift

- Added a Trust & Safety/Admin-only `Bulk Actions` Workspace section for the backend-supported `WARN_USER`, `SUSPEND_USER` and `RESTORE_USER` actions. No bulk auction control was added.
- Accepts newline, whitespace or comma-separated account IDs, removes duplicates and blocks more than 100 accounts before an API request.
- Requires a real reason and a current dry-run before confirmation. The preview explicitly warns that account state can change before execution and shows success/failure plus reason for every account.
- A write receives a client-generated operation key that remains attached to the exact action/IDs/reason. An ambiguous network result is replayed with the same key and payload; a completed partial failure can retry only failed IDs with a new key prefixed by the original operation key.
- Displays the operation ID, retry origin, aggregate counts and per-account persisted backend outcomes. Audit remains owner-generated by the existing Warn/Suspend/Restore handlers; the UI does not synthesize audit rows.
- Verification: frontend Jest **3/3 passed** for cap/dry-run/partial result/failed-only retry/same-key replay; Next production build compiled and generated all **27** pages.
- PostgreSQL integration was run with `REQUIRE_INTEGRATION=1`. The database was reachable, but fixture creation failed before bulk assertions because the existing generated client cannot decode test DB `User.role=ADMIN`. This is the previously documented Auth DB/client drift; no db push, migration, client regeneration or schema edit was used to bypass it.
- No Prisma schema, migration, generated client or database-design file was changed for TSR-14.
- Fixed-schema limitation: the retry relationship has no dedicated parent-operation column. It is durably represented inside the new idempotency key prefix and surfaced in the UI, but cannot be queried as a typed relation. Full Gateway/browser/Audit acceptance remains in TSR-15 after the Auth runtime contract is healthy.

**Next action:** Keep TSR-11–13 pending as requested. Continue with TSR-15 only if the user chooses full-flow acceptance, without changing the database schema.

## 2026-10-10 — TSR-15 Integrated Acceptance (schema-frozen, partial)

**Status:** Partially Verified / Blocked; ไม่ปิดงานเป็น Done

- แก้ test fixture ของ Ticket status ให้ส่ง `version: 1` ตาม optimistic-concurrency contract และแก้ Audit date filter ให้สร้าง UTC boundary ที่แน่นอน (`00:00:00.000Z` ถึง `23:59:59.999Z`) แทนการแปลงจาก local timezone
- ผลทดสอบ: backend critical rules **64/64**, Workspace frontend **29/29**, Product PostgreSQL **3/3**, Order PostgreSQL **16/16**, Support PostgreSQL **4/4**, Chat Mongo/Redis **82/82** และ Next production build **27/27 pages/routes** ผ่าน
- Gateway authorization ยืนยัน response ตาม role สำหรับ KYC, Report, Dispute, Hold, Ticket และ Bulk dry-run; browser desktop ยืนยัน T&S Dashboard/Bulk/Audit จาก Auth/Order/Support และยืนยันว่า CS ไม่เห็นเมนู KYC, T&S cases, Products, Audit หรือ Bulk
- NFR-P-01 บน demo data ขนาดเล็กผ่านทุก sample: สูงสุด Report search 97 ms, Order history 46 ms, Auth dashboard 32 ms, Order dashboard 22 ms และ Support dashboard 53 ms จาก 5 ครั้งต่อ endpoint; ยังไม่ใช่ production-like benchmark
- Auth PostgreSQL integration **0/5** ถูกบล็อกก่อน assertions ด้วย Prisma `P2032`: test DB มี legacy `User.role=ADMIN` แต่ generated client คาด current contract; ไม่ db push, migrate, regenerate client หรือแก้ schema เพื่อหลบปัญหา
- Order/Support integration ใช้ฐาน dev พร้อม fixture ที่ self-clean เพราะไม่มีฐานทดสอบแยกของสอง service จึงเป็น partial isolation ไม่ใช่ full isolated acceptance
- ไม่ recreate Product/Order/Support containers เพื่อพิสูจน์ persistence เพราะ Dockerfile ยังมี `prisma db push --accept-data-loss`; การทำเช่นนั้นขัด schema-frozen constraint
- Mobile browser, Buyer/Seller click-through, multi-role browser fixture และ production-like load ถูกบันทึกเป็น Deferred/Blocked ไม่อ้างว่าผ่านจาก unit test หรือ API test แทน
- ไม่มีการแก้ Prisma schema, migration, generated client หรือ database-design file ใน TSR-15; TSR-11–13 ไม่ถูกแก้ไข

**Next action:** ต้องมี Auth test fixture/client contract ที่สอดคล้องกันโดยไม่ใช้ schema mutation, แยก Order/Support test DB, เปลี่ยน unsafe container startup contract และเตรียม mobile/multi-role/production-like fixtures ก่อนจึงปิด TSR-15 ได้

## 2026-10-10 — TSR-13 Role-Scoped Commerce Restriction (schema-frozen, partial)

**Status:** Current restriction/enforcement implemented; durable appeal workflow remains blocked

- ใช้ค่า string ที่มีอยู่แล้วใน `User.status` เป็น current authoritative scope: `RESTRICTED_BUYER`, `RESTRICTED_SELLER` และ `RESTRICTED_ALL_COMMERCE`; ไม่แก้ Prisma schema หรือ migration
- บัญชีที่ถูกจำกัดยัง login/refresh/read ได้ ขณะที่ live session validation ส่งสถานะล่าสุดผ่าน Gateway ไปทุก owner service จึงบล็อก token เก่าหลังคำสั่งมีผลได้
- เพิ่ม staff API สำหรับเพิกถอนและคืนสิทธิ์ตาม role พร้อมเหตุผลและ Auth `AdminAudit`; เพิ่มปุ่มใน user lookup, action filter ใน Audit และ banner ให้ผู้ใช้เห็น scope/เหตุผล
- บล็อก write path หลักของ Seller ใน shop/KYC, Product, video และ auction; บล็อก Buyer ใน bid, campaign claim, create/pay/checkout; auction auto-close ตรวจสถานะผู้ชนะและผู้ขายจาก Auth ก่อนสร้าง Order
- คง read access, dispute/support access และการจัดการภาระผูกพันของออเดอร์เดิมไว้ ไม่ใช้การจำกัด commerce เป็น full account ban
- กัน `SUSPENDED` ไม่ให้เขียนทับ `RESTRICTED_*` เพราะ schema เดิมเก็บสองสถานะพร้อมกันไม่ได้; เจ้าหน้าที่ต้องคืน restriction ก่อนใช้ emergency full suspension
- Verification: backend policy/service/session/report/checkout/auction targeted **37/37 passed**, frontend Orders/Audit **6/6 passed**, targeted ESLint/Prettier ผ่าน และ Next build compile ผ่าน แต่ static generation หยุดด้วย environment heap OOM หลัง compile
- Fixed-schema blocker: ไม่มี sanction/appeal relation จึงยังทำ sanction ID/case/evidence linkage, หลาย sanction พร้อมกัน, appeal submission/review/history, one-open-appeal constraint และ durable in-app notification ไม่ได้ โดยไม่ใช้ field ผิดประเภท

**Next action:** หากคง schema เดิม ให้ตรวจ browser Buyer/Seller และยอมรับ TSR-13 เป็น partial เท่านั้น; หากต้องการ flow อุทธรณ์ครบ ต้องอนุมัติ owner persistence contract ก่อน
