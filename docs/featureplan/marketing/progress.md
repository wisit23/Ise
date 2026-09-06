# Marketing Feature Progress

> Owner: ศิวกร วรวัฒน์อมรชัย · Reviewer: อัสนัย เมืองรอด · Updated: 2026-09-06

**Status:** `MKT-005` (Auction Core, Rounds, Soft Close) + `UR-11` choose action และ `MKT-004` Part A (Knowledge Base & Educational Articles System: `UR-14` / `FR-5.2.3`) พัฒนาและตรวจสอบผ่านทั้งฝั่ง Backend API, Trigram Search, Next.js Frontend และ Jest Tests ครบถ้วน; `MKT-001`–`MKT-003` (Campaign/Attribution) และ `MKT-004` Part B (Segmentation) อยู่ในแผนรอบถัดไป

**Plan coverage:** Explicit trace rows cover `UR-08`–`UR-16` through FR, active/deferred NFR,
`WF-03`, `WF-11`, documented Workflow gaps and `MKT-001`–`MKT-005`

**Confirmed evidence (MKT-005 / UR-11):**

- `AuctionItem`/`Bid` persist in `reloop_product`; full lifecycle
  (`pending_approval → approved → scheduled → open → closed`) implemented in
  `backend/services/product-service/src/features/auctions/`
- Seller sets `startingPrice`/`bidIncrement` at submission (not Marketing); Marketing owns
  `scheduledStartAt`/`scheduledEndAt` and cancel; Admin owns approve/reject
  (Admin UI itself lives on a teammate's unmerged branch — approve/reject exercised via API only)
  in this round
- Bids are serialized per-auction with a Postgres advisory lock (`pg_advisory_xact_lock`) so
  concurrent bids can't both win a tie; idempotency key prevents duplicate bids on retry
- Auctions close at their exact `scheduledEndAt` via a BullMQ delayed job (Redis), not only when
  someone happens to visit the page afterward — verified an unscheduled/unvisited auction closed
  itself within ~100ms of its close time, checked directly in Postgres to rule out the read-time
  fallback
- Auction close automatically creates the winner's Order via an internal
  `order-service` call (`POST /internal/from-auction`) — see `MKT-DEC-007`
- `SwipeChoice` persists a buyer's swipe "choose" (bookmark), separate from bidding — see
  `MKT-DEC-006`; verified end-to-end through the actual `/swipe` UI, not just the API
- End-to-end flow (submit → approve → schedule → open → bid → close → order created) verified
  three ways: `node --test` unit suite (17 tests, mocked), live `curl` against the running
  Docker stack, and manually through the real browser UI (login → seller submits → admin
  approves via API → marketing schedules in `/marketing/auctions` → buyer bids in
  `/auctions/:id` → auction auto-closes → order confirmed in `reloop_order`)
- Frontend: `/marketing/auctions` (schedule/cancel, with checkbox multi-select + a shared
  schedule bar to apply one open/close window to several approved auctions at once),
  `/seller/auctions` (same product-creation form as `/sell` — photos/title/description/
  category/condition/size/location/tags — plus `startingPrice`/`bidIncrement`; submitting
  creates the Product and its auction in one action, not a picker over existing listings),
  `/auctions` + `/auctions/:id` (browse/bid), choose button added to `SwipeVideoCard`
- Fixed: `auctionRepository` was not including `product.photos`, so every auction card/detail
  page rendered with no image regardless of the product having photos — now included on
  create/findById/list/updateStatus

**Not yet done:** `MKT-001`–`MKT-004` (Campaign, Attribution dashboard, Segmentation, Content) —
no schema, routes, or UI exist for these; `/marketing` currently has only one working tab
(Auctions)

**Database acceptance:** `REQUIRE_INTEGRATION=1`-style verification for `MKT-005` ran manually
against the real `docker compose` Postgres instance (not mocked) for this round; no dedicated
`*.integration.test.js` file was added yet — the mocked `auctionService.test.js` covers
lifecycle/validation logic, live verification covered the database-backed path

**Deferred:** Production campaign authorization, privacy and push-notification security hardening
(unrelated to `MKT-005`, unchanged from prior round)

**Blocker:** `MKT-001`–`MKT-004` still need Phase 0 contract freeze before starting

**Next action:** Add a `REQUIRE_INTEGRATION=1` auction test file, then start `MKT-001` (Campaign
lifecycle) following the same test-first pattern used for `MKT-005`

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
