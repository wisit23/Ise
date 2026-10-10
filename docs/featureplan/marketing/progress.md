# Marketing Feature Progress

> Owner: ศิวกร วรวัฒน์อมรชัย · Reviewer: อัสนัย เมืองรอด · Updated: 2026-10-08

**Status:** `MKT-001` (Campaign Lifecycle & Voucher Wallet), `MKT-002` (Campaign Workspace & Buyer Hub), `MKT-003` / `MKT-007` (Durable Campaign Attribution & Conversion Metrics Dashboard), `MKT-004 Part A` (Knowledge Base & Articles System), `MKT-005` (Auction Core, Rounds, Soft Close, BullMQ Worker & Idempotency), `MKT-006` (Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling), `UR-11` (Swipe-to-Choose Hardening: Buyer Authorization, Persistence, User Isolation & Anti-Spoofing), `UR-08` (User/Peak-Usage Analytics สำหรับ Marketing: Active Users, New Users, Hourly Usage, Peak Hour & Date Range Filtering), `Marketing Audit Trail` (Append-Only Audit Log for Campaigns, Auctions, and Articles with Atomic Mutation Contracts & SYSTEM Idempotency), และ `Campaign Date Validation & Budget Tracking with Auto-End` (`MKT-DEC-023`: Server-side date boundaries, Atomic spentBudget tracking, auto-end after completed attribution processing, CLAIMED voucher expiry, and Marketing UI budget progress) ตรวจสอบผ่านการทดสอบอัตโนมัติครบถ้วน (Verified with automated tests; รอ commit; ER Diagram update pending); และ `MKT-004 Part B` (Buyer Segmentation Rules) อยู่ระหว่างเตรียม Buyer profile persistence hardening (Part 4)

**Plan coverage:** Explicit trace rows cover `UR-08`–`UR-16` through FR, active/deferred NFR,
`WF-03`, `WF-11`, documented Workflow gaps and `MKT-001`–`MKT-007`

**Confirmed evidence (MKT-005 / UR-11):**

- `AuctionItem`/`Bid` persist in `reloop_product`; full lifecycle
  (`pending_approval → approved → scheduled → open → closed`) implemented in
  `backend/services/product-service/src/features/auctions/`
- Seller sets `startingPrice`/`bidIncrement` at submission (not Marketing); Marketing owns
  `scheduledStartAt`/`scheduledEndAt`, cancel, and approve/reject per `MKT-DEC-009` / `MKT-DEC-014`
  (Admin is fully decoupled from auction approval with 403 Forbidden)
- Bids are serialized per-auction with a Postgres advisory lock (`pg_advisory_xact_lock`) so
  concurrent bids can't both win a tie; idempotency key prevents duplicate bids on retry
- Safe Idempotency Key Scoping: `validateIdempotentBid` verifies `auctionId`, `bidderId`, and `amount`,
  returning 409 Conflict on mismatch and returning existing bid on exact retry even after closed
- Auctions close at their exact `scheduledEndAt` via a BullMQ delayed job (Redis), not only when
  someone happens to visit the page afterward — verified with real BullMQ worker execution and
  bounded polling in `auction.integration.test.js`
- Anti-sniping soft close: bids in the last 5 minutes extend `scheduledEndAt` by +5m and reschedule
  the BullMQ close job in Redis ($\Delta < 2000\text{ms}$)
- Auction Round Overlap Protection & Deterministic Selection:
  - กำหนดช่วงเวลาของรอบเป็น Half-Open Interval $[submissionStartsAt, auctionEndsAt)$ อย่างเคร่งครัด
  - อนุญาตให้เปิดรอบแบบ Back-to-Back ได้เมื่อ `new.submissionStartsAt === existing.auctionEndsAt`
  - ป้องกันการสร้างรอบซ้อนทับด้วย PostgreSQL Two-Integer Advisory Lock `pg_advisory_xact_lock(1001, 1)` ส่ง `tx` ครอบคลุมทั้งการตรวจจับความขัดแย้งและคำสั่งสร้าง
  - คืนค่า HTTP 409 Conflict พร้อมระบุชื่อรอบและช่วงเวลาที่ซ้อนทับทั้งภาษาไทยและอังกฤษ
  - เลิกใช้ `createdAt: "desc"` โดยเลือก Active Round ตามเวลาจริง หรือ Nearest Upcoming Round หากไม่มีรอบที่ Active
  - คำนวณ Derived Phase อัตโนมัติ: `upcoming`, `submission`, `waiting`, `auction`, `ended`
  - อัปเดตหน้าจอ Marketing Dashboard (`/marketing`): แสดง Phase Badge, การ์ดรอบปัจจุบัน/รอบถัดไป และตารางประวัติรอบประมูลทั้งหมด (`GET /api/products/auctions/rounds`)
- Auction close automatically creates the winner's Order via an internal
  `order-service` call (`POST /internal/from-auction`) — verified called exactly once, with idempotent re-close
- `SwipeChoice` (UR-11 Swipe-to-Choose Hardening — Completed & Verified):
  - Buyer-only authorization: อนุญาตเฉพาะบทบาท `BUYER` สำหรับ `POST /:id/choose`, `DELETE /:id/choose`, และ `POST /:id/unchoose` โดย Role อื่น (`SELLER`, `MARKETING`, `ADMIN`) ได้รับ 403 Forbidden และ unauthenticated ได้รับ 401 Unauthorized ทั้งใน Route middleware (`requireBuyerRole`) และ Service layer (`isBuyer`)
  - Server-side persistence & Batch Query: `GET /videos/feed` แนบสถานะ `chosen: Boolean(...)` โดยอาศัย batch query Prisma relation include (`choices: { where: { userId }, select: { id: true } }`) ปราศจากปัญหา N+1 query และตัด `choices` relation ออกจาก response เพื่อรักษาความเป็นส่วนตัว
  - User isolation: แยกสถานะ `chosen` เด็ดขาดรายผู้ซื้อ (Buyer B ไม่เห็นสถานะของ Buyer A) และ Guest ได้รับ `chosen: false` เสมอ
  - Anti-spoofing & Optional auth: `optionalAuth` บน public feed เพิกเฉยต่อ Header `x-user-*` เมื่อไม่มี Bearer token และ API Gateway ทำการ strip untrusted `x-user-*` headers ก่อนสร้าง trusted identity headers (gateway header stripping ผ่าน implementation review/lint แต่ยังไม่มี dedicated automated test) ยืนยันว่าการปลอม `x-user-id` ไม่สามารถอ่านสถานะ chosen ของผู้อื่นได้
  - Idempotency & Safe unchoose: `upsertChoice` ป้องกันการสร้างแถวซ้ำใน `swipe_choices` และ `deleteChoice` (`deleteMany`) ป้องกัน 500 error เมื่อยกเลิกเลือกรายการที่ไม่ได้เลือก
  - Frontend persistence & Optimistic rollback: `SwipeVideoCard.js` เริ่มต้นจาก `video.chosen`, ซิงค์เมื่อ refetch, และ rollback เมื่อเกิด API failure
  - SwipeChoice ทำหน้าที่เป็น Bookmark ความสนใจเท่านั้น ไม่ใช่การประมูล (Auction bid) ตาม `MKT-DEC-006` และ `MKT-DEC-021`
  - Automated tests passing: Backend/Gateway targeted tests (29/29 tests: Gateway app tests 5, Product-service app tests 10, ProductVideoRepository tests 2, ProductVideoService tests 12), Frontend swipe component tests (3/3 suites, 42/42 tests: `SwipeVideoCard.test.js` 28/28, `SwipeFeedViewer.test.js` 8/8, `page.test.js` 6/6), และ Real PostgreSQL integration test (`swipe-choose.integration.test.js` 1/1 suite with `REQUIRE_INTEGRATION=1` without skips)
  - หมายเหตุ: Browser E2E และ Responsive testing บนเบราว์เซอร์จริงยังไม่ได้รัน และคงไว้เป็น Final acceptance ที่รอดำเนินการ
- `Marketing Audit Trail` (Append-Only Audit Log for Campaigns, Auctions, and Articles — Completed & Verified):
  - Model `MarketingAuditLog` ใน PostgreSQL ของ `product-service` (`reloop_product`) ผ่าน Prisma schema push & generate พร้อม Indexes: `createdAt`, `[entityType, entityId]`, `action`, `actorId`
  - Action Contract ครบถ้วนทุก Domain:
    - Campaign: `CAMPAIGN_CREATE`, `CAMPAIGN_UPDATE`, `CAMPAIGN_SUBMIT`, `CAMPAIGN_APPROVE`, `CAMPAIGN_REJECT`, `CAMPAIGN_PUBLISH`, `CAMPAIGN_END`
    - Auction: `AUCTION_ROUND_CREATE`, `AUCTION_ITEM_APPROVE`, `AUCTION_ITEM_REJECT`, `AUCTION_ITEM_SCHEDULE`, `AUCTION_ITEM_CANCEL`, `AUCTION_ITEM_CLOSE`
    - Article: `ARTICLE_CREATE`, `ARTICLE_UPDATE`, `ARTICLE_PUBLISH`, `ARTICLE_ARCHIVE`, `ARTICLE_DELETE`
  - Atomic Database Transactions: การบันทึก Audit Log เกิดขึ้นภายใน `tx` เดียวกับ Business Mutation หาก Audit ล้มเหลว Mutation จะถูก Rollback; หาก Mutation ล้มเหลว จะไม่มี Audit Log ถูกบันทึก
  - SYSTEM Actor & Idempotency: เหตุการณ์อัตโนมัติ (`autoExpireCampaigns`, `closeAuction`) บันทึกด้วย `actorId: "SYSTEM"`, `actorRole: "SYSTEM"` พร้อม `idempotencyKey` แบบ Deterministic ป้องกันการบันทึกซ้ำกรณี Worker Retry โดยใช้ `createMany({ data: [...], skipDuplicates: true })` + `findUnique` (`INSERT ... ON CONFLICT DO NOTHING`) ที่ไม่ทำให้ PostgreSQL transaction block ถูก abort ด้วย `25P02`
  - Secret Sanitizer (`sanitizeAuditData`): กรองคีย์ละเอียดอ่อน (`password`, `passwordHash`, `accessToken`, `refreshToken`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `credential`) แบบ Recursive ลึกใน Object และ Array, รองรับ WeakSet ป้องกัน Circular References, และแปลง `Date` เป็น ISO String
  - Read-Only API Contract: `GET /api/products/marketing/audit-logs` (Gateway) และ `GET /marketing/audit-logs` (Direct) ตรวจสอบสิทธิ์ `requireAuth` + `requireMarketingAccess` (อนุญาตเฉพาะบทบาท `MARKETING` เท่านั้น; `BUYER`, `SELLER` และ `ADMIN` ได้รับ HTTP 403 Forbidden per `MKT-DEC-014`, permission bypass ถูกบล็อก), ป้องกัน Anti-Spoofing โดยไม่เชื่อถือ Header `x-user-*` จากไคลเอนต์, และไม่มี Endpoint สำหรับ Write/Update/Delete audit log
  - Bangkok Date Filter Contract: คิวรีช่วงเวลาแบบ Half-Open Interval `[from, to)` ในเวลา `Asia/Bangkok` (+07:00) และ UI แปลงวันที่เป็น `[00:00:00+07:00, next-day 00:00:00+07:00)` พร้อมตรวจสอบ `from <= to`
  - Frontend Panel (`AuditTrailSection.js`): แท็บ "ประวัติการดำเนินงาน" (`audit`, icon `history`) ใน `/marketing` พร้อมการกรอง (Action, Entity Type, Actor ID, Date Range), ตารางพร้อม Action Badges และ SYSTEM Actor Badge, Detail Modal แสดง JSON State, และครบถ้วนทุกสถานะ UI (Loading, Empty, Error with Retry)
  - Automated Tests Passing:
    - Unit tests: 6/6 tests passing (`marketingAuditService.test.js`)
    - PostgreSQL Integration tests: 11/11 tests passing (1 suite + 10 subtests in `marketing-audit.integration.test.js` with `REQUIRE_INTEGRATION=1` without skips)
    - Regression tests: Campaign 11/11 tests, Auction 11/11 tests, Article 1/1 test passing
    - Frontend tests: 19/19 tests passing (`page.test.js` 6/6, `AuditTrailSection.test.js` 13/13)
    - Host Node version: `v22.16.0`
- End-to-end flow verified via unit tests (48/48 passing), frontend Jest tests (7/7 passing), and real PostgreSQL/Redis integration suite
  (`auction.integration.test.js`, 11/11 tests across 10 steps passing)
