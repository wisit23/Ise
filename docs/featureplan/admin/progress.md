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
