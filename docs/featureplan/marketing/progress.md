# Marketing Feature Progress

> Owner: ศิวกร วรวัฒน์อมรชัย · Reviewer: อัสนัย เมืองรอด · Updated: 2026-09-19

**Status:** `MKT-001` (Campaign Lifecycle & Voucher Wallet), `MKT-002` (Campaign Workspace & Buyer Hub), `MKT-004 Part A` (Knowledge Base & Articles System), `MKT-005` (Auction Core, Rounds, Soft Close, BullMQ Worker & Idempotency), และ `MKT-006` (Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling) พัฒนาและตรวจสอบผ่านการทดสอบอัตโนมัติครบถ้วนแล้ว (`MKT-005` Steps 1–4 accepted และ `MKT-006` Steps 1–4 accepted, รอเพียงคำสั่ง commit); `MKT-006` ไม่ได้รอ Attribution database hardening; สำหรับ `MKT-003` / `MKT-007` (Attribution Engine & Metrics Dashboard) ซอร์สโค้ดและ Unit Tests ครบถ้วน อยู่ระหว่างเตรียม Cross-service Database Persistence Hardening ใน `reloop_order` / `reloop_product` (Part 3); และ `MKT-004 Part B` (Buyer Segmentation Rules) อยู่ระหว่างเตรียม Buyer profile persistence hardening (Part 4)

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
- `SwipeChoice` persists a buyer's swipe "choose" (bookmark), separate from bidding — see
  `MKT-DEC-006`; verified end-to-end through the actual `/swipe` UI, not just the API
- End-to-end flow verified via unit tests (48/48 passing), frontend Jest tests (7/7 passing), and real PostgreSQL/Redis integration suite
  (`auction.integration.test.js`, 11/11 tests across 10 steps passing)
- Frontend: `/marketing` (schedule/cancel/approve/reject, round management with all-rounds table and phase badges),
  `/seller/auctions` (product creation + auction submission with round lock),
  `/auctions` + `/auctions/:id` (browse/bid with auto-fill min next bid and soft close notice),
  choose button added to `SwipeVideoCard`

**Current status & Next steps:**
- `MKT-001`, `MKT-002`, `MKT-004 Part A`: Implemented, tested, and verified.
- `MKT-005`: Steps 1–4 are fully accepted with automated PostgreSQL and Redis integration test evidence. Step 5 (commit) is pending explicit user instruction.
- `MKT-006`: Implementation and automated tests are complete (quote-and-hold, concurrency guard, admin decoupling). Waiting only for commit (pending explicit user instruction). Not waiting for Attribution database hardening.
- `MKT-003`, `MKT-007`: Source implementation and unit tests exist; attribution persistence hardening in `reloop_order` / `reloop_product` belongs to Part 3.
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
  - `backend/services/product-service/src/features/auctions/auctionService.test.js` (39/39 tests passing, เพิ่ม 7 unit tests สำหรับ idempotency scoping, 409 conflict, closed auction retry, และ P2002 recovery)
  - `campaignValidation.test.js` (12/12 passing)
  - `segmentRule.test.js` (7/7 passing)
  - `campaignMetrics.test.js` (7/7 passing)
  - รวม Unit Tests ของ Marketing ทั้งหมด 68/68 tests passing 100%