- Frontend: `/marketing` (schedule/cancel/approve/reject, round management with all-rounds table and phase badges),
  `/seller/auctions` (product creation + auction submission with round lock),
  `/auctions` + `/auctions/:id` (browse/bid with auto-fill min next bid and soft close notice),
  choose button on `SwipeVideoCard` fully wired to backend with optimistic rollback

**Current status & Next steps:**

- `MKT-001`, `MKT-002`, `MKT-004 Part A`: Implemented, tested, and verified.
- `MKT-003`, `MKT-007`: Completed & verified with Transactional Outbox, Prisma facts, and PostgreSQL integration tests across `reloop_order` and `reloop_product`; waiting for commit.
- `MKT-005`: Steps 1–4 are fully accepted with automated PostgreSQL and Redis integration test evidence; `UR-11` Swipe-to-Choose Hardening is completed and verified across unit, component, and PostgreSQL integration tests (Browser E2E / Responsive UI testing is pending final acceptance); Step 5 (commit) is pending explicit user instruction.
- `MKT-006`: Implementation and automated tests are complete (quote-and-hold, concurrency guard, admin decoupling). Waiting only for commit (pending explicit user instruction).
- `UR-08`: User & Peak-Usage Analytics completed & verified across unit, cross-service, PostgreSQL integration, and frontend tests; waiting for commit.
- `Marketing Audit Trail`: Completed & verified across unit, component, and PostgreSQL integration tests (`REQUIRE_INTEGRATION=1` without skips); waiting for commit.
- `MKT-004 Part B`: Source implementation and unit tests exist; buyer profile persistence hardening belongs to Part 4.

**Deferred:** Production campaign authorization, privacy and push-notification security hardening
(Deferred Security Phase)

**2026-08-26 update:** Consolidated `/marketing/layout.js` + `/marketing/auctions` into one
`/marketing/page.js` sidebar panel (same format as CS/Admin) and added a Dashboard overview
section — see `changelog.md`. Also confirmed end-to-end with the real Docker stack that the
Admin auction-approval fix (see `admin/changelog.md`) flows through correctly: an auction
approved by Admin shows up here as "approved, ready to schedule" immediately.

**2026-09-05 update:**

1. แก้ไขบั๊กสินค้าประมูลหลุดไปแสดงผลในหน้าร้านค้าและฟีดสินค้าทั่วไป (`MKT-DEC-008`): กำหนดให้สินค้าที่สร้างเข้าประมูลมีสถานะ `auction` โดยตรง และจัดการ State Transition คืนสถานะเป็น `available` เมื่อปฏิเสธ ยกเลิก หรือไม่มีผู้เสนอราคา พร้อมทั้งปิดการแก้ไข/ลบสินค้าและปิดปุ่มซื้อปกติบนหน้า `/products/:id` — ผ่าน Unit Tests ครบ 22/22 รายการ
2. เพิ่มฟีเจอร์ Auction Rounds & Marketing Approval (`MKT-DEC-009`):
   - เพิ่ม Model `AuctionRound` และเชื่อมต่อกับ `AuctionItem` (Prisma push & generate สำเร็จ)
   - Marketing เป็นผู้กำหนดรอบประมูล (ช่วงรับสินค้า และช่วงเคาะประมูลจริง)
   - ผู้ขายส่งสินค้าได้เฉพาะในช่วงที่เปิดรับสมัคร หากไม่อยู่ในช่วงรับสมัคร ระบบจะล็อกทั้งฟอร์มในหน้า `/seller/auctions` และโยน 400 Bad Request บน API
   - โอนสิทธิ์การอนุมัติและปฏิเสธสินค้าประมูลให้เป็นของ Role `MARKETING` ผ่านหน้าจอแดชบอร์ด `/marketing` โดยตรง โดยสินค้าที่อนุมัติจะตั้งเวลาตามรอบและกลายเป็น `scheduled` ทันที
3. เพิ่มระบบ Anti-Sniping Soft Close Extension (`MKT-DEC-010`):
   - หากมีการเคาะราคาใน 5 นาทีสุดท้ายก่อนเวลาปิดประมูล ระบบจะต่อเวลาออกไปอีก 5 นาที (`+5m`) โดยอัตโนมัติ และต่อเวลาเพิ่มได้เรื่อยๆ หากมีคนเคาะราคาแข่งใน 5 นาทีสุดท้าย
   - ปรับปรุง `auctionService.placeBid` และ reschedule งานใน BullMQ พร้อมป้องกัน idempotent duplicate retry
   - เพิ่มการแสดงผลแจ้งเตือนกติกานี้ในหน้า `/auctions/:id`
4. ปรับปรุง UX หน้ารายละเอียดประมูลฝั่งผู้ซื้อ (`/auctions/:id`):
   - ช่องเสนอราคาจะกรอกราคาขั้นต่ำถัดไปให้อัตโนมัติ (Auto-fill Min Next Bid) เมื่อเปิดหน้า
   - ผู้ซื้อสามารถคลิกเปลี่ยนจำนวนเงินที่ต้องการเคาะราคาได้อย่างอิสระ
   - หากมีการเคาะราคาตัดหน้าขณะเปิดหน้าเว็บอยู่ ระบบจะอัปเดตราคาขั้นต่ำใหม่ลงในช่องทันที ป้องกันการส่งราคาที่ไม่ผ่านเกณฑ์
5. แก้ไขปัญหา Seed Script ใน `auth-service` และทดสอบความพร้อมของบัญชีผู้ใช้งาน:
   - แก้ไขข้อผิดพลาด `Unique constraint failed on the fields: (email)` ที่ทำให้คอนเทนเนอร์ `auth-service` พังเมื่อบูต
   - ปรับปรุงฟังก์ชัน `upsertUser` ให้ตรวจสอบค้นหาตาม `email` ก่อน และซิงก์ `user_roles` พร้อมอัปเดตรหัสผ่านทุกบัญชีเดโมเป็น `password123`
   - ทดสอบล็อกอินสำเร็จครบทุกบทบาทผ่าน API Gateway (`POST /api/auth/login`) พร้อมเปิดให้ผู้ใช้ล็อกอินทดสอบฟังก์ชันประมูลและรอบประมูลจริงได้ทันที

**2026-09-06 update (MKT-004 Part A / UR-14 / FR-5.2.3 / ST-MKT-05):**

- พัฒนาระบบให้ความรู้และบทความ (Knowledge Base & Educational Articles System):
  - เพิ่มโมเดล `Article` ใน PostgreSQL (`reloop_product`) พร้อม GIN Trigram index และ Database trigger อัปเดต `search_text` อัตโนมัติ
  - ใช้อัลกอริทึมค้นหาแบบ Trigram Ranking (`pg_trgm` + `word_similarity` + `ILIKE` fallback) ซึ่งเป็นอัลกอริทึมตั้งต้นของระบบ
  - สร้าง API สำหรับผู้เข้าชมทั่วไป (`GET /api/products/articles`, `GET /api/products/articles/:id`)
  - สร้าง API สำหรับฝ่ายการตลาด (`GET /api/products/articles/marketing/all`, `POST`, `PUT`, `DELETE`) ตรวจสอบสิทธิ์ Role `MARKETING` / `ADMIN`
  - ปรับปรุง `uploadRoutes.js` ให้ Role `MARKETING` อัปโหลดภาพปกบทความได้ และเปิด Public route ใน Gateway
  - ฟรอนต์เอนด์: เมนู "บทความ" บน Navbar (`/articles`), หน้ารายการบทความพร้อมตัวกรองหมวดหมู่และการค้นหาแบบ Real-time, หน้ารายละเอียดบทความ (`/articles/:id`) และแท็บจัดการบทความในแดชบอร์ด Marketing (`/marketing`)
  - ผ่านการทดสอบ Jest Tests (41/41 tests passing) และ Next.js Static Pages Build (24/24 pages)
  - แก้ไขการ Resolve URL ของไฟล์รูปภาพที่อัปโหลดขึ้นเซิร์ฟเวอร์ด้วย `mediaUrl()` ให้แสดงผลรูปภาพปกและรูปภาพในเนื้อหาได้อย่างถูกต้องตรงตามมาตรฐานสถาปัตยกรรมเดียวกับส่วนอื่นๆ ของระบบ

**2026-09-07 update (MKT-005 Race Condition & Order Idempotency Fix):**

- แก้ไขปัญหาคำสั่งซื้อซ้ำซ้อน 2 รายการจากการปิดประมูลพร้อมกัน (Race Condition):
  - สาเหตุเกิดจากการทำงานพร้อมกันในระดับมิลลิวินาทีระหว่าง BullMQ Background Queue กับ Lazy evaluation (`maybeAdvance`) เมื่อมีการอ่านข้อมูลสินค้า
  - ทำการเคลียร์ Order รายการซ้ำที่ค้างชำระในฐานข้อมูลออก คงเหลือคำสั่งซื้อจริงที่ผู้ซื้อชำระเงินเรียบร้อยแล้ว
  - เสริม Idempotency ใน `orderController.createFromAuction` และเพิ่ม helper `findByAuctionId` ใน `orderModel.js`
  - เพิ่มข้อกำหนด Unique Constraint `@unique` บนฟิลด์ `auctionId` ของตาราง `orders` ใน PostgreSQL (`reloop_order`)
  - เพิ่ม Concurrency Guard ดึงสถานะล่าสุด (`findById`) ซ้ำใน `auctionService.closeAuction` ก่อนเริ่มกระบวนการปิดประมูล
  - ผลลัพธ์: ตะกร้าสินค้าแสดงเฉพาะคำสั่งซื้อจริง ไม่มีรายการซ้ำ, หน้ารายการคำสั่งซื้อ (`/orders`) แสดงผลสถานะสำเร็จครบถ้วน, และ Unit Tests ใน `product-service` ผ่านครบ 30/30 รายการ

**2026-09-12 update (MKT-001: Campaign Domain, State Machine & Voucher Wallet System):**

- พัฒนาระบบแคมเปญโปรโมชัน วงจรชีวิตสถานะ (State Machine) และระบบกระเป๋าคูปองส่วนลด (`MKT-001`, `UR-15`, `UR-16`, `WF-11`):
  - **Database Schema (`reloop_product`):**
    - เพิ่มโมเดล `Campaign` (รหัสโค้ดส่วนลด, ชนิดส่วนลด PERCENT/FIXED, เพดานลดสูงสุด, ยอดซื้อขั้นต่ำ, หมวดหมู่ที่ใช้ได้, งบประมาณ, สิทธิ์ใช้งาน, ตัวนับการใช้, สถานะ, วันเริ่ม-จบ, ผู้สร้าง, ผู้อนุมัติ, วันเวลาอนุมัติ, optimistic lock version)
    - เพิ่มโมเดล `UserVoucher` (กระเป๋าคูปองของผู้ซื้อ) พร้อมระดับความปลอดภัย `@@unique([userId, campaignId])` รับประกัน 1 สิทธิ์ต่อ 1 แคมเปญ
  - **Backend Module (`features/campaigns/`):**
    - `campaignRepository.js`: คิวรี Prisma แบบแยกส่วนรองรับการค้นหา, กรองสถานะ, ตรวจสอบคูปอง, และบันทึกการใช้งาน
    - `campaignService.js`: วงจรชีวิตสถานะแบบเคร่งครัด (`draft -> pending_approval -> approved -> published -> ended` / `rejected`), การตรวจสอบความถูกต้องของเงื่อนไขส่วนลดและวันที่, นโยบายการอนุมัติแบบ Option 2 พร้อมบันทึกหลักฐาน Audit Trail (`approvedById`, `approvedAt`), และระบบคัดกรองคูปองอัจฉริยะ (`getApplicableVouchers`) คำนวณส่วนลดตามจริงและจัดลำดับคูปองที่ประหยัดที่สุดขึ้นก่อน
    - `campaignController.js` & `campaignRoutes.js`: รองรับ REST API สำหรับทั้งฝ่ายการตลาดและผู้ซื้อ
  - **Gateway Integration:**
    - เปิด Whitelist ใน `backend/gateway/src/app.js` ให้เส้นทาง `/api/products/campaigns/available` และ `/published` เป็น Public เข้าถึงได้โดยไม่ต้องส่ง Token
  - **Testing & Verification:**
    - สร้าง `test/campaign.integration.test.js` ทดสอบร่วมกับฐานข้อมูล PostgreSQL จริง (`reloop_product`) ผ่านครบ 7/7 การทดสอบย่อย (RBAC, Validations, State Transitions, Rejection Flow, 1-per-user Claim Uniqueness, Smart Compatibility Filter)
    - ทดสอบ End-to-End ผ่าน API Gateway พอร์ต 8080 (Login Marketing -> Create Draft -> Submit -> Approve -> Publish -> Login Buyer -> Claim Voucher -> Duplicate Claim Rejected -> Smart Eligibility Filter) สำเร็จ 100%

**2026-09-12 update (MKT-002: Dual-Side Frontend UI - Marketing Workspace & Buyer Voucher Hub):**

- พัฒนาระบบหน้าบ้านแบบสองฝั่ง (Dual-Side Frontend UI) สำหรับฝ่ายการตลาดและผู้ซื้อ (`MKT-002`, `UR-15`, `UR-16`, `WF-11`):
  - **Marketing Workspace (`/marketing` -> แท็บ "แคมเปญและคูปอง"):**
    - พัฒนา `frontend/components/marketing/sections/CampaignsSection.js`
    - การ์ดสรุป KPI 4 ใบ: แคมเปญทั้งหมด, กำลังเผยแพร่ (Active), รออนุมัติ, และจำนวนสิทธิ์ที่ถูกเก็บไปแล้ว
    - ตารางรายการแคมเปญพร้อม Badge สถานะ (ฉบับร่าง, รออนุมัติ, อนุมัติแล้ว, เผยแพร่อยู่, สิ้นสุดแล้ว, ถูกปฏิเสธ)
    - ฟิลเตอร์ค้นหาชื่อ/รหัสโค้ด และตัวกรองสถานะแคมเปญ
    - ฟอร์ม Modal สร้างและแก้ไขแคมเปญ (กำหนดสิทธิ์แก้ไขเฉพาะสถานะ `draft` เพื่อความปลอดภัย) รองรับการตั้งค่ารหัสคูปอง, ชนิดส่วนลด (เปอร์เซ็นต์ / บาทคงที่), เพดานลดสูงสุด, ยอดสั่งซื้อขั้นต่ำ, หมวดหมู่เฉพาะ, งบประมาณ, สิทธิ์จำกัด, และช่วงวันเริ่ม-สิ้นสุด
    - ปุ่มควบคุมวงจรชีวิตแคมเปญ (Lifecycle Actions): ส่งขออนุมัติ (`submit`), อนุมัติ (`approve`), ปฏิเสธพร้อมระบุเหตุผล (`reject`), เผยแพร่เปิดให้ใช้งาน (`publish`), และปิดสิ้นสุดแคมเปญ (`end`) พร้อม Dialog ยืนยันก่อนดำเนินการ
  - **Buyer Voucher Hub & Wallet (`/campaigns`):**
    - พัฒนา `frontend/app/campaigns/page.js` ศูนย์รวมคูปองสำหรับผู้ซื้อ
    - แท็บ 1 "คูปองที่เก็บได้": ตั๋วคูปองดีไซน์ Ticket Card สวยงาม แสดงรหัส, เงื่อนไขส่วนลด, ยอดขั้นต่ำ, หมวดหมู่ที่ร่วมรายการ, วันหมดอายุ พร้อมปุ่ม 1-Click "เก็บคูปอง" และสถานะ "เก็บแล้ว" / "สิทธิ์เต็มแล้ว"
    - แท็บ 2 "คูปองของฉัน (กระเป๋าคูปอง)": สรุปกระเป๋าคูปองของผู้ซื้อ แสดงสถานะคูปอง (พร้อมใช้งาน / ใช้ไปแล้ว / หมดอายุ) พร้อมปุ่มลัด "ใช้คูปองช้อปเลย" ลิงก์ไปยังหน้ารายการสินค้า
  - **Global Navigation & Profile Menu:**
    - ปรับปรุง `frontend/components/NavBar.js`: เพิ่มเมนู "คูปอง" ใน Navbar หลัก และเพิ่มเมนู "คูปองส่วนลดของฉัน" (`/campaigns?tab=mine`) ในเมนูข้อมูลผู้ใช้
  - **Product Detail Page Voucher Preview (`/products/[id]`):**
    - เชื่อมต่อ `POST /api/products/campaigns/applicable` และ `GET /api/products/campaigns/available`
    - แสดงแบนเนอร์แนะนำคูปองส่วนลดใต้ราคาสินค้า: หากผู้ซื้อถือคูปองที่ตรงเกณฑ์ ระบบจะคำนวณส่วนลดและยอดสุทธิที่ต้องจ่ายจริงให้ทันที พร้อมปุ่มเปิดดูกระเป๋าคูปอง หรือหากยังไม่ได้เก็บคูปอง จะแสดงไฮไลต์โค้ดที่ร่วมรายการพร้อมปุ่มไปเก็บคูปอง
  - **Automated Testing & Build Verification:**
    - สร้าง `frontend/app/campaigns/page.test.js` และ `frontend/components/marketing/sections/CampaignsSection.test.js`
    - ผลการรันทดสอบ: Jest Unit Tests ผ่านครบ 29/29 Suites (137/137 tests passing 100%)
    - Next.js Production Build (`npm run build`) คอมไพล์ผ่านสมบูรณ์ ปราศจากข้อผิดพลาด (Static 26/26 pages)

**2026-09-19 update (Marketing Part 2 — ปิดงาน Auction และเพิ่ม Integration Test — MKT-005):**

- เพิ่ม Integration Test Suite ครบถ้วนใน `backend/services/product-service/test/auction.integration.test.js`:
  - รันกับ PostgreSQL จริง (`reloop_product` บนพอร์ต 5432) และ Redis จริง (พอร์ต 6379)
  - คำสั่งรัน: `$env:REQUIRE_INTEGRATION="1"; $env:REDIS_URL="redis://localhost:6379"; node -r ./scripts/test-shim.js --test backend/services/product-service/test/auction.integration.test.js`
  - ผ่านครบ 10/10 tests (1 suite, 9 subtests) 100%:
    1. Step 1: Seller submit -> persists in PostgreSQL with status 'auction'
    2. Step 2: Admin Decoupling & Marketing Approval -> direct to 'scheduled' และตรวจสอบ BullMQ delayed job ใน Redis โดยตรง (`getJob(auctionId)`)
    3. Step 3: Bidding rules & PostgreSQL persistence
    4. Step 4: Idempotency Key DB constraint prevents duplicate bids on retry
    5. Step 5: Concurrent bidding serialized by `pg_advisory_xact_lock`
    6. Step 6: Anti-Sniping Soft Close extends `scheduledEndAt` by +5m in PostgreSQL และตรวจสอบ BullMQ job reschedule ใน Redis
    7. Step 7: Auction Close with Winner -> calls Order Client once and records `winningOrderId`
    8. Step 8: Real BullMQ delayed worker execution (`startWorker`) ปิดประมูลตามกำหนดเวลาจริง (1.2s), Bounded polling ตรวจสอบ PostgreSQL, ตรวจสอบ Order Client เรียก 1 ครั้ง และ Idempotent re-close
    9. Step 9: No-bid Auction close reverts product status to 'available'
  - Clean up: ใช้ `t.after()` ปรับลำดับการล้างข้อมูลอย่างเข้มงวด: ปิด worker (`stopWorker`) ก่อน -> ยกเลิกงานปิดประมูลใน BullMQ/Redis -> ลบข้อมูลใน PostgreSQL แบบย้อนลำดับความสัมพันธ์ (bids -> auctionItems -> products -> rounds) -> ปิด BullMQ queue และ IORedis connection -> ปิดการเชื่อมต่อ Prisma (`$disconnect`) โดยรวบรวม error ทั้งหมดไว้ใน `cleanupErrors = []` และ throw รายงานข้อผิดพลาดรวมทั้งหมด ไม่ swallow error ด้วย `.catch(() => {})`
  - Mock Scope: Mock เฉพาะ `orderClient.createOrderFromAuction` ภายใน Product-Service เพื่อตรวจ Outgoing Contract (Payload, Order ID, Call Count) โดยไม่ข้ามไปแตะ DB ของ Order Service
- ปรับปรุง `backend/services/product-service/src/features/auctions/auctionService.js`:
  - ตรวจสอบ `idempotencyKey` ซ้ำก่อนตรวจ `minAmount` ใน `placeBid` เพื่อรองรับการ Retry ซ้ำได้อย่างถูกต้อง
  - Scope Idempotency Key อย่างปลอดภัยด้วย `validateIdempotentBid`: ตรวจสอบว่า `existing.auctionId === auctionId && existing.bidderId === userId && existing.amount === bidAmount` หากไม่ตรงกันจะโยน HTTP `409 Conflict` (`"idempotency key reused with different bid parameters"`) และนำการตรวจสอบนี้ไปใช้ใน `P2002` race recovery path ด้วย
  - รองรับการ Retry ด้วยคีย์เดิมหลังจากสถานะการประมูลเปลี่ยนเป็น `closed` แล้ว ให้สามารถดึง Bid เดิมกลับมาได้ถูกต้อง
- ปรับปรุง `backend/services/product-service/src/jobs/auctionCloseQueue.js`:
  - เพิ่มฟังก์ชัน `closeQueue()` เพื่อตัดการเชื่อมต่อ BullMQ Queue และ IORedis อย่างปลอดภัย ไม่ค้าง Process
  - เพิ่มฟังก์ชัน `stopWorker(worker)` เพื่อปิด Worker และ IORedis connection อย่างสะอาด
  - Export `getQueue` เพื่อให้ Integration Test เข้าถึงและตรวจสอบ Delayed Job ใน Redis ได้โดยตรง
- ปรับปรุง `backend/services/product-service/test/auction.integration.test.js`:
  - Step 4: เพิ่มการทดสอบ Regression ครอบคลุมการใช้ idempotencyKey ซ้ำด้วยยอดเงินต่างกัน (409), ผู้ประมูลต่างกัน (409), รหัสประมูลต่างกัน (409), และการ Retry บนประมูลที่ปิดแล้ว (คืน Bid เดิม)
  - Step 6: ยกระดับการ Assert BullMQ Delayed Job ใน Redis ให้คำนวณ `rescheduledJob.timestamp + rescheduledJob.opts.delay` ตรงกับเวลา `updatedAuction.scheduledEndAt.getTime()` ภายในระยะคลาดเคลื่อนไม่เกิน 2 วินาที ($\Delta < 2000\text{ms}$)
- ปรับปรุง `scripts/test-shim.js` และชี้แจงสถานะ `scripts/supertest-shim.js`:
  - ปรับปรุงให้พยายาม resolve `supertest` จากระบบปกติก่อน หากไม่พบจึง fallback ไปยัง `supertest-shim.js`
  - ชี้แจงว่าไฟล์ใน `scripts/` เป็น Workaround สำหรับการรันเทสบนเครื่อง Host ที่ไม่ได้รัน `npm install` ตามกฎข้อที่ 9
- ยืนยัน Unit Test ทั้งหมด:
  - `backend/services/product-service/src/features/auctions/auctionService.test.js` (48/48 tests passing; historical baseline: 39/39 tests)
  - `campaignValidation.test.js` (12/12 passing)
  - `segmentRule.test.js` (7/7 passing)
  - `campaignMetrics.test.js` (Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test; historical baseline: 10/10 passing)
  - `backend/services/product-service/src/controllers/productPayload.test.js` (4/4 tests passing)
  - รวม Unit Tests ของ Marketing ทั้งหมด 84/84 tests passing 100% (Auction Service = 48, Campaign Validation = 12, Segment Rule = 7, Campaign Metrics = 13, Product Payload = 4; รวม 48 + 12 + 7 + 13 + 4 = 84; historical baseline: 71 tests)

**2026-10-03 update (Marketing Task 1 — Durable Campaign Attribution & Outbox Persistence Hardening — MKT-003, MKT-007, UR-09, UR-12):**

- **Database Schemas & Persistence Sync:**
  - **Product Service (`reloop_product`):** เพิ่มโมเดล `CampaignAttribution` ใน `prisma/schema.prisma` (`eventId` @id, `orderId` @unique, `campaignId` index, `completedAt` index, `grossAmount`, `discountAmount`, `netAmount`, `createdAt`) กำหนด `binaryTargets = ["native", "windows", "linux-musl-openssl-3.0.x"]` ทำการ `prisma db push` สร้างตาราง `campaign_attributions` และ `prisma generate` ซิงก์ Client
  - **Order Service (`reloop_order`):** เพิ่มโมเดล `AttributionOutboxEvent` ใน `prisma/schema.prisma` (`id` @id, `orderId` @unique, `campaignId`, `grossAmount`, `discountAmount`, `netAmount`, `completedAt`, `attempts`, `nextAttemptAt`, `processedAt`, `lastError`, `createdAt`, `updatedAt`) เชื่อม Relation เข้ากับ `Order` กำหนด `binaryTargets = ["native", "windows", "linux-musl-openssl-3.0.x"]` ทำการ `prisma db push` สร้างตาราง `attribution_outbox_events` และ `prisma generate` ซิงก์ Client
- **Order Service Transactional Outbox Pattern:**
  - อัปเดต `orderModel.transitionStatusWithProductSync`: สร้างแถว `AttributionOutboxEvent` ร่วมในฐานข้อมูล Transaction เดียวกันแบบ Atomic ทันทีเมื่อออเดอร์เปลี่ยนสถานะเป็น `completed` และมี `order.campaignId` (ออเดอร์ที่ไม่มีแคมเปญจะไม่สร้างแถวใน Outbox)
  - กำจัด Silent Feature-detection: ปรับปรุง `orderModel.js` และ `attributionOutboxService.js` ให้ fail loudly (โยน Error ชัดเจน) หาก Prisma model ขาดหาย เพื่อป้องกันไม่ให้ออเดอร์ที่มี campaign สำเร็จได้โดยปราศจาก outbox durability record
  - สร้าง `attributionOutboxService.js`: รองรับ `deliver` (ส่งออกข้อมูลทั้ง Event Envelope มาตรฐานและ Flat compatibility fields), `processEvent` (บันทึก `processedAt` เมื่อสำเร็จ หรือบันทึก `attempts`, `lastError` และคำนวณ `nextAttemptAt` ด้วย Exponential Backoff เมื่อล้มเหลว), `processPendingEvents` (กวาดส่งแถวที่ค้างและถึงเวลา Retry เป็นแบทช์), และ `startWorker` / `stopWorker`
  - ปรับปรุง `orderController.js`: ทริกเกอร์ `attributionOutboxService.processEvent` ส่งทันทีแบบ Best-effort เมื่อเปลี่ยนสถานะสำเร็จ พร้อม Log error และมอบหมายให้ Worker ช่วย Retry เบื้องหลัง
  - ปรับปรุง `productClient.js`: คำนวณ `getProductServiceUrl()` และ `getInternalToken()` แบบ Dynamic ต่อ Request เพื่อความยืดหยุ่นและการทดสอบในสภาพแวดล้อมต่างๆ
  - อัปเดต `order-service/src/server.js`: เริ่มต้นรัน `attributionOutboxService.startWorker()` เมื่อเปิดเซิร์ฟเวอร์
- **Product Service Metrics & Attribution Deduplication:**
  - Refactor `campaignMetrics.js`: ลบ Dynamic runtime raw SQL `CREATE TABLE` ออกอย่างสิ้นเชิง และใช้ Prisma Client บันทึกลงในตาราง `campaign_attributions`
  - กำจัด Silent In-memory Fallback ใน Production: บังคับให้ `campaignMetrics.js` ในเส้นทาง Production ทำการ Fail loudly (`throw new Error(...)`) หาก Prisma client ขาดโมเดล `campaignAttribution` โดยสงวน In-memory store ไว้เฉพาะ Unit Test Adapter ที่ถูก Inject เข้ามาอย่างชัดเจนเท่านั้น
  - ตรวจจับและ Deduplicate การ Retry ซ้ำ: ทั้งกรณีส่ง Event เดิมซ้ำ (`eventId`) และกรณีคำสั่งซื้อเดิมส่งมาด้วย Event ID ใหม่ (`orderId`)
  - เสริมความปลอดภัย Idempotency และ Identity Conflict:
    - การใช้ `eventId` เดิมซ้ำกับ `orderId` ใหม่ที่มีข้อมูลตรงกันทั้งหมดจะถูกปฏิเสธด้วย HTTP 409 Conflict ทันที เพื่อป้องกัน Identity Spoofing / Event ID reuse
    - คำสั่งซื้อเดิม (`orderId` เดิม) ที่ส่งมาด้วย `eventId` ใหม่พร้อมข้อมูลที่ตรงกันทั้งหมด จะถือเป็น Valid Deduplicated Retry และคืนสถานะสำเร็จแบบ deduplicated (HTTP 200)
    - ครอบคลุมทั้งขั้นตอน Pre-check ก่อนบันทึก และขั้นตอนฟื้นฟู `P2002` Unique Constraint Race Recovery
  - ส่งต่อ Database Error เมื่อทำงานในโหมดฐานข้อมูลจริง (ไม่ swallow error) เพื่อให้ฝั่ง Order Service Outbox ทราบและเข้าสู่กระบวนการ Retry Backoff ได้อย่างถูกต้อง
- **Automated Verification Evidence (Real PostgreSQL with REQUIRE_INTEGRATION=1):**
  - **Genuine Cross-Service PostgreSQL Integration Suite (`order-service/test/cross-service-attribution.integration.test.js`):** ผ่านครบ 9/9 subtests (10/10 tests passing 100%) บน Repository Test Environment:
    1. Order completion in `reloop_order` -> สร้าง `AttributionOutboxEvent` -> HTTP via `productClient` -> Product Service Container endpoint -> `CampaignAttribution` ใน `reloop_product` -> อัปเดต `processedAt` ใน `reloop_order`
    2. Real HTTP delivery via `productClient` ส่งข้อมูลสำเร็จและอัปเดต `processedAt`
    3. Verification in `reloop_product`: บันทึก `CampaignAttribution` ลงตารางจริง
    4. Idempotent Retry: ส่ง Outbox Event ซ้ำ ไม่สร้าง attribution row ซ้ำใน `reloop_product` และคงสถานะ `processedAt`
    5. Conflicting Payload: การส่งข้อมูลขัดแย้ง (`netAmount` เปลี่ยนแปลง) ได้รับ HTTP 409 Conflict จาก Product Service
    6. Identity Conflict: การนำ `eventId` เดิมไปใช้กับ `orderId` ใหม่ คืนค่า HTTP 409 Conflict แม้ตัวเลขจะตรงกันทั้งหมด
    7. Delivery Failure & Backoff: เมื่อปลายทางล้มเหลว (503) บันทึก `lastError` และ `nextAttemptAt` ใน `reloop_order` โดยคง `processedAt = null`
    8. Worker Sweep: `processPendingEvents` กวาดส่งงานที่ค้างผ่าน HTTP ไปยัง Product Service และบันทึกใน `reloop_product` สำเร็จ
    9. Non-campaign Orders: Order ที่ไม่มีแคมเปญไม่สร้าง Outbox Event ใน `reloop_order`
  - **Product Service PostgreSQL Integration Suite (`product-service/test/campaign-attribution.integration.test.js`):** ผ่านครบ 12/12 subtests (13/13 tests passing 100%) บนฐานข้อมูล `reloop_product` จริง:
    1. Security: `POST /internal/campaigns/events/order-completed` ปฏิเสธคำขอที่ไม่มี `x-internal-token` ด้วย 403 Forbidden
    2. Ingestion: บันทึก `order.completed.v1` ลงตาราง `campaign_attributions` จริง
    3. Idempotency: การส่งซ้ำไม่เพิ่มแถวซ้ำในฐานข้อมูล
    4. Idempotency: การส่งคำสั่งซื้อเดิมซ้ำด้วย eventId ใหม่ถูก Deduplicate
    5. Idempotency Conflict: การส่งคำสั่งซื้อเดิมด้วยข้อมูลที่ขัดแย้ง คืนค่า HTTP 409 Conflict
    6. Identity Conflict: การใช้ `eventId` เดิมซ้ำกับ `orderId` อื่น คืนค่า HTTP 409 Conflict
    7. ออเดอร์ที่ไม่มีแคมเปญถูกข้ามอย่างถูกต้อง ไม่บันทึก attribution fact
    8. Metrics: `GET /campaigns/:id/metrics` คำนวณรายได้ ส่วนลด และ Conversion Rate จากข้อมูลจริงใน PostgreSQL
    9. Metrics: `GET /campaigns/metrics/overview` รวบรวมสถิติทุกแคมเปญ
    10. Metrics: `GET /campaigns/metrics/trends` ส่งคืน Daily Time-series
    11. Validation: ตรวจสอบ Date range `from > to` คืน 400 Bad Request
    12. RBAC: ปฏิเสธ Role ที่ไม่ใช่ Marketing (403 Forbidden)
  - **Order Service Outbox PostgreSQL Integration Suite (`order-service/test/campaign-attribution.integration.test.js`):** ผ่านครบ 6/6 subtests (7/7 tests passing 100%) บนฐานข้อมูล `reloop_order` จริง:
    1. Atomic Outbox Event Creation เมื่อ Order เปลี่ยนเป็น `completed` ใน PostgreSQL
    2. ออเดอร์ที่ไม่มี CampaignId ไม่สร้างแถวใน Outbox
    3. Outbox Delivery ส่ง REST Contract พร้อม `x-internal-token` และอัปเดต `processedAt` ใน PostgreSQL
    4. Retry & Backoff: เมื่อปลายทางล้มเหลว (503) อัปเดต `attempts`, `lastError`, `nextAttemptAt` และคง `processedAt = null`
    5. Sweep Recovery: `processPendingEvents` กวาดส่งงานที่ค้างได้สำเร็จเมื่อระบบปลายทางฟื้นตัว
    6. Idempotent Acknowledgment: รองรับคำตอบ `deduplicated: true` ได้อย่างราบรื่น
  - **Unit Tests:**
    - `product-service/test/campaignMetrics.test.js`: Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test (passing 100% ครอบคลุม Fail-loud in production path, Identity Conflict, และ `P2002` Race Recovery)
    - `order-service/src/services/attributionOutboxService.test.js`: ผ่าน 7/7 subtests (8/8 tests passing 100% ครอบคลุม Fail-loud durability)
    - `order-service` Unit Tests รวมทั้งหมด: ผ่านครบ 53/53 tests 100% ปราศจาก Regression
    - รวม Marketing Unit Tests ทั้งหมด: 84 total tests passing 100% (Auction Service 48 + Campaign Validation 12 + Segment Rule 7 + Campaign Metrics 13 + Product Payload 4 = 84; historical baseline: 71 tests)

**2026-10-04 update (UR-11: Swipe-to-Choose Hardening — Completed & Verified):**

- **ความต้องการและการรักษาความปลอดภัย (Requirements & Hardening):**
  - **Buyer-Only Authorization:** บังคับสิทธิ์เฉพาะผู้ใช้บทบาท `BUYER` (ทั้ง `req.userRole === "BUYER"` และ `req.userRoles.includes("BUYER")`) สำหรับเอนด์พอยต์ `POST /:id/choose`, `DELETE /:id/choose`, และ `POST /:id/unchoose` โดยบทบาท `SELLER`, `MARKETING`, `ADMIN` ถูกปฏิเสธด้วย HTTP `403 Forbidden` และผู้ที่ยังไม่เข้าสู่ระบบถูกปฏิเสธด้วย HTTP `401 Unauthorized` ทั้งระดับ Route Middleware (`requireBuyerRole`) และ Service Layer (`isBuyer`)
  - **Server-Side Persistence & Batch Query (No N+1):** ปรับปรุง `productVideoRepository.listAvailable` ให้รับ `userId` และดึงสถานะการเลือกผ่าน Prisma relation include `choices: { where: { userId }, select: { id: true } }` รวดเดียวใน Batch Query โดยไม่เกิดปัญหา N+1 query พร้อมแมปเป็น `chosen: Boolean(...)` และตัด relation `choices` ออกจาก Response สาธารณะทั้งหมด
  - **User Isolation & Guest Handling:** แยกสถานะ `chosen` เด็ดขาดระหว่างผู้ซื้อแต่ละคน (Buyer B จะไม่เห็นสถานะที่ Buyer A เลือก) และ Guest ที่ไม่มี Token จะได้รับ `chosen: false` เสมอทุกรายการ
  - **Client Identity Anti-Spoofing & Optional Authentication:**
    - เอนด์พอยต์สาธารณะ `GET /api/products/videos/feed` รองรับ Optional Auth แต่ไม่เชื่อถือ Header `x-user-id` หรือ `x-user-role` ที่ส่งมาจากภายนอกโดยไม่มี Bearer Token (กำหนด `userId = null` เสมอหากไม่มี Token ที่ถูกต้อง)
    - API Gateway (`backend/gateway/src/app.js`) ทำการลบ (Strip) Inbound Headers ที่ขึ้นต้นด้วย `x-user-` ทั้งหมดจากไคลเอนต์ภายนอกทิ้งทันทีก่อนเริ่ม Route Request เพื่อให้มั่นใจว่า Trusted Identity Headers จะถูกสร้างขึ้นโดย Gateway หลังตรวจ Token สำเร็จเท่านั้น (ผ่านการตรวจสอบ Implementation review และ Lint แล้ว โดยยังไม่มี Dedicated automated test สำหรับ Gateway header stripping)
  - **Idempotency & Safe Unchoose:**
    - `upsertChoice`: บันทึกลงตาราง `swipe_choices` แบบ Idempotent ผ่าน Prisma `upsert` บน Composite Unique `@@unique([productVideoId, userId])` รับประกันการเลือกซ้ำไม่สร้างแถวซ้ำ
    - `deleteChoice`: ใช้ `deleteMany` จัดการการยกเลิกเลือกรายการที่ยังไม่ได้เลือกอย่างปลอดภัย ส่งคืน `{ chosen: false }` โดยไม่เกิดข้อผิดพลาด HTTP 500
  - **Frontend Persistence & Optimistic Rollback:**
    - `SwipeVideoCard.js`: เริ่มต้นสถานะการเลือกจากการ์ด `video.chosen` และเพิ่ม `useEffect` ซิงค์สถานะเมื่อ `video.chosen` เปลี่ยนแปลงหลังการ Refetch
    - ทำ Optimistic Update ทันทีเมื่อผู้ใช้คลิก และหากการเรียก API ล้มเหลว (Network Failure / 403 / 500) จะทำการ Rollback กลับสู่สถานะก่อนหน้าทันที
  - **Decoupled Semantics:** ยืนยันตาม `MKT-DEC-006` และ `MKT-DEC-021` ว่า `SwipeChoice` ทำหน้าที่เป็นเพียง Bookmark ความสนใจของผู้ซื้อเท่านั้น ไม่มีความสัมพันธ์กับการประมูลสินค้า (Auction) และไม่ใช่การเสนอราคา (Bid)
- **หลักฐานการทดสอบอัตโนมัติ (Automated Verification Evidence):**
  - **Backend & Gateway Targeted Tests:** ผ่านครบ 29/29 tests 100%
    - Gateway App Tests (`backend/gateway/src/app.test.js`): ผ่าน 5/5 tests (ครอบคลุม Gateway auth routing และ Public routes; สำหรับ header stripping ผ่าน implementation review/lint แต่ยังไม่มี dedicated automated test)
    - Product Service App Tests (`backend/services/product-service/src/app.test.js`): ผ่าน 10/10 tests
    - Product Video Repository Tests (`backend/services/product-service/src/features/product-videos/productVideoRepository.test.js`): ผ่าน 2/2 tests (ครอบคลุม Guest chosen: false, User-specific chosen, และการตัด choices relation ออกจากผลลัพธ์)
    - Product Video Service Tests (`backend/services/product-service/src/features/product-videos/productVideoService.test.js`): ผ่าน 12/12 tests (ครอบคลุม 403 สำหรับ SELLER, MARKETING, ADMIN, Multi-role BUYER, และ Pagination forwarding)
    - รวม Backend & Gateway Targeted Tests: 5 + 10 + 2 + 12 = 29 tests
  - **Frontend Swipe Component Tests:** ผ่านครบ 3/3 suites (42/42 tests passing 100%)
    - `SwipeVideoCard.test.js`: ผ่านครบ 28/28 tests (ครอบคลุม Initial render จาก `video.chosen`, Refetch sync, และ Rollback เมื่อ API error ทั้ง Choose และ Unchoose)
    - `SwipeFeedViewer.test.js`: ผ่านครบ 8/8 tests (ครอบคลุมการเลื่อนดูคลิป, Touch swipe, Desktop navigation, และ Query sync)
    - `page.test.js`: ผ่านครบ 6/6 tests
  - **PostgreSQL Integration Test (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/product-service/test/swipe-choose.integration.test.js`: ผ่าน 1/1 suite (10 verification assertions) บน PostgreSQL `reloop_product` จริง ปราศจากการ Skip:
      1. 401 Unauthorized บน `POST /choose`, `DELETE /choose`, `POST /unchoose` เมื่อไม่มี Token
      2. 403 Forbidden สำหรับ `SELLER`, `MARKETING`, `ADMIN` ทุกคำสั่ง
      3. 200 OK และบันทึกลงตาราง `swipe_choices` จริงสำหรับ `BUYER`
      4. Idempotency: การเลือกซ้ำไม่สร้างแถวซ้ำในฐานข้อมูล (`count === 1`)
      5. Guest Feed: ทุกรายการได้รับ `chosen: false`
      6. Buyer A Feed: รายการที่เลือกได้รับ `chosen: true`
      7. User Isolation: Buyer B เห็นรายการที่ Buyer A เลือกเป็น `chosen: false`
      8. Identity Anti-Spoofing: ส่ง Header `x-user-id: ur11-buyer-a` โดยไม่มี Bearer Token ได้รับ `chosen: false` ไม่สามารถอ่านข้อมูลผู้อื่นได้
      9. Safe Unchoose: Unchoose รายการที่ไม่ได้เลือกไม่เกิด HTTP 500
      10. Unchoose สำเร็จ: ลบแถวออกจากฐานข้อมูลและฟีดอัปเดตเป็น `chosen: false`
  - **Quality Gates & Code Formatting:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100% (All matched files use Prettier code style!)
    - `git diff --check`: ผ่าน 100% (ไม่มีข้อผิดพลาด whitespace)
- **หมายเหตุการตรวจรับ (Pending Acceptance Note):**
  - การทดสอบอัตโนมัติระดับ Backend, Frontend Component, และ PostgreSQL Integration สมบูรณ์และผ่านการตรวจรับครบถ้วนแล้ว
  - การทดสอบ Browser E2E / Responsive UI verification บนเบราว์เซอร์จริงยังไม่ได้ดำเนินการ และคงสถานะเป็น Final Acceptance ที่รอดำเนินการต่อไป

**2026-10-05 update (UR-08: User/Peak-Usage Analytics สำหรับ Marketing — Completed & Verified):**

- **ความต้องการและขอบเขต (Scope & Requirements):**
  - แสดงผลสถิติผู้ใช้งานและช่วงเวลาการใช้งานสูงสุดบน Marketing Dashboard (`/marketing`) ตามช่วงวันที่เลือก
  - ตัวชี้วัดสำคัญ 4 รายการ:
    1. Active Users (จำนวนผู้ใช้ที่ไม่ซ้ำกัน [distinct users] ที่มีกิจกรรมจากแหล่งข้อมูลที่เชื่อถือได้ในช่วงวันที่กำหนด)
    2. New Users (จำนวนบัญชีผู้ใช้ใหม่ที่สร้างขึ้นในช่วงวันที่กำหนด `user.createdAt`)
    3. Hourly Usage Aggregation (การรวมสถิติการใช้งานรายชั่วโมงตาม Asia/Bangkok [+07:00] bucket พร้อมเติมช่วงว่าง [gap filling] เป็น 0 ครบทุกชั่วโมงใน `[from, to)`)
    4. Peak Usage Hour (ช่วงเวลาชั่วโมงที่มีการใช้งานสูงสุดตาม Asia/Bangkok พร้อม deterministic tie-breaking เลือกชั่วโมงแรกสุดกรณีตัวเลขเท่ากัน)
    5. Date-Range Filtering (รองรับช่วงเวลาแบบ Half-Open Interval `[from, to)` จำกัดไม่เกิน 31 วัน โดยช่อง "ถึงวันที่" บน UI เป็น inclusive สำหรับผู้ใช้ และแปลงเป็น 00:00:00+07:00 ของวันถัดไปก่อนส่ง API)
- **Timezone Contract (Asia/Bangkok Enforcement & Date Boundaries):**
  - กำหนด Business Timezone ของ UR-08 เป็น `Asia/Bangkok` (+07:00) อย่างเคร่งครัด
  - API รองรับเฉพาะ timezone `Asia/Bangkok` เท่านั้น และปฏิเสธ timezone อื่นด้วย HTTP 400 Bad Request ทันที
  - จัดการ Timezone ใน PostgreSQL อย่างแม่นยำ: เนื่องจาก Prisma เก็บ `DateTime` เป็น `timestamp without time zone` ใน UTC จึงต้องแปลงผ่าน `(activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'` ก่อนทำ `date_trunc('hour', ...)` และจัดรูปแบบเป็น `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS+07:00')`
  - Gap filling, Peak hour calculation, และการแสดงผลบน Frontend ใช้ timezone `Asia/Bangkok` เดียวกันทั้งหมด โดยไม่มีข้อความ `UTC` ปรากฏบนหน้าจอ
  - ตัวแปลงวันที่ใน Frontend (`convertThaiDateFilterToRange`) รองรับขอบเขตวันข้ามเดือน ข้ามปี และปีอธิกสุรทิน (Leap Year) อย่างแม่นยำ
  - ป้องกันการส่ง Partial request: ไม่ยิง API เมื่อผู้ใช้กรอกเพียง `from` หรือ `to` เพียงค่าเดียว
- **การรักษา Service Boundary และความปลอดภัยข้อมูล (Service Ownership & Anti-PII):**
  - ข้อมูล User และ Activity ทั้งหมดถูกเป็นเจ้าของโดย `Auth Service` โดยตรง (`User`, `LoginLog`, `BuyerActivityLog`) ไม่ให้ Product Service หรือบริการอื่น Query ข้ามฐานข้อมูล
  - API Gateway (`backend/gateway/src/app.js`) ทำหน้าที่ Proxy ไปยัง `GET /api/auth/marketing/analytics/user-usage` โดยตัด Inbound Header `x-user-*` ทิ้ง ป้องกันการทำ Header Spoofing และตรวจสอบสิทธิ์ผ่าน JWT เท่านั้น
  - อนุญาตเฉพาะผู้ใช้ที่มีบทบาท `MARKETING` (ผ่านทั้ง `userRole` เดี่ยวและ `userRoles` array ในระบบ Multi-role); ผู้ใช้บทบาทอื่น (`BUYER`, `SELLER`) ได้รับ HTTP 403 Forbidden; ผู้ไม่ล็อกอินได้รับ HTTP 401 Unauthorized
  - Response Data Serializer (`serializeUserAnalytics`) ส่งออกเฉพาะ Whitelisted Aggregate Metrics เท่านั้น ปราศจาก PII (ไม่มี email, phone, name, userId, หรือ raw payload ใดๆ)
  - ไม่ใช้ In-memory fallback ใน Production; หากเกิด Database Connection Error ระบบจะ propagate error เป็น HTTP 500 ทันที ไม่กลืน error หรือคืนค่าเลขศูนย์หลอก
- **Frontend Dashboard Implementation & Error State (`DashboardSection.js`):**
  - แยก State `userAnalytics`, `userAnalyticsLoading`, `userAnalyticsError` อย่างเป็นอิสระ
  - การจัดการ Error ซื่อสัตย์ ไม่กลืน HTTP error ให้แสดงเป็นเลขศูนย์:
    - เมื่อ API ล้มเหลว: แสดง Error Banner พร้อมปุ่ม Retry, ค่า KPI แสดง `—` และ `ไม่พร้อมใช้งาน` (ห้ามแสดง 0), Peak Hour แสดง `ไม่พร้อมใช้งาน`, และกราฟแสดง Error Message (ไม่แสดง Empty State)
    - เมื่อ Retry สำเร็จ: ปิด Error Banner และกลับมาแสดงผลตัวเลขจริง
    - เมื่อข้อมูลว่างจริง (Empty State): แสดงผลเลข 0 สำหรับ Active/New Users พร้อมแสดง Empty State Banner
  - Data Visualization: แสดงกราฟแท่ง Hourly Usage (`TrendBarChart`) ควบคู่กับ Accessible Table View (`<details>` สำหรับ screen reader / accessibility)
- **หลักฐานการทดสอบอัตโนมัติ (Automated Verification Evidence):**
  - Backend Unit Tests: `backend/services/auth-service/src/features/metrics/activityMetrics.test.js` ผ่าน 7/7 tests 100% (Range validation, Asia/Bangkok hourly bucketing, Deterministic peak hour tie-breaking, Whitelisted PII prevention, Gap filling, DB error propagation, และ RBAC Multi-role)
  - Gateway Cross-Service Integration Tests: `backend/gateway/src/marketing-analytics.cross-service.test.js` ผ่าน 2/2 tests 100% (Success path ผ่าน Gateway -> Auth Service -> PostgreSQL จริง ได้รับ HTTP 200 OK, ยืนยัน Timezone Asia/Bangkok, ตรวจสอบ No PII, ตรวจสอบ 401/403/400 security guards ครบถ้วน, และยืนยัน Database Error Propagates เป็น HTTP 500 อย่างชัดเจน)
  - PostgreSQL Integration Test: `backend/services/auth-service/test/user-analytics.integration.test.js` ผ่าน 1/1 suite (100% passing, 0 skips) บน PostgreSQL จริง ด้วย `$env:REQUIRE_INTEGRATION="1"` และ fail loud เมื่อ DB ออฟไลน์
  - Frontend Client & UI Tests: `npm run test:frontend -- frontend/components/marketing/sections/DashboardSection.test.js frontend/lib/api.test.js` ผ่าน 30/30 tests 100% (DashboardSection 20/20 tests ครอบคลุม Thai date conversions, Bangkok formatting, Error state ไม่แสดง 0, Empty state, และ Retry; api 10/10 tests)
  - Quality Gates: `npm run lint` ผ่าน (0 errors, 0 warnings), `npm run format:check` ผ่าน (All matched files use Prettier code style!), `git diff --check` ผ่าน

**2026-10-05 update (Marketing Audit Trail: Append-Only Immutable Ledger, Atomic DB Transactions, Marketing-only RBAC, SYSTEM Idempotency & Date Filter Contract — Completed & Verified):**

- **ความต้องการและสถาปัตยกรรม (Scope & Architecture):**
  - ติดตั้งระบบ Marketing Audit Trail แบบ Append-Only Immutable Ledger ใน PostgreSQL `reloop_product` ตาราง `marketing_audit_logs` อ้างอิงตาม `MKT-DEC-022`
  - ครอบคลุม 18 Marketing Actions:
    - Campaign: `CAMPAIGN_CREATE`, `CAMPAIGN_UPDATE`, `CAMPAIGN_SUBMIT`, `CAMPAIGN_APPROVE`, `CAMPAIGN_REJECT`, `CAMPAIGN_PUBLISH`, `CAMPAIGN_END`
    - Auction: `AUCTION_ROUND_CREATE`, `AUCTION_ITEM_APPROVE`, `AUCTION_ITEM_REJECT`, `AUCTION_ITEM_SCHEDULE`, `AUCTION_ITEM_CANCEL`, `AUCTION_ITEM_CLOSE`
    - Article: `ARTICLE_CREATE`, `ARTICLE_UPDATE`, `ARTICLE_PUBLISH`, `ARTICLE_ARCHIVE`, `ARTICLE_DELETE`
  - ห้าม Client สร้าง, แก้ไข หรือลบ Audit Log (Zero Client-facing Write API)
- **การแก้ไขตามผล Code Review (Code Review Resolutions):**
  1. **Marketing-only Authorization (`marketingAuditRoutes.js`):**
     - จำกัดสิทธิ์การอ่าน Audit Log เฉพาะบทบาท `MARKETING` เท่านั้น (`requireMarketingAccess`)
     - ปฏิเสธ `BUYER`, `SELLER` และ `ADMIN` ด้วย HTTP 403 Forbidden ตาม `MKT-DEC-014`
     - ป้องกันไม่ให้ Permission `analytics:read:marketing` หรือ `audit:read:marketing` ทำการ Bypass Role Check ได้
     - ดึง Identity จาก Server-verified JWT Token เท่านั้น; ผู้ไม่ล็อกอินได้รับ 401 Unauthorized และการปลอมแปลง `x-user-role` ได้รับ 403 Forbidden
  2. **SYSTEM Idempotency in PostgreSQL Transactions (`marketingAuditRepository.js`):**
     - แก้ไขปัญหา PostgreSQL Abort Transaction ด้วย `25P02: current transaction is aborted` เมื่อดักจับ `P2002` ภายใน Transaction บล็อก
     - โซลูชัน: ใช้ `createMany({ data: [{ id: crypto.randomUUID(), ...data }], skipDuplicates: true })` + `findUnique` ซึ่งคอมไพล์เป็น `INSERT ... ON CONFLICT DO NOTHING` บน PostgreSQL ทำให้ Transaction บล็อกไม่ถูก Abort และดึงเรคอร์ดที่มีอยู่เดิมกลับมาได้อย่างปลอดภัย 100%
     - Audit ปกติที่ไม่มี `idempotencyKey` ยังคงใช้ `create` และ Fail Loud ตามปกติ
  3. **Bangkok Date Filter & Boundary Contract:**
     - กำหนด Business Timezone เป็น `Asia/Bangkok` (+07:00)
     - UI (`convertAuditDateFilter`) แปลงวันที่แบบ Inclusive เป็นช่วง Half-Open Interval `[from, to)` ในเวลาไทย: `[fromDateT00:00:00+07:00, nextDayT00:00:00+07:00)` และตรวจสอบ `from <= to`
     - Backend คิวรีด้วย `createdAt >= fromDate` และ `createdAt < toDate` (`lt: toDate`)
  4. **Duplicate Declarations Removal & Lint:**
     - ลบฟังก์ชันซ้ำซ้อน `deleteCampaign` ใน `campaignRepository.js` และ `getById` ใน `articleModel.js` โดยคงตัวที่รองรับ `{ tx }` ไว้
     - ผ่าน `npm run lint` 0 errors, 0 warnings
  5. **Integration Test Isolation & Full Coverage:**
     - ขจัด Fixed +500 days offset ด้วย `Math.max(Date.now(), maxExistingRoundEnd) + 1h` ป้องกันการชนกับรอบประมูลที่มีอยู่เดิมเมื่อรันซ้ำ
     - ครอบคลุมการทดสอบครบ 10 Subtests ใน `marketing-audit.integration.test.js`
- **หลักฐานการทดสอบอัตโนมัติ (Automated Verification Evidence):**
  - **Host Node.js Version:** `v22.16.0` (รายงานตามจริง)
  - **Backend Unit Tests:** `backend/services/product-service/src/features/audit/marketingAuditService.test.js` ผ่าน 6/6 tests 100%
  - **PostgreSQL Integration Tests:** `backend/services/product-service/test/marketing-audit.integration.test.js` ผ่าน 11/11 tests (1 parent suite + 10 subtests) 100% บน PostgreSQL จริง (`reloop_product`) ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip
  - **Regression Integration Tests:**
    - Campaign Suite (`campaign.integration.test.js`): ผ่าน 11/11 tests 100%
    - Auction Suite (`auction.integration.test.js`): ผ่าน 11/11 tests 100%
    - Article Suite (`article.integration.test.js`): ผ่าน 1/1 test 100%
  - **Frontend Component Tests:**
    - `frontend/components/marketing/sections/AuditTrailSection.test.js`: ผ่าน 13/13 tests 100%
    - `frontend/app/marketing/page.test.js`: ผ่าน 6/6 tests 100%
    - รวม Frontend Tests: ผ่าน 19/19 tests 100%
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100% (All matched files use Prettier code style!)
    - `git diff --check`: ผ่าน 100% (ไม่มีข้อผิดพลาด whitespace)

**2026-10-08 update (Campaign Date Validation and Budget Tracking with Auto-End — Verified per MKT-DEC-023; ER Diagram Update Pending):**

- **Workflow Confirmation & Core Definition:**
  - ยืนยัน Workflow เดิม 6 สถานะ (`draft → pending_approval → approved → published → ended/rejected`) โดยไม่ต้องเพิ่มสถานะ Scheduled/Live และไม่ขยายขอบเขตไปยัง UR-13
  - กำหนดความหมายของงบประมาณ (Budget): งบประมาณถูกนับเมื่อ Product Service ประมวลผล completed attribution event (`order.completed.v1`) จาก Transactional Outbox ของ Order Service
  - ขอบเขตและความจริง: การตัดงบเป็นการ auto-end after completed attribution processing ไม่ใช่ strict real-time hard cap หรือป้องกันยอดเกินงบ 100% เพราะคำสั่งซื้อสุดท้ายอาจดันให้ยอดรวม `spentBudget` เกิน `budget` ได้เล็กน้อยก่อนที่แคมเปญจะถูก auto-end
- **Server-Side Date Boundaries & Expiry Enforcement:**
  - `createDraft`: ห้ามตั้งช่วงเวลาที่สิ้นสุดไปแล้ว (`endsAt <= now`) และห้ามตั้ง `startsAt` ย้อนหลังในอดีต (`startsAt < now - 60s` อนุญาต clock skew 60 วินาที)
  - `updateDraft`: ตรวจสอบช่วงเวลารวมทั้งค่าใหม่และค่าเดิม ปฏิเสธช่วงเวลาที่สิ้นสุดไปแล้ว และห้ามแก้ `startsAt` ย้อนหลัง
  - `publishCampaign`: ปฏิเสธแคมเปญที่ `endsAt` หมดอายุแล้ว และหากเผยแพร่หลัง `startsAt` แต่ยังไม่ถึง `endsAt` ให้เริ่มใช้งานได้ทันที (`published`)
  - ข้อความแจ้งเตือนทั้งหมดเป็นภาษาไทยที่อ่านเข้าใจง่าย
- **Budget Tracking & Auto-End after Completed Attribution Processing:**
  - เพิ่มคอลัมน์ `spent_budget` (`spentBudget Int @default(0)`) ในโมเดล `Campaign` (`reloop_product`) ผ่าน `prisma db push`
  - เมื่อได้รับ Event `order.completed.v1` ใน `recordOrderCompletedEvent`: ดำเนินการ Atomic Increment `spentBudget: { increment: discountAmount }`
  - หากยอดใช้สะสมถึงหรือเกินเพดานงบประมาณ (`spentBudget >= budget`): เปลี่ยนสถานะ Campaign เป็น `ended` ทันทีภายใน Database Transaction เดียวกัน พร้อมบันทึก `MarketingAuditLog` ดำเนินการโดย `SYSTEM` ระบุ `metadata: { reason: "BUDGET_REACHED" }` และใช้ Deterministic Idempotency Key `CAMPAIGN_END_BUDGET:${campaignId}` ป้องกัน Event Retry นับงบซ้ำ
  - เมื่อแคมเปญ `ended`: คูปองสถานะ `CLAIMED` ที่ยังไม่ได้ใช้จะถูกปรับเป็น `EXPIRED` ทันทีผ่าน `expireClaimedVouchers`
  - แคมเปญที่ `ended` หรือยอด `spentBudget >= budget` จะไม่สามารถ Claim (409), ไม่แสดงใน Applicable Vouchers ([]), validate-discount คืน 400, และ Quote-and-Hold คืน 400
- **Frontend Form Validation & Budget Progress:**
  - ฟอร์มสร้าง/แก้ไขแคมเปญกำหนด `min` บนช่อง `datetime-local` ตามเวลาปัจจุบัน
  - ตรวจสอบความถูกต้องของวันเวลาฝั่ง Frontend ก่อนส่งข้อมูล (endsAt ในอดีต, endsAt <= startsAt, startsAt ในอดีต) พร้อมข้อความแจ้งเตือนภาษาไทย
  - ตารางแคมเปญแสดงข้อมูลงบประมาณในรูปแบบ `"ใช้แล้ว ฿X / ฿Budget"` พร้อมแถบความคืบหน้า (Budget Progress Bar)
- **Automated Verification Evidence:**
  - **Campaign Validation Unit Tests:** `backend/services/product-service/test/campaignValidation.test.js` ผ่านครบ 23/23 tests (1 suite + 22 subtests) 100%
  - **Campaign Metrics Unit Tests:** `backend/services/product-service/test/campaignMetrics.test.js` ผ่านครบ 14/14 tests (1 suite + 13 subtests) 100%
  - **Auction Service Unit Tests:** `backend/services/product-service/src/features/auctions/auctionService.test.js` ผ่านครบ 53/53 tests 100%
  - **Product Service Budget PostgreSQL Integration Suite:** `backend/services/product-service/test/campaign-budget.integration.test.js` ผ่านครบ 6/6 tests (1 suite + 5 subtests) 100% บน PostgreSQL จริง ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip
  - **Product Service Campaign PostgreSQL Integration Suite:** `backend/services/product-service/test/campaign.integration.test.js` ผ่าน 11/11 tests (1 suite + 10 subtests) 100% บน PostgreSQL จริง ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip
  - **Product Service Attribution PostgreSQL Integration Suite:** `backend/services/product-service/test/campaign-attribution.integration.test.js` ผ่าน 13/13 tests (1 suite + 12 subtests) 100% บน PostgreSQL จริง ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip
  - **Order Service Attribution Outbox PostgreSQL Integration Suite:** `backend/services/order-service/test/campaign-attribution.integration.test.js` ผ่าน 7/7 tests (1 suite + 6 subtests) 100% บน PostgreSQL จริง ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip
  - **Frontend Component Tests:**
    - `frontend/components/marketing/sections/CampaignsSection.test.js`: ผ่าน 16/16 tests 100%
    - `frontend/components/marketing/sections/AuctionScheduleSection.test.js`: ผ่าน 8/8 tests 100%
  - **Environment & Quality Gates:**
    - Node.js Runtime: `v22.16.0` (Host)
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `git diff --check`: ผ่าน 100%
  - **Schema/ER Status:** เพิ่มคอลัมน์ `spent_budget` ในตาราง `campaigns` เรียบร้อยแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`) ห้ามถือว่าปิดเอกสารครบ 100% จนกว่าจะอัปเดตแผนภาพ ER

**2026-10-09 update (Auction Round Categories & Atomic Product/AuctionItem Submission — Code Review Resolved per MKT-DEC-024; ER Diagram Update Pending):**

- **Auction Round Categories Configuration (Requirement 1):**
  - เพิ่มคอลัมน์ `categories String[] @default([])` ในโมเดล `AuctionRound` (`reloop_product`) และซิงก์สู่ PostgreSQL จริงด้วย `prisma db push`
  - Marketing สามารถเลือกได้ระหว่าง "รับทุกหมวดหมู่" (`categories: []`) หรือ "เลือกเฉพาะบางหมวดหมู่" (`categories: [...]`)
  - โหลดหมวดหมู่จากตาราง `Category` เดิมของระบบ (`GET /api/products/categories`) ห้าม Hardcode และห้ามสร้างตาราง Category ซ้ำ
  - ตรวจสอบความถูกต้องของหมวดหมู่ว่ามีอยู่จริงในระบบก่อนบันทึก และรักษา Backward Compatibility สำหรับรอบเดิมที่ไม่มีหมวดหมู่ให้ตีความเป็น "ทุกหมวดหมู่"
  - แสดงผลหมวดหมู่ที่เปิดรับทั้งในการ์ดรอบปัจจุบันและตารางประวัติรอบทั้งหมด
- **Pre-creation Validation & Shared Validation Service (Requirement 2):**
  - รวมตรรกะการตรวจสอบสินค้า (`requireSellerRole`, `requireVerifiedSeller`, `validateCreateRequest`, `requireValidMediaCount`, `requireKnownCondition`) ไว้ที่โมดูลกลาง `backend/services/product-service/src/services/productValidation.js`
  - ปรับ Flow ผู้ขายให้ส่ง Request เดียวไปยัง `POST /api/products/auctions` โดย `auctionService` เรียกใช้ validation จากโมดูลกลางโดยตรง (ไม่มี dependency ย้อนทิศทางไปหา controller)
  - Backend ตรวจสอบสิทธิ์ผู้ขาย, การยืนยันตัวตน KYC (`requireVerifiedSeller`), ตรวจสอบรอบที่กำลังเปิดรับสินค้า, ตรวจสอบหมวดหมู่ว่ามีอยู่จริงและรอบเปิดรับ, ตรวจสอบราคาเริ่มต้นและราคาเสนอเพิ่มขั้นต่ำ, ตรวจสอบข้อมูลสินค้า สภาพสินค้า และรูปภาพ (4-8 รูป)
  - หาก Validation ข้อใดไม่ผ่าน ปฏิเสธทันทีด้วยข้อความภาษาไทยที่อ่านเข้าใจง่าย โดยไม่สร้าง Product และไม่สร้าง AuctionItem
- **Atomic Product & AuctionItem Creation with In-Transaction Re-check (Requirement 3):**
  - สร้าง `Product` (`status: "auction"`) และ `AuctionItem` (`status: "pending_approval"`, ผูกกับ `product.id`, `round.id`, และ `sellerId`) พร้อมกันภายใน PostgreSQL Database Transaction เดียวกัน (`runInTransaction`)
  - โหลด `AuctionRound` ซ้ำผ่าน Transaction Client (`tx`) ภายใน Database Transaction เพื่อป้องกันกรณีรอบประมูลหมดเวลาระหว่างขั้นตอนตรวจสอบกับการเขียนข้อมูล หากรอบหมดเวลาหรือไม่อนุญาตหมวดหมู่ ให้ Rollback ทันที
  - หากขั้นตอนใดล้มเหลว Rollback ทั้งหมด ไม่ทิ้ง Product สถานะ auction ตกค้างในฐานข้อมูล
- **Existing Product Flow Backward Compatibility (Requirement 4):**
  - รักษา Flow สมัครประมูลด้วย `productId` เดิม
  - ตรวจสอบสิทธิ์และสถานะสินค้า (`available`/`auction`)
  - ตรวจสอบ `product.category` จากฐานข้อมูลจริงเทียบกับหมวดหมู่ที่รอบเปิดรับ โดยเพิกเฉยต่อ category ที่ Client ส่งมา
  - ตรวจสอบความถูกต้องของรอบภายใน Transaction เช่นกัน
- **Test Fixture Isolation & Clean Cascade Deletion:**
  - ปรับ Integration Test ให้ cleanup เฉพาะ Fixture ID ที่สร้างขึ้นเอง (`createdBidIds`, `createdAuctionIds`, `createdProductIds`, `createdRoundIds`) โดยไม่ใช้ `updateMany` กระทบข้อมูลรอบภายนอก
  - เพิ่ม Assertions ยืนยันหลัง Cleanup ว่าไม่มี Test Fixture ใดตกค้างในฐานข้อมูล
- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0`
  - **Backend Unit Tests:** `backend/services/product-service/src/features/auctions/auctionService.test.js` ผ่านครบ 68/68 tests 100%
  - **PostgreSQL Integration Tests:** `backend/services/product-service/test/auction.integration.test.js` ผ่านครบ 17/17 tests (1 parent suite + 16 subtests รวม Step 11-16: Atomic Creation, Rollback, Category Rejection, Flow A DB Category, Backward Compatibility, และ In-Transaction Round Expiration Rollback) 100% บน PostgreSQL และ Redis จริง ด้วย `REQUIRE_INTEGRATION=1` ปราศจากการ Skip
  - **Frontend Component Tests:**
    - `AuctionScheduleSection.test.js`: ผ่านครบ 11/11 tests 100%
    - `app/seller/auctions/page.test.js`: ผ่านครบ 5/5 tests 100%
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `git diff --check`: ผ่าน 100%
    - `npm run secret-scan`: ผ่าน 100% (0 potential secrets)
  - **Schema/ER Status:** เพิ่มคอลัมน์ `categories` ในตาราง `auction_rounds` เรียบร้อยแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`)

**2026-10-09 update (Marketing Auction Pre-approval UX Improvement — Modal & Photo Inspection):**

- **Overview & UX Improvement:**
  - ปรับปรุง UX สำหรับฝ่ายการตลาดในการตรวจสอบสินค้าก่อนอนุมัติเข้าประมูล (`pending_approval`) ให้สามารถดูรูปภาพทุกมุมและรายละเอียดสินค้าครบถ้วนได้ใน Modal บนหน้า Marketing เดิม โดยไม่ต้องสลับหน้าไปยัง `/products/[id]` และกลับมายังรายการประมูลเดิมได้ทันทีโดยไม่สูญเสีย Status Filter
  - เพิ่มคอมโพเนนต์ `frontend/components/marketing/sections/AuctionReviewModal.js`
  - เพิ่มปุ่ม "ตรวจสอบสินค้า" ในรายการประมูลสถานะ `pending_approval`
  - Gallery รูปสินค้า: แสดงรูปภาพหลักแบบ `object-contain` และ Thumbnails สำหรับสลับดูรูปภาพทั้งหมดที่เรียงตาม `position` จาก API พร้อม Fallback "ไม่มีรูปสินค้า" เมื่อไม่มีรูป และแสดง "ไม่ระบุ" เมื่อข้อมูลบางช่องว่าง
  - Modal Controls: รองรับการปิดด้วยปุ่มมุมขวาบน, ปุ่ม "กลับไปหน้ารายการประมูล", และปุ่ม Escape พร้อมคืน Focus
  - Unified Approve/Reject Actions: เรียกใช้ Handler กลางและ API เดิม (`PATCH /api/products/auctions/:id/approve` และ `reject`) เดียวกันกับปุ่มในรายการเดิม
  - Loading & Error Guard: ป้องกันการกดซ้ำ (Disable buttons), แสดงสถานะ "กำลังอนุมัติ..." / "กำลังปฏิเสธ...", ล็อกไม่ให้ปิด Modal ขณะส่งคำขอ, และแสดงข้อความ Error ภาษาไทยที่เข้าใจง่ายใน Modal หาก API ล้มเหลว
  - Scope: ออกแบบสำหรับ Web Browser บนคอมพิวเตอร์และ Laptop เท่านั้น (1024px - 1920px) ออกแบบ Layout เพื่อไม่ให้เกิด Horizontal Scroll ตั้งแต่ 1024px ขึ้นไป ไม่รองรับ Mobile/Tablet
  - Clean Code & Presentation Sharing: แยก Presentation Constants และ Formatter ที่ใช้ร่วมกันเป็นโมดูลขนาดเล็ก `auctionPresentation.js` (`STATUS_LABEL`, `STATUS_STYLE`, `baht`) ลดความซ้ำซ้อนระหว่าง `AuctionScheduleSection.js` และ `AuctionReviewModal.js`
- **Automated Verification Evidence:**
  - **Frontend Component Tests:**
    - `AuctionScheduleSection.test.js`: ผ่านครบ 29/29 tests 100% (รวม 18 tests ใหม่สำหรับ Review Modal และ UX Flow)
    - Frontend Test Suites รวมทั้งระบบ: ผ่านครบ 50/50 suites (328/328 tests passing 100%)
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npx prettier --check`: ผ่าน 100%
    - `git diff --check`: ผ่าน 100%
  - **Status & Scope Note:**
    - Frontend-only UX improvement: ไม่มีการแก้ Backend Logic, Schema หรือ Database
    - ยืนยันการทำงานผ่าน Automated Component Tests ครบถ้วน โดยยังไม่ได้ยืนยันผ่าน Browser จริง หรือยืนยัน Responsive บนหน้าจอจริง เพราะ localhost:8080 ไม่ได้รันในสภาพแวดล้อมนี้ และไม่ถือว่า Responsive/Browser E2E ผ่านจนกว่าจะเปิดตรวจบน Browser จริง

**2026-10-09 update (Concurrent Auction Rounds & Explicit Round Selection — MKT-DEC-025):**

- **Overview:**
  - ยกเลิกข้อจำกัด Cross-round Overlap Protection ตามมติ MKT-DEC-025 เพื่อให้ฝ่ายการตลาดสามารถสร้างรอบประมูลที่คาบเกี่ยวหรือทับซ้อนเวลากันได้ทุกกรณี
  - พัฒนาระบบการเลือกรอบแบบชัดแจ้ง (Explicit Round Selection) สำหรับผู้ขายและผู้ซื้อ โดยระบบไม่ผูกรอบหรือเปลี่ยนหน้าอัตโนมัติ
  - แยกรายการสินค้าในแต่ละรอบอย่างเด็ดขาด (Round Item Isolation)
- **Backend & Database Implementation:**
  - `auctionRepository.js`: ปลด Cross-round overlap conflict check โดย `findConflictingRound`, `withRoundLock`, `findActiveSubmissionRound` และ `findCurrentRound` ถูกลบออกจาก Production Code แล้ว, เพิ่ม `findActiveSubmissionRounds(now)`, `findActiveAuctionRounds(now)`, `findUpcomingRounds(now)`, และ `findRoundWithItems(roundId)` (กรองเฉพาะ status `open` และ `scheduled`)
  - `auctionService.js`: `createRound` บันทึกรอบและ `MarketingAuditLog` (`AUCTION_ROUND_CREATE`) ร่วมกันแบบ Atomic Transaction, `getCurrentRound` คืน `{ round, phase, isSubmissionOpen, isAuctionActive, activeSubmissionRounds, activeAuctionRounds, nextRound }`, `submit` บังคับ `input.roundId` (ขาดส่งตอบ 400 Bad Request `"กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"`), ตรวจสอบรอบมีอยู่จริง (400), ยังไม่เปิดรับ (400), ปิดรับแล้ว (400), ตรวจสอบหมวดหมู่ตรงกับที่รอบเปิดรับทั้ง Flow A/B พร้อม re-verify รอบใน Transaction Client (`tx`), และเพิ่ม `browseRounds()`, `getRound(roundId)`, และ `listRoundItems(roundId)` (มี lifecycle reconciliation ผ่าน `maybeAdvance` และกรองเฉพาะ visible items)
  - `auctionController.js` & `auctionRoutes.js`: เพิ่ม Endpoints: `GET /rounds/browse`, `GET /rounds/:roundId`, `GET /rounds/:roundId/items`
  - `backend/gateway/src/app.js`: อัปเดต `PUBLIC_PATHS` ให้ครอบคลุม `/^\/api\/products\/auctions(\/.*)?$/`
- **Frontend Implementation (Desktop Web):**
  - `/seller/auctions`: หน้าเลือกรอบแสดง Round Cards สำหรับทุกรอบใน `activeSubmissionRounds` พร้อมปุ่ม "เลือกรอบนี้", แสดง Empty State พร้อมปุ่มโหลดใหม่เมื่อไม่มีรอบ, และแสดงประวัติสินค้าของผู้ขาย (`myAuctions`)
  - `/seller/auctions/submit`: อ่าน `roundId` จาก Query Parameter (ครอบด้วย `<Suspense>`), หากขาด `roundId` หรือรอบปิดรับ แสดงแบนเนอร์แจ้งเตือนและปุ่ม "เปลี่ยนรอบประมูล" และซ่อนแบบฟอร์มลงสินค้า; หากเลือกรอบถูกต้อง แสดงแบนเนอร์สรุปข้อมูลรอบที่เลือก พร้อมปุ่ม "เปลี่ยนรอบประมูล" และส่ง `roundId` ใน Request Payload
  - `/auctions`: หน้ารวมรอบประมูลสำหรับผู้ซื้อ แสดงรอบที่กำลังประมูลและรอบเร็วๆ นี้อย่างชัดเจน ห้าม Auto-navigate แม้มีรอบเดียว พร้อม Empty State
  - `/auctions/rounds/[roundId]`: แสดงข้อมูลรอบ, ปุ่มกลับหน้ารวมรอบ, ปุ่ม "เปลี่ยนรอบประมูล" (Round Switcher Popover พร้อมปุ่ม "ลองใหม่" เมื่อโหลดล้มเหลว และข้อความแจ้งเตือนเมื่อไม่มีรอบอื่น) รองรับ Escape key, และรายการสินค้าเฉพาะรอบนี้แยกกลุ่ม "กำลังประมูล" และ "เร็วๆ นี้"
  - `/auctions/[id]`: แสดงชื่อรอบที่สินค้าสังกัด และลิงก์ "← กลับไปดูสินค้าทั้งหมดในรอบนี้" ชี้ไปยัง `/auctions/rounds/${auction.roundId}`
  - `AuctionScheduleSection.js`: ปรับปรุงข้อความหัวเรื่องให้สอดคล้องกับ MKT-DEC-025 แสดงหลายรอบพร้อมกัน และรองรับการสร้างรอบที่ทับซ้อนเวลาได้
- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0` บนสภาพแวดล้อมจริง (ห้ามอ้างว่ารัน Final Regression บน Node 24)
  - **Backend Unit Tests:** `backend/services/product-service/src/features/auctions/auctionService.test.js` ผ่านครบ **77/77 tests 100%**
  - **PostgreSQL Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `auction.integration.test.js`: ผ่านครบ **18/18 tests (1 suite + 17 subtests)** บน PostgreSQL และ Redis จริง 100% ปราศจากการ Skip ครอบคลุม Step 1-17
  - **Frontend Component Tests:** ผ่านครบ **6/6 suites (52/52 tests passed 100%)** (โดย `app/auctions/rounds/[roundId]/page.test.js` เป็น 7/7 ผ่าน)
  - **Frontend ทั้งระบบ:** ผ่านครบ **54/54 suites (346/346 tests passed 100%)**
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100%
    - Production Build (`next build`): ผ่าน 100%
    - `git diff --check`: ผ่าน 100%
- **Scope & Constraints:**
  - รองรับเฉพาะ Web Browser บนคอมพิวเตอร์และ Laptop (ความกว้างตั้งแต่ 1024px ขึ้นไป ได้แก่ 1024×768, 1366×768, 1440×900, 1920×1080) ไม่ทำ Mobile UI หรือ Mobile Flow
  - Browser E2E และ Responsive บน Browser จริงยังไม่ได้รัน (การแสดงผลทดสอบผ่าน JSDOM และ Integration Tests) เนื่องจาก `localhost:8080` ไม่ได้รันในสภาพแวดล้อมนี้
  - MKT-DEC-025 ไม่มีการเพิ่ม Schema หรือ Migration ใหม่ (การเปลี่ยนแปลง Schema ใน Working Tree เป็นของงาน MKT-DEC-024 เดิม)

**2026-10-10 update (Auction Item & Round Cancellation, Seller Recovery Lifecycle & Round Filter in Marketing Approval — MKT-DEC-026):**

- **Overview:**
  - แยก 3 การกระทำอย่างชัดเจน: (A) ปฏิเสธสินค้า (`ปฏิเสธสินค้า` สำหรับ `pending_approval` บันทึก `AUCTION_ITEM_REJECT`), (B) ยกเลิกรายการประมูลรายสินค้า (`ยกเลิกรายการประมูล` สำหรับ `approved`, `scheduled`, `open` ผ่าน `PATCH /api/products/auctions/:id/cancel` บันทึก `AUCTION_ITEM_CANCEL` โดยไม่กระทบรายการอื่นในรอบเดียวกัน), และ (C) ยกเลิกรอบประมูลทั้งรอบ (`ยกเลิกรอบประมูล` ผ่าน `PATCH /api/products/auctions/rounds/:roundId/cancel` บันทึก `AUCTION_ROUND_CANCEL`)
  - พัฒนา Seller Recovery Lifecycle: เมื่อรายการหรือรอบถูกยกเลิก หรือปิดประมูลโดยไม่มีผู้เสนอราคา (0 bids) สินค้าจะเปลี่ยนสถานะเป็น `auction_action_required` (ห้ามกลับเป็น `available` อัตโนมัติ) โดยเก็บ `AuctionItem` และ `Bid` เดิมไว้เป็นประวัติ และผู้ขายมี 2 ทางเลือกภายใต้ `withProductLock(productId)`: (A) ส่งเข้ารอบใหม่ด้วย `AuctionItem` ID ใหม่ หรือ (B) นำกลับไปขายปกติพร้อมกำหนดราคาขายใหม่ (`POST /api/products/:id/relist-available`)
  - ปิด Race Condition ระหว่าง `submit` / `cancelRound` / `cancel` / `placeBid` / `closeAuction` ด้วย Unified Lock Strategy:
    - `withRoundMutationLock(roundId, fn, { productId })` ใช้ lock key เดียวกับ `withRoundLock(roundId)` (`hashtext(roundId)`) สำหรับทั้ง Flow A (ล็อกตามลำดับ `Round Lock -> Product Lock` เสมอ) และ Flow B ใน `auctionService.submit` พร้อมอ่าน `AuctionRound` ใหม่ภายใน `tx` ก่อนสร้าง `Product` หรือ `AuctionItem`
    - `withAuctionLock(auctionId)` และ `withRoundLock(roundId)` (ซึ่งล็อกรอบและล็อก `AuctionItem` ทุกตัวในรอบตามลำดับ `id ASC` พร้อมอ่านข้อมูลใหม่ใน `tx` ก่อนสร้าง Winner Order)
  - ส่งแจ้งเตือนผ่าน Internal Chat Service ในห้อง 1-on-1 `AUCTION:${roundId}:${userId}` แสดงผู้ส่งว่า `"ระบบฝ่ายการตลาด"` เป็นห้องอ่านอย่างเดียว (Read-Only) พร้อมบังคับ `Message.idempotencyKey @unique` ในระดับฐานข้อมูล MongoDB และรองรับการกดส่งแจ้งเตือนซ้ำ (`"ลองส่งแจ้งเตือนอีกครั้ง"`) แบบ Idempotent โดยไม่เปลี่ยนสถานะซ้ำและไม่สร้าง Audit Log ซ้ำ
- **Backend & Database Implementation:**
  - `backend/services/product-service/prisma/schema.prisma`: เพิ่ม `cancellationReason`, `cancelledAt`, `cancelledBy` ทั้งใน `AuctionRound` และ `AuctionItem`, นำ `@unique` ออกจาก `AuctionItem.productId` เปลี่ยนเป็น index `@@index([productId])`, รองรับสถานะ `auction_action_required` ใน `Product` และซิงก์เข้า PostgreSQL `reloop_product` จริง
  - `backend/services/chat-service/prisma/schema.prisma`: เพิ่ม `@unique` บน `Message.idempotencyKey` และซิงก์เข้า MongoDB `reloop_chat` จริง
  - `auctionService.js` & `auctionRepository.js`:
    - `submit`: ทั้ง Flow A และ Flow B ใช้ `withRoundMutationLock` และอ่าน `AuctionRound` ใหม่ใน `tx` เพื่อป้องกันการสร้าง `AuctionItem` หรือ `Product` ในรอบที่เพิ่งถูกยกเลิก
    - `cancel` & `cancelRound`: ยกเลิกรายสินค้าภายใต้ `withAuctionLock(auctionId)` และยกเลิกทั้งรอบภายใต้ `withRoundLock(roundId)` พร้อมรองรับ Idempotent Notification Retry เมื่อเรียกซ้ำบนรายการ/รอบที่ยกเลิกแล้ว
    - `browseRounds` & `findUpcomingRounds`: ส่ง `{ includeCancelled: true }` เพื่อให้รอบ Upcoming ที่ถูกยกเลิกยังคงแสดงจนถึง `auctionEndsAt` เดิม
    - `closeAuction`: ล็อกด้วย `withAuctionLock(auctionId)` และตรวจสอบสถานะซ้ำใน `tx` เพื่อป้องกันการสร้าง Winner Order หลังรายการหรือรอบถูกยกเลิก และปรับเป็น `auction_action_required` เมื่อ 0 bids
  - `chatClient.js`, `internalController.js` & `messageModel.js`: เรียก `createAndTouch` โดยตรงและดักจับ Unique Conflict (`P2002`/`P2034`) คืนข้อความเดิม (`findByIdempotencyKey`, HTTP 200) แบบ Atomic, ชื่อผู้ส่ง `"ระบบฝ่ายการตลาด"`, และบล็อกการตอบกลับ/แนบไฟล์ในห้อง `AUCTION` ด้วย `403 Forbidden`
- **Frontend Implementation (Desktop Web >= 1024px):**
  - `AuctionScheduleSection.js` & `AuctionReviewModal.js`: ตัวกรองรอบค่าเริ่มต้น `"ทุกรอบประมูล"`, แสดงข้อความผิดพลาดภาษาไทยเมื่อโหลดรอบไม่สำเร็จ, แยกปุ่ม `"ปฏิเสธสินค้า"`, `"ยกเลิกรายการประมูล"`, `"ยกเลิกรอบประมูล"`, ใช้ Confirmation Modal ทั้งการยกเลิกรายสินค้าและทั้งรอบ และแสดงแบนเนอร์เตือนพร้อมปุ่ม `"ลองส่งแจ้งเตือนอีกครั้ง"` เมื่อส่งแจ้งเตือนแชทไม่ครบ
  - `/auctions`, `/auctions/rounds/[roundId]`, `/auctions/[id]`: แสดงรอบที่ถูกยกเลิก (ทั้ง Active และ Upcoming) จนถึง `auctionEndsAt` เดิม และซ่อนเมื่อพ้น `auctionEndsAt`, แสดงรายการที่ถูกยกเลิกในหน้ารอบพร้อม Badge `"ยกเลิกแล้ว"`, เหตุผลการยกเลิก และปิดปุ่มประมูล
  - `/chat/[id]` & `ConversationRow.js`: แสดงชื่อ `"ระบบฝ่ายการตลาด"` และซ่อนช่องพิมพ์ข้อความพร้อมแสดงแบนเนอร์ห้องแจ้งเตือนแบบอ่านอย่างเดียว
- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0` บน Windows (ไม่ได้รันบน Node 24)
  - **Backend Unit Tests (0 fail, 0 skip):**
    - `backend/services/product-service/src/features/auctions/auctionService.test.js`: ผ่านครบ **102/102 tests (0 fail, 0 skip)**
    - `backend/services/product-service/src/controllers/productRelist.test.js`: ผ่านครบ **5/5 tests (0 fail, 0 skip)**
    - `backend/services/chat-service/src/features/conversations/contextKey.test.js`: ผ่านครบ **9/9 tests (0 fail, 0 skip)**
    - `backend/services/chat-service/src/features/internal/internalController.test.js`: ผ่านครบ **5/5 tests (0 fail, 0 skip)**
    - `backend/services/chat-service/src/features/messages/messageModel.test.js`: ผ่านครบ **4/4 tests (0 fail, 0 skip)**
    - `backend/services/chat-service/src/features/attachments/attachmentService.test.js`: ผ่านครบ **4/4 tests (0 fail, 0 skip)**
  - **PostgreSQL & Redis Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/product-service/test/auction.integration.test.js`: ผ่านครบ **22/22 tests (1 suite + 21 steps, 0 fail, 0 skip)**
  - **Chat MongoDB & Cross-Service Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/chat-service/test/internal-api.integration.test.js`: ผ่านครบ **17/17 tests (1 suite + 16 subtests, 0 fail, 0 skip)**
  - **Frontend Tests (Jest):**
    - `npm --prefix frontend test -- --watchAll=false`: ผ่านครบ **54/54 suites (359/359 tests passed, 0 fail, 0 skip)**
  - **Quality Gates:** `npm --prefix frontend run build`, `npm run lint`, `npm run format:check`, `git diff --check` ผ่านครบ
  - **Browser E2E:** **Pending** (ยังไม่ได้รันบนเบราว์เซอร์จริง)
