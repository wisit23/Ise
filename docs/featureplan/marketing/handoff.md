# Marketing Feature Handoff

> อัปเดตล่าสุด: 2026-10-09

## Ownership

- Owner: ศิวกร วรวัฒน์อมรชัย
- Reviewer: อัสนัย เมืองรอด
- Requirement scope: `UR-08`–`UR-16`
- Current status: `MKT-001` (Campaign Domain & Wallet), `MKT-002` (Campaign Workspace & Buyer Hub), `MKT-003` / `MKT-007` (Durable Campaign Attribution Engine, Outbox Pattern & Conversion Metrics Dashboard), `MKT-004 Part A` (Articles & Knowledge Base), `MKT-005` (Auction Core, Rounds, Soft Close, BullMQ Worker & Idempotency), `MKT-006` (Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling), `UR-11` (Swipe-to-Choose Hardening: Buyer Authorization, Persistence, User Isolation & Anti-Spoofing), `UR-08` (User/Peak-Usage Analytics สำหรับ Marketing: Active Users, New Users, Hourly Usage & Peak Hour Dashboard), Marketing Audit Trail (Append-Only Immutable Ledger ใน PostgreSQL `reloop_product`, Atomic Business Transactions, SYSTEM Actor Determinism, Secret Redaction & Read-Only Marketing UI), Campaign Date Validation & Budget Tracking with Auto-End (`MKT-DEC-023`), Auction Round Categories & Atomic Product/AuctionItem Creation (`MKT-DEC-024`), และ Marketing Auction Pre-approval UX Improvement (Review Modal & Inspection Flow) ผ่านการทดสอบอัตโนมัติครบถ้วนแล้ว (`MKT-003`/`MKT-007` Steps 1–4 accepted; `MKT-005` Steps 1–4 accepted; `MKT-006` Steps 1–4 accepted; `UR-11` automated tests accepted; `UR-08` automated tests accepted; Marketing Audit Trail automated tests accepted; MKT-DEC-023 automated tests accepted; MKT-DEC-024 automated tests accepted; Pre-approval UX automated tests accepted; รอ commit; ER Diagram update pending; Browser E2E / Responsive UI verification รอ final acceptance); และ `MKT-004 Part B` อยู่ระหว่างเตรียม Buyer profile persistence hardening (Part 4)

## Scope to hand off

- Campaign Date Validation and Budget Tracking: Server-side date boundaries, atomic spentBudget tracking, auto-end after completed attribution processing, CLAIMED voucher expiry on ended, and Marketing UI budget display (Verified with automated tests per `MKT-DEC-023`; ER Diagram update pending)
- Marketing Audit Trail: Append-Only Immutable Audit Log for Campaigns, Auctions, and Articles (Completed & Verified in Product Service & Marketing UI per `MKT-DEC-022`)
- `UR-08`: User/Peak-Usage Analytics for Marketing (Completed & Verified in Auth Service, Gateway & Dashboard UI)
- `MKT-001`: Campaign Domain and Lifecycle (Completed & Verified)
- `MKT-002`: Review, Preview and Publish Workspace (Completed & Verified)
- `MKT-003`: Attribution and Conversion Dashboard (Completed & Verified with Transactional Outbox and PostgreSQL persistence in `reloop_order` & `reloop_product`)
- `MKT-004`: Extended Segmentation and Content (Part A Completed, Part B Rule Engine Implemented; Buyer profile persistence hardening pending Part 4)
- `MKT-005`: Extended Auction and Swipe Contracts (Auction Rounds, Soft Close & Order Idempotency Completed; UR-11 Swipe-to-Choose Hardening Completed & Verified with automated tests; Steps 1–4 accepted, Step 5 waiting for commit; Browser E2E pending final acceptance)
- `MKT-006`: Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling (Implementation and automated tests complete; waiting only for commit)
- `MKT-007`: Campaign Attribution Ingestion, Metrics Dashboard & Count Semantics (Completed & Verified with idempotent ingestion, Prisma facts, and PostgreSQL integration tests)

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ flow อยู่ใน [`teachme.md`](teachme.md) (Round 1–20)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md) (`MKT-DEC-001`–`MKT-DEC-021`)
- Auction System: แก้ไขบั๊กแยกสินค้าประมูลด้วย `status: "auction"`, ระบบกำหนดรอบประมูลโดย Marketing, การล็อกฟอร์มผู้ขายเมื่อหมดเวลารอบ, การอนุมัติ/ปฏิเสธโดย Marketing (Admin decoupled ด้วย 403 Forbidden), ระบบต่อเวลาอัตโนมัติ 5 นาทีสุดท้าย (Soft Close), Auto-Fill Min Next Bid, Safe Idempotency Key Scoping, การรัน BullMQ Worker ปิดประมูลจริง, การป้องกัน Race Condition ป้องกันคำสั่งซื้อซ้ำซ้อน, และการป้องกันรอบประมูลซ้อนทับ (Auction Round Overlap Protection) ด้วย Half-open interval $[S, E)$, `pg_advisory_xact_lock(1001, 1)` serialization, deterministic selection ตามเวลาจริง และ derived phases ผ่าน Unit Tests 48/48 รายการ, Frontend Tests 7/7 รายการ, และ Integration Tests 11/11 รายการ (10 steps) บน PostgreSQL/Redis จริง
- Knowledge Base & Articles System: Model `Article` ใน PostgreSQL, GIN Trigram index + Trigger `search_text`, Trigram search algorithm (`GREATEST(word_similarity, similarity)` + `ILIKE`), API Public & Marketing, Role-based authorization, หน้า `/articles`, `/articles/:id`, เมนู Navbar, และแท็บ `ArticlesSection` ใน `/marketing` ผ่าน Jest tests (41/41 tests) และ static build (24/24 pages)
- Test Environment: แก้ไขบั๊ก Seed script ใน `auth-service` ไม่ให้ชน Unique constraint บนอีเมล พร้อมบัญชีทดสอบที่พร้อมใช้งานครบทุก Role (`marketing@example.com`, `shop.denim@example.com`, `buyer.demo@example.com`, `admin@example.com` รหัสผ่าน: `password123`)

## Dependencies and contracts

- เป็นเจ้าของ Campaign contract ที่ Buyer และ Executive ใช้งาน
- ใช้ Seller/Product/ProductVideo สำหรับสินค้า/Swipe และ Buyer/Order สำหรับ attribution/conversion
- ห้ามอ่าน database ของ Product หรือ Order โดยตรง; ใช้ provider API/event contract
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. **Commit MKT-005 & MKT-006:** เมื่อได้รับความเห็นชอบจากผู้ใช้ ให้ commit:
   - `MKT-005`: `feat(marketing): add auction and swipe experience` (Steps 1–4 accepted, Step 5 waiting for commit; Includes UR-11 hardening)
   - `MKT-006`: `feat(marketing): server-side quote-and-hold & admin decoupling` (Steps 1–4 accepted, Step 5 waiting for commit)
2. **UR-11 Final Acceptance:** ดำเนินการทดสอบ Browser E2E / Responsive UI verification บนเบราว์เซอร์จริงเมื่อสภาพแวดล้อมพร้อม
3. **Part 4 Hardening:** ดำเนินการต่อยอด `MKT-004 Part B` (Buyer Profile Persistence Hardening)
4. **Run targeted tests:** รัน `REQUIRE_INTEGRATION=1` สำหรับชุดทดสอบฐานข้อมูล โดยห้าม skip
5. **Document updates:** อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
6. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที

## 2026-09-19 Update — Marketing Part 2: Auction Integration Testing & System Closure

- **Overview:**
  - เพิ่มและยืนยัน Integration Test Suite ครอบคลุมวงจรชีวิตระบบ Auction ร่วมกับฐานข้อมูลจริง (PostgreSQL `reloop_product`) และ Redis (`localhost:6379`)
  - แก้ไขปัญหา Idempotent Retry ของการเสนอราคา (`placeBid`), เพิ่มการตรวจสอบ BullMQ Delayed Job ใน Redis โดยตรง, และรัน BullMQ Delayed Worker จริงเพื่อปิดประมูลตามเวลา

- **Automated Verification Evidence:**
  - **Auction Integration Tests (Real DB & Redis):**
    - คำสั่ง: `$env:REQUIRE_INTEGRATION="1"; $env:REDIS_URL="redis://localhost:6379"; node -r ./scripts/test-shim.js --test backend/services/product-service/test/auction.integration.test.js`
    - ผลการทดสอบ: 11/11 tests (1 suite, 10 steps) passing 100%
      - Step 1: Seller submit -> status 'auction' ใน PostgreSQL
      - Step 2: Admin Decoupling (403) & Marketing Approval -> 'scheduled', จองคิว BullMQ และตรวจสอบ Delayed Job ใน Redis โดยตรง (`getJob`)
      - Step 3: กฎการเสนอราคา (Seller ห้ามเคาะเอง, ตรวจ startingPrice, ตรวจ bidIncrement) และบันทึกลง PostgreSQL
      - Step 4: Idempotency Key DB constraint ป้องกันการเคาะซ้ำเมื่อ Retry
      - Step 5: จัดคิวการเคาะราคาพร้อมกันด้วย `pg_advisory_xact_lock`
      - Step 6: Anti-Sniping Soft Close ขยายเวลา `scheduledEndAt` +5 นาทีอัตโนมัติ และตรวจสอบ Job Reschedule ใน Redis
      - Step 7: ปิดประมูลเมื่อมีผู้ชนะ เรียก Order Client 1 ครั้ง บันทึก `winningOrderId`
      - Step 8: Real BullMQ delayed worker execution (`startWorker`) ปิดประมูลตามเวลาจริง (1.2s), Bounded polling PostgreSQL, ตรวจสอบ Order Client เรียก 1 ครั้ง และ Idempotent re-close
      - Step 9: ปิดประมูลเมื่อไม่มีผู้เสนอราคา คืนสถานะสินค้าเป็น `available`
      - Step 10: Auction Round Overlap Protection, Concurrency & Deterministic Selection (ป้องกันการสร้างรอบซ้อนทับด้วย Half-open interval $[S, E)$, ซีเรียลไลซ์ด้วย `pg_advisory_xact_lock(1001, 1)`, ตอบกลับ 409 Conflict พร้อม bilingual message, อนุญาต back-to-back rounds, และเลือก current round ตามเวลาจริง)
  - **Auction & Marketing Unit Tests (Mocked DB):**
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/src/features/auctions/auctionService.test.js` (48/48 tests passing, รวม 9 unit tests ใหม่สำหรับ `deriveRoundPhase`, `createRound` validations/conflict/tx, `getCurrentRound` with fakeNow, and `listRounds`)
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/test/campaignValidation.test.js` (12/12 tests passing)
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/src/features/segments/segmentRule.test.js` (7/7 tests passing)
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/test/campaignMetrics.test.js` (Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test; historical baseline: 7/7, then 10/10)
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/src/controllers/productPayload.test.js` (4/4 tests passing)
    - รวม Marketing Unit Tests ทั้งหมด 84 total tests passing 100% (Auction Service = 48, Campaign Validation = 12, Segment Rule = 7, Campaign Metrics = 13, Product Payload = 4; รวม 48 + 12 + 7 + 13 + 4 = 84; historical baseline: 71 tests)
  - **Marketing Frontend Tests (Jest):**
    - `npm --prefix frontend test -- components/marketing/sections/AuctionScheduleSection.test.js` (7/7 tests passing 100% ครอบคลุมการทดสอบ RoundManagementSection แบบเจาะจง: Current round, Upcoming round, All-rounds table, Empty state, 409 Conflict banner, Refresh after creation, และ Parent AuctionScheduleSection component พร้อม mock API ครบถ้วน)

- **Architectural & Safety Guarantees:**
  - **Auction Round Overlap Protection & Advisory Lock Serialization:** ป้องกันการสร้างรอบประมูลทับซ้อนด้วย Half-Open Interval $[S, E)$ โดยใช้เงื่อนไข $S_1 < E_2 \land S_2 < E_1$ และอนุญาต Back-to-back rounds ($E_1 = S_2$) พร้อมทั้งจัดการ Concurrency Check-and-Create ด้วย PostgreSQL advisory lock `pg_advisory_xact_lock(1001, 1)` ส่งผ่าน Transaction Client `tx` ตลอดทั้ง flow คืนค่า HTTP 409 Conflict พร้อมข้อความสองภาษา และเลือกรอบปัจจุบันแบบ Deterministic ตามเวลาจริง
  - **Safe Idempotency Key Scoping:** ตรวจสอบ `auctionId`, `bidderId`, และ `amount` เมื่อพบ `idempotencyKey` ซ้ำ หากพารามิเตอร์ไม่ตรงกันจะโยน HTTP 409 Conflict ทันทีทั้งใน Phase ตรวจสอบก่อนหน้าและ Phase ฟื้นฟู `P2002` และยอมรับการ Retry บนการประมูลที่ปิดแล้ว
  - **Database Cleanup & Teardown Order:** ใช้ `t.after()` ดำเนินการตามลำดับเข้มงวด: หยุด Worker ก่อน -> ยกเลิกงานใน Redis -> ลบข้อมูลในฐานข้อมูลตามลำดับ Reverse-Dependency (`Bid` -> `AuctionItem` -> `Product` -> `AuctionRound`) -> ปิด Queue -> ตัดการเชื่อมต่อ Prisma พร้อมรวบรวม error ทั้งหมดรายงานหากเกิดข้อผิดพลาด
  - **Queue Cleanup & Worker Shutdown:** เพิ่ม `auctionCloseQueue.closeQueue()` และ `auctionCloseQueue.stopWorker()` เพื่อยกเลิกงานที่ค้างและตัดการเชื่อมต่อ IORedis/BullMQ อย่างสมบูรณ์ ไม่ค้าง Event loop
  - **Mock Boundaries:** Mock เฉพาะ `orderClient.createOrderFromAuction` ภายใน Product-Service เพื่อทดสอบ Outgoing Contract ไม่ข้ามไปแตะฐานข้อมูล `reloop_order`

## 2026-10-03 Update — Marketing Task 1: Durable Campaign Attribution, Outbox Pattern & PostgreSQL Persistence Hardening

- **Overview:**
  - เพิ่มโมเดล `CampaignAttribution` ใน `reloop_product` และ `AttributionOutboxEvent` ใน `reloop_order` ด้วย Prisma Schema พร้อม dual binaryTargets และรัน `prisma db push` / `prisma generate`
  - ทำการ Refactor `campaignMetrics.js`: ลบ Dynamic SQL ออก ใช้ Prisma Model บันทึกลงตารางจริง
  - กำจัด Silent In-memory Fallback ใน Production: บังคับให้ `campaignMetrics.js` ในเส้นทาง Production ทำการ Fail loudly หาก Prisma client ขาดโมเดล `campaignAttribution` โดยสงวน In-memory store ไว้เฉพาะ Unit Test Adapter ที่ถูก Inject เข้ามาอย่างชัดเจนเท่านั้น
  - เสริมความปลอดภัย Idempotency และ Identity Conflict: การใช้ `eventId` เดิมซ้ำกับ `orderId` ใหม่จะถูกปฏิเสธด้วย HTTP 409 Conflict ทันทีแม้ข้อมูลตัวเลขจะตรงกันทั้งหมด ส่วนคำสั่งซื้อเดิม (`orderId` เดิม) ที่ส่งมาด้วย `eventId` ใหม่พร้อมข้อมูลที่ตรงกันทั้งหมดจะได้รับการ Deduplicate สำเร็จ (HTTP 200) ครอบคลุมทั้ง Pre-check และ Prisma `P2002` race-condition recovery
  - กำจัด Silent Feature-detection: ปรับปรุง `orderModel.js` และ `attributionOutboxService.js` ให้ fail loudly หาก Prisma model ขาดหาย เพื่อป้องกัน Order ที่มีแคมเปญสำเร็จโดยไม่มี Outbox event
  - ปรับปรุง `orderModel.transitionStatusWithProductSync`: สร้าง `AttributionOutboxEvent` ใน Transaction เดียวกับ Order status completion แบบ Atomic
  - สร้าง `attributionOutboxService.js`: รองรับ Event envelope, best-effort immediate delivery, exponential backoff, batch sweeper, และ worker lifecycle
  - ปรับปรุง `productClient.js` ให้ evaluate `PRODUCT_SERVICE_URL` และ `INTERNAL_SERVICE_TOKEN` แบบ dynamic
  - รักษา Service Boundary และ Data Ownership อย่างเคร่งครัด: สื่อสารผ่าน REST Contract `POST /internal/campaigns/events/order-completed` พร้อม `x-internal-token` ห้าม query ข้าม database ใน Production code
  - ทำให้ชุดทดสอบ Cross-service รันได้อย่าง Reproducible ใน Repository Test Environment และ CI: ใช้ Generated Prisma Client ที่มีอยู่ใน Repository ทั้งสองตัว ไม่พึ่งพาการก็อปปี้ไฟล์ไปยัง Production Container และเมื่อ Fallback รัน Express app ในเครื่องจะผูกกับ `DATABASE_URL_PRODUCT` แยกจาก Order DB อย่างถูกต้อง

- **Automated Verification Evidence (Real PostgreSQL with REQUIRE_INTEGRATION=1):**
  - **Genuine Cross-Service PostgreSQL Integration Suite:**
    - ไฟล์: `backend/services/order-service/test/cross-service-attribution.integration.test.js`
    - คำสั่ง (รันได้ทันทีหลัง clean `npm ci` + `prisma generate/db push`):
      `$env:REQUIRE_INTEGRATION="1"; node -r ./scripts/test-shim.js --test backend/services/order-service/test/cross-service-attribution.integration.test.js`
      (หรือใน Linux/CI: `REQUIRE_INTEGRATION=1 node -r ./scripts/test-shim.js --test backend/services/order-service/test/cross-service-attribution.integration.test.js`)
    - ผลการทดสอบ: 9/9 subtests (10/10 tests passing 100%) ข้าม 2 Database จริง (`reloop_order` และ `reloop_product`) และ HTTP ระหว่างคอนเทนเนอร์/แอปจริง ปราศจาก mock handler
  - **Product Service PostgreSQL Integration Suite:**
    - ไฟล์: `backend/services/product-service/test/campaign-attribution.integration.test.js`
    - คำสั่ง: `docker exec -w /app/services/product-service -e REQUIRE_INTEGRATION=1 ise_v7-product-service-1 node -r /app/scripts/test-shim.js --test test/campaign-attribution.integration.test.js` (หรือบนโฮสต์ด้วย `DATABASE_URL_PRODUCT`)
    - ผลการทดสอบ: 12/12 subtests (13/13 tests passing 100% รวม 409 conflict และ eventId reuse conflict)
  - **Order Service Outbox PostgreSQL Integration Suite:**
    - ไฟล์: `backend/services/order-service/test/campaign-attribution.integration.test.js`
    - คำสั่ง: `docker exec -w /app/services/order-service -e REQUIRE_INTEGRATION=1 ise_v7-order-service-1 node -r /app/scripts/test-shim.js --test test/campaign-attribution.integration.test.js` (หรือบนโฮสต์ด้วย `DATABASE_URL_ORDER`)
    - ผลการทดสอบ: 6/6 subtests (7/7 tests passing 100%)
  - **Unit Tests:**
    - `product-service/test/campaignMetrics.test.js`: Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test (passing 100% รวม Production fail-loud test)
    - `order-service/src/services/attributionOutboxService.test.js`: 7/7 subtests (8/8 tests passing 100%)
    - `order-service` Unit Tests รวมทั้งหมด: 53/53 tests passing 100%
    - รวม Marketing Unit Tests ทั้งหมด: 84 total tests passing 100% (Auction Service 48 + Campaign Validation 12 + Segment Rule 7 + Campaign Metrics 13 + Product Payload 4 = 84; historical baseline: 71 tests)

## 2026-10-04 Update — UR-11: Swipe-to-Choose Hardening (Implementation & Automated Verification Complete)

- **Overview:**
  - ยกระดับความปลอดภัยและความสมบูรณ์ของฟีเจอร์ Swipe-to-Choose (`UR-11`) ในฐานะ Buyer bookmark/interest list บนการ์ดวิดีโอสินค้า (`ProductVideo`)
  - บังคับสิทธิ์เฉพาะผู้ใช้บทบาท `BUYER` (403 Forbidden สำหรับ `SELLER`, `MARKETING`, `ADMIN`; 401 Unauthorized สำหรับผู้ใช้ที่ยังไม่ล็อกอิน)
  - รองรับ Server-Side Persistence ในฐานข้อมูล PostgreSQL `reloop_product` (ตาราง `swipe_choices`) พร้อมดึงข้อมูลด้วย Batch Query Prisma relation include บน `GET /api/products/videos/feed` โดยไม่มีปัญหา N+1 query
  - รับประกัน User Isolation (แยกสถานะ chosen ระหว่างผู้ซื้อแต่ละคนเด็ดขาด; Guest ได้รับ chosen: false)
  - เสริมการป้องกัน Client Identity Spoofing: API Gateway ลบ Header `x-user-*` ทั้งหมดจากภายนอกทิ้งก่อน route (ผ่านการตรวจสอบ Implementation review และ Lint แล้ว โดยยังไม่มี Dedicated automated test สำหรับ Gateway header stripping) และ Product Service ใน `optionalAuth` ปฏิเสธการดึง identity จาก Header หากไม่มี Bearer Token ที่ถูกต้อง
  - Idempotent choose (`upsert`) และ Safe unchoose (`deleteMany` ไม่เกิด 500 error หากไม่ได้เลือกไว้)
  - ฟรอนต์เอนด์ `SwipeVideoCard.js` ผูกสถานะเริ่มต้นกับ `video.chosen`, ซิงค์เมื่อ refetch, และทำ Optimistic Rollback ทันทีเมื่อ API error
  - สอดคล้องกับ `MKT-DEC-006` และ `MKT-DEC-021` (คง SwipeChoice เป็น Bookmark ความสนใจเท่านั้น ไม่เกี่ยวข้องกับการประมูล Auction)

- **Automated Verification Evidence:**
  - **Backend & Gateway Targeted Tests:** ผ่านครบ 29/29 tests 100%
    - Gateway App Tests (`backend/gateway/src/app.test.js`): ผ่าน 5/5 tests (ครอบคลุม Gateway auth routing และ Public routes; สำหรับ header stripping ผ่าน implementation review/lint แต่ยังไม่มี dedicated automated test)
    - Product Service App Tests (`backend/services/product-service/src/app.test.js`): ผ่าน 10/10 tests
    - Product Video Repository Tests (`backend/services/product-service/src/features/product-videos/productVideoRepository.test.js`): ผ่าน 2/2 tests (ครอบคลุม Guest chosen: false, User-specific chosen, และการตัด choices relation ออกจากผลลัพธ์)
    - Product Video Service Tests (`backend/services/product-service/src/features/product-videos/productVideoService.test.js`): ผ่าน 12/12 tests (ครอบคลุม 403 สำหรับ SELLER, MARKETING, ADMIN, Multi-role BUYER, และ Pagination forwarding)
    - รวม Backend & Gateway Targeted Tests: 5 + 10 + 2 + 12 = 29 tests
  - **Frontend Swipe Component Tests:** ผ่านครบ 3/3 suites (42/42 tests passing 100%)
    - `frontend/components/swipe/SwipeVideoCard.test.js`: ผ่านครบ 28/28 tests
    - `frontend/components/swipe/SwipeFeedViewer.test.js`: ผ่านครบ 8/8 tests
    - `frontend/app/swipe/page.test.js`: ผ่านครบ 6/6 tests
  - **PostgreSQL Integration Test (`REQUIRE_INTEGRATION=1`):**
    - ไฟล์: `backend/services/product-service/test/swipe-choose.integration.test.js`
    - ผลการทดสอบ: ผ่าน 1/1 suite (10 verification assertions) บนฐานข้อมูล `reloop_product` จริง ปราศจากการ Skip
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100%
    - `git diff --check`: ผ่าน 100%

- **Pending Acceptance Note:**
  - ชุดทดสอบอัตโนมัติครบถ้วนและผ่าน 100% ในทุกระดับ (Backend, Frontend Component, PostgreSQL Integration)
  - การทดสอบ Browser E2E / Responsive UI บนเบราว์เซอร์จริงยังไม่ได้ดำเนินการ และคงสถานะเป็น Final Acceptance ที่รอดำเนินการต่อไป

## 2026-10-05 Update — UR-08: User/Peak-Usage Analytics for Marketing (Implementation & Automated Verification Complete)

- **Overview:**
  - เพิ่มระบบวิเคราะห์สถิติผู้ใช้งานและช่วงเวลาการใช้งานสูงสุด (Peak Usage Hour) บน Marketing Dashboard (`/marketing`)
  - กำหนด Business Timezone เป็น `Asia/Bangkok` (+07:00) อย่างเคร่งครัด โดย API ปฏิเสธ timezone อื่นด้วย HTTP 400 Bad Request
  - จัดการ Timezone ใน PostgreSQL ด้วย `(activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'` สำหรับ Prisma DateTime UTC field
  - Date filter จาก UI แปลงเป็นขอบเขตวันไทย: `from` เป็น 00:00:00+07:00 และ `to` เป็น 00:00:00+07:00 ของวันถัดไป (`[from, to)` exclusive boundary) พร้อมป้องกันการส่ง Partial request
  - รักษา Service Boundary อย่างเคร่งครัด: ข้อมูล User และ Activity เป็นกรรมสิทธิ์ของ `Auth Service` (`reloop_auth`) โดยไม่มีการ Query ข้าม Database จากบริการอื่น
  - Data Whitelisting: Serializer ป้องกัน PII (ห้ามส่ง email, phone, displayName, userId หรือ payload กิจกรรมส่วนบุคคลใน response)
  - API Gateway: Proxy ไปยัง `GET /api/auth/marketing/analytics/user-usage` พร้อมลบ header `x-user-*` ที่ส่งมาจากภายนอกทิ้ง เพื่อป้องกัน Header Spoofing และตรวจสอบ Bearer JWT Token
  - RBAC: อนุญาตเฉพาะบทบาท `MARKETING` (รองรับ Multi-role array); ปฏิเสธ 401 เมื่อไม่มี Token และ 403 สำหรับบทบาทอื่น
  - Database Aggregation & Deterministic Tie-breaking:
    - `activeUsers`: รวม distinct `user_id` จาก `login_logs` และ `buyer_activity_logs`
    - `newUsers`: นับจาก `user.createdAt`
    - `hourlyUsage`: รวม distinct users รายชั่วโมงในระดับ SQL พร้อม Gap-filling เป็น 0 ทุกชั่วโมงใน Asia/Bangkok
    - `peakHour`: เลือกชั่วโมงที่มียอดการใช้งานสูงสุด หากเท่ากันจะเลือกชั่วโมงที่เกิดขึ้นก่อน (deterministic)
  - Dashboard UI (`DashboardSection.js`):
    - 3 KPI Cards: Active Users, New Users, Peak Usage Hour
    - Chart & Accessible Table: `TrendBarChart` ควบคู่กับ `<details>` สำหรับ A11y Table
    - ซื่อสัตย์ต่อ Error Handling: เมื่อ API ล้มเหลว แสดง Error Banner พร้อมปุ่ม Retry โดยค่า KPI แสดง `—` และ `ไม่พร้อมใช้งาน` (ห้ามแสดง 0 หลอก) และกราฟไม่แสดง Empty State
    - เมื่อ Retry สำเร็จ: ปิด Error Banner และแสดงผลตัวเลขจริง
    - เมื่อข้อมูลว่างจริง (Empty State): แสดง 0 สำหรับตัวเลขกิจกรรมพร้อมแสดง Empty State Banner
  - ไม่ใช้ In-memory fallback ใน Production และไม่ swallow database error

- **Automated Verification Evidence:**
  - **Backend Unit Tests:**
    - ไฟล์: `backend/services/auth-service/src/features/metrics/activityMetrics.test.js`
    - ผลการทดสอบ: ผ่าน 7/7 tests 100% (Range validation, Asia/Bangkok hourly bucketing, Deterministic peak hour, Whitelisted PII prevention, Gap filling, DB error propagation, Multi-role authorization)
  - **Gateway Cross-Service Tests:**
    - ไฟล์: `backend/gateway/src/marketing-analytics.cross-service.test.js`
    - ผลการทดสอบ: ผ่าน 2/2 tests 100% บน PostgreSQL จริง ผ่าน Gateway -> Auth Service -> PostgreSQL ได้รับ HTTP 200 OK (assert activeUsers, newUsers, peakHour, hourlyUsage 24 buckets with +07:00, timezone Asia/Bangkok, no PII, 401 unauth, 403 buyer spoof, 400 invalid range, 400 unsupported timezone) และแยก test ยืนยัน DB Error propagates เป็น 500
  - **PostgreSQL Integration Test (`REQUIRE_INTEGRATION=1`):**
    - ไฟล์: `backend/services/auth-service/test/user-analytics.integration.test.js`
    - ผลการทดสอบ: ผ่าน 1/1 suite 100% (0 skips) บนฐานข้อมูล `reloop_auth` จริง และ fail loud เมื่อ DB ออฟไลน์
  - **Frontend Tests:**
    - ไฟล์: `frontend/components/marketing/sections/DashboardSection.test.js`, `frontend/lib/api.test.js`
    - ผลการทดสอบ: ผ่าน 30/30 tests 100% (DashboardSection 20/20 tests, api 10/10 tests)
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100%
    - `git diff --check`: ผ่าน 100%

### 2026-10-05 Update — Marketing Audit Trail: Append-Only Immutable Ledger, Atomic DB Transactions & Read-Only Marketing Interface (Code Review Resolved)

- **Overview:**
  - ออกแบบและติดตั้งระบบ Marketing Audit Trail แบบ Append-Only Immutable Ledger ใน PostgreSQL `reloop_product` ตาราง `marketing_audit_logs` อ้างอิงตาม `MKT-DEC-022`
  - เก็บประวัติกิจกรรมสำคัญด้านการตลาดครบทั้ง 3 โดเมนหลัก (Campaign, Auction, Article) จำนวน 18 เหตุการณ์:
    - Campaign: `CAMPAIGN_CREATE`, `CAMPAIGN_UPDATE`, `CAMPAIGN_SUBMIT`, `CAMPAIGN_APPROVE`, `CAMPAIGN_REJECT`, `CAMPAIGN_PUBLISH`, `CAMPAIGN_END`
    - Auction: `AUCTION_ROUND_CREATE`, `AUCTION_ITEM_APPROVE`, `AUCTION_ITEM_REJECT`, `AUCTION_ITEM_SCHEDULE`, `AUCTION_ITEM_CANCEL`, `AUCTION_ITEM_CLOSE`
    - Article: `ARTICLE_CREATE`, `ARTICLE_UPDATE`, `ARTICLE_PUBLISH`, `ARTICLE_ARCHIVE`, `ARTICLE_DELETE`
  - **Atomic Business Transactions:** ผูกการเปลี่ยนแปลงทางธุรกิจ (Business Mutation) เข้ากับการบันทึก Audit Log ใน PostgreSQL Transaction เดียวกัน (`prisma.$transaction`) หากการบันทึก Audit ล้มเหลว การเปลี่ยนแปลงทางธุรกิจต้อง Rollback ทันที และหากการทำงานทางธุรกิจล้มเหลว จะต้องไม่มีการบันทึก Audit โดยเด็ดขาด
  - **Actor Identity & SYSTEM Determinism:**
    - กิจกรรมที่ทำโดยมนุษย์: ดึง `actorId` และ `actorRole` จาก Verified JWT identity (`req.user.id`, `req.user.role`) เท่านั้น ห้ามรับจาก Client Payload
    - กิจกรรมอัตโนมัติ: บันทึกด้วย `actorId = "SYSTEM"`, `actorRole = "SYSTEM"` พร้อม Deterministic `idempotencyKey` (เช่น `CAMPAIGN_END:${id}`, `AUCTION_ITEM_CLOSE:${id}`)
    - **Transaction-Safe Idempotency via `createMany({ skipDuplicates: true })`:** ใน PostgreSQL การดักจับ `P2002` ภายใน Transaction บล็อก จะทำให้สถานะ Transaction ถูก Abort ทันที (`25P02: current transaction is aborted, commands ignored until end of transaction block`) และไม่สามารถสั่ง `findUnique` ต่อใน Transaction เดิมได้ จึงใช้ `createMany({ data: [...], skipDuplicates: true })` + `findUnique` ซึ่งทำงานเป็น `INSERT ... ON CONFLICT DO NOTHING` บน PostgreSQL ทำให้ Transaction ไม่ถูก Abort และสามารถดึงเรคอร์ดที่มีอยู่เดิมกลับมาได้อย่างปลอดภัย 100% ส่วน Audit ปกติที่ไม่มี `idempotencyKey` ยังคงใช้ `create` และ Fail Loud ตามปกติ
  - **Recursive Secret Sanitization:** พัฒนาตัวกรองข้อมูลละเอียดอ่อน (`marketingAuditSanitizer.js`) ตัดฟิลด์ความลับ (`password`, `passwordHash`, `accessToken`, `refreshToken`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `credential`) แบบ Recursive ทั้งใน Object และ Array พร้อมป้องกัน Circular Reference ด้วย `WeakSet`
  - **Read-Only Marketing Interface & RBAC (Marketing-only Authorization):**
    - เส้นทาง API: `GET /api/products/marketing/audit-logs` (Gateway) และ `GET /marketing/audit-logs` (Direct)
    - ป้องกันอย่างรัดกุมด้วย `requireAuth` + `requireMarketingAccess` (อนุญาตเฉพาะบทบาท `MARKETING` เท่านั้น; `BUYER`, `SELLER` และ `ADMIN` ได้รับ HTTP 403 Forbidden ตาม `MKT-DEC-014`, permission bypass ถูกบล็อก)
    - ป้องกัน Identity Spoofing: ผู้ไม่ล็อกอินได้รับ 401 Unauthorized และการส่ง header `x-user-role` ปลอมแปลงได้รับ 403 Forbidden
    - ไม่มี API สำหรับ Create, Update หรือ Delete Audit Log โดยเด็ดขาด (ป้องกันการแทรกแซงหรือลบข้อมูลย้อนหลัง)
    - คิวรีรองรับการกรองตาม `entityType`, `action`, `actorId`, `from`, `to` (Half-open interval `[from, to)` ในเวลา `Asia/Bangkok` ตรวจสอบ `from <= to`) และ Pagination พร้อม Deterministic Sorting `[{ createdAt: "desc" }, { id: "desc" }]`
  - **Marketing Frontend UI (`AuditTrailSection.js`):**
    - ติดตั้งแท็บใหม่ `key: "audit"`, label: `"ประวัติการดำเนินงาน"`, icon: `"history"` บน Navigation Sidebar และ Dropdown ของ `/marketing`
    - ตารางประวัติพร้อม Action Badges แยกตามประเภท (เขียว/น้ำเงิน/เหลือง/แดง/ม่วง)
    - ไฮไลต์ Actor `SYSTEM` ด้วยป้ายสีม่วงชัดเจน
    - Modal ตรวจสอบรายละเอียดเชิงลึก (`Previous State`, `New State`, `Metadata`) ในรูปแบบ JSON อ่านง่าย
    - ฟิลเตอร์ตัวกรองครบถ้วน (Domain, Action, Actor ID, Date Range แปลง inclusive input เป็น `[from, to)` Bangkok exclusive midnight) และการแบ่งหน้า (Pagination)
    - Accessible form controls พร้อม `id` และ `htmlFor` สอดคล้องตามมาตรฐาน A11y
    - รองรับสถานะ Loading, Empty State และ Error พร้อมปุ่ม Retry เพื่อดึงข้อมูลใหม่
  - **Duplicate Declarations Removal & Lint:**
    - ลบฟังก์ชันซ้ำซ้อน `deleteCampaign` ใน `campaignRepository.js` และ `getById` ใน `articleModel.js` โดยคงตัวที่รองรับ `{ tx }` ไว้
    - ผ่าน `npm run lint` 0 errors, 0 warnings

- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0` (รายงานตามจริง)
  - **Backend Unit Tests:**
    - ไฟล์: `backend/services/product-service/src/features/audit/marketingAuditService.test.js`
    - ผลการทดสอบ: ผ่าน 6/6 tests 100% (createMany skipDuplicates idempotency, same-day Bangkok parsing, month boundary, invalid range, pagination bounds, secret sanitizer)
  - **PostgreSQL Integration Test (`REQUIRE_INTEGRATION=1` บน `reloop_product` จริง):**
    - ไฟล์: `backend/services/product-service/test/marketing-audit.integration.test.js`
    - คำสั่ง: `$env:REQUIRE_INTEGRATION="1"; $env:DATABASE_URL_PRODUCT="postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product"; $env:DATABASE_URL="postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product"; $env:REDIS_URL="redis://localhost:6379"; node -r ./scripts/test-shim.js --test backend/services/product-service/test/marketing-audit.integration.test.js`
    - ผลการทดสอบ: ผ่าน 11/11 tests (1 suite + 10 subtests) 100% ปราศจากการ Skip:
      - Subtest 1: RBAC: Marketing-only authorization, 401 unauth, 403 for Buyer, Seller, Admin, permission bypass prevention, and anti-spoofing
      - Subtest 2: Read-only contract: Client write/update/delete endpoints do not exist (404/405)
      - Subtest 3: Campaign lifecycle: Atomic mutations for CREATE, UPDATE, SUBMIT, APPROVE, REJECT, PUBLISH, END
      - Subtest 4: Automatic SYSTEM actions: CAMPAIGN_END and AUCTION_ITEM_CLOSE with deterministic idempotencyKey
      - Subtest 5: Concurrent retry deduplication: Promise.all creates no duplicate audit and zero 25P02 error
      - Subtest 6: Transaction atomicity: Audit failure rolls back business mutation, failed mutation creates no audit
      - Subtest 7: Auction lifecycle: AUCTION_ROUND_CREATE, ITEM_APPROVE, ITEM_REJECT, ITEM_SCHEDULE, ITEM_CANCEL, ITEM_CLOSE
      - Subtest 8: Article lifecycle: CREATE, UPDATE, PUBLISH, ARCHIVE, DELETE audit
      - Subtest 9: API Filtering and date range semantics: [from, to) interval, same-day, month boundary, invalid range, pagination
      - Subtest 10: Sanitizer verification: No secrets present in audit logs or API output
  - **Regression Integration Tests (Real DB):**
    - `campaign.integration.test.js`: ผ่าน 11/11 tests 100%
    - `auction.integration.test.js`: ผ่าน 11/11 tests 100%
    - `article.integration.test.js`: ผ่าน 1/1 test 100%
  - **Frontend Component Tests (Jest):**
    - `frontend/components/marketing/sections/AuditTrailSection.test.js`: ผ่าน 13/13 tests 100% (Render audit log rows, Action badge styles, Filter submissions, Details modal view, Empty state, Error state with retry, Accessible form labels, `convertAuditDateFilter` same-day and multi-day, Date validation error)
    - `frontend/app/marketing/page.test.js`: ผ่าน 6/6 tests 100%
    - รวม Frontend Tests: 19/19 tests passing 100%
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100% (All matched files use Prettier code style!)
    - `git diff --check`: ผ่าน 100% (0 errors)

### 2026-10-08 Update — Campaign Date Validation and Budget Tracking with Auto-End (MKT-DEC-023)

- **Overview:**
  - ได้รับการยืนยัน Workflow จาก Reviewer โดยคง Workflow 6 สถานะ (`draft → pending_approval → approved → published → ended/rejected`) โดยไม่มีสถานะ Scheduled/Live และไม่ขยายขอบเขตไปยัง UR-13
  - กำหนดนิยาม Budget: ยอดส่วนลดรวมที่ระบบจ่ายให้ Order ที่ completed แล้ว โดยงบประมาณถูกนับเมื่อ Product Service ประมวลผล completed attribution event (`order.completed.v1`) จาก Transactional Outbox ของ Order Service
  - ขอบเขตและความจริง: เป็นการ auto-end after completed attribution processing ไม่ใช่ strict real-time hard cap และไม่ได้รับประกันการป้องกันยอดเกินงบ 100% เนื่องจากคำสั่งซื้อสุดท้ายอาจดันให้ยอดใช้สะสมเกินงบได้เล็กน้อยก่อนปิดแคมเปญ
  - เพิ่มการตรวจสอบช่วงเวลาแคมเปญฝั่ง Server-side:
    - ห้ามตั้งช่วงเวลาที่สิ้นสุดไปแล้ว (`endsAt <= now`)
    - ห้ามตั้ง `startsAt` ย้อนหลังในอดีต (`startsAt < now - 60s`)
    - ตรวจสอบช่วงเวลาตอนแก้ไข Draft ทั้งค่าใหม่และค่าเดิม
    - ตรวจสอบตอน Publish: ปฏิเสธแคมเปญที่ `endsAt` หมดอายุแล้ว และหากเผยแพร่หลัง `startsAt` แต่ยังไม่ถึง `endsAt` ให้เริ่มใช้งานได้ทันที
    - ข้อความแจ้งเตือนทั้งหมดเป็นภาษาไทยที่อ่านเข้าใจง่าย
  - ติดตั้งการติดตามงบประมาณและการปิดแคมเปญอัตโนมัติ (Budget Tracking & Auto-End):
    - เพิ่มคอลัมน์ `spent_budget` (`spentBudget Int @default(0)`) ในโมเดล `Campaign` (`reloop_product`) ผ่าน `prisma db push`
    - เมื่อ Product Service ประมวลผล Attribution Event `order.completed.v1` จาก Outbox: Atomic Increment `spentBudget` ด้วย `discountAmount`
    - เมื่อ `spentBudget >= budget`: สั่ง auto-end after completed attribution processing เปลี่ยนสถานะเป็น `ended` ทันทีภายใน Transaction เดียวกัน พร้อมบันทึก SYSTEM MarketingAuditLog ด้วยเหตุผล `BUDGET_REACHED` และ idempotency key ป้องกัน retry นับซ้ำ
    - ปรับสถานะ Voucher ที่มีสถานะ `CLAIMED` เป็น `EXPIRED` ทันทีเมื่อแคมเปญ `ended`
    - สกัดกั้น Claim, ไม่แสดงใน Applicable Voucher, และปฏิเสธ Quote-and-Hold เมื่อแคมเปญ `ended` หรือยอด `spentBudget >= budget`
  - ฝั่งฟรอนต์เอนด์:
    - กำหนด `min` attribute ให้ช่อง `datetime-local` ตามเวลาปัจจุบัน
    - ตรวจสอบวันเวลาและแสดงข้อความภาษาไทยก่อนส่งฟอร์ม
    - แสดงข้อมูลงบประมาณในตารางเป็น `"ใช้แล้ว ฿X / ฿Budget"` พร้อมแถบความคืบหน้า (Budget Progress Bar)
- **Automated Verification Evidence:**
  - **Campaign Validation Unit Tests:** `campaignValidation.test.js` ผ่าน 23/23 tests 100%
  - **Campaign Metrics Unit Tests:** `campaignMetrics.test.js` ผ่าน 14/14 tests 100%
  - **Auction Service Unit Tests:** `auctionService.test.js` ผ่าน 53/53 tests 100%
  - **Product Service Budget PostgreSQL Integration Suite:** `campaign-budget.integration.test.js` ผ่าน 6/6 tests (1 suite + 5 subtests) 100% (`REQUIRE_INTEGRATION=1` 0 skips)
  - **Product Service Campaign PostgreSQL Integration Suite:** `campaign.integration.test.js` ผ่าน 11/11 tests 100% (`REQUIRE_INTEGRATION=1` 0 skips)
  - **Product Service Attribution PostgreSQL Integration Suite:** `campaign-attribution.integration.test.js` ผ่าน 13/13 tests 100% (`REQUIRE_INTEGRATION=1` 0 skips)
  - **Order Service Attribution Outbox PostgreSQL Integration Suite:** `order-service/.../campaign-attribution.integration.test.js` ผ่าน 7/7 tests 100% (`REQUIRE_INTEGRATION=1` 0 skips)
  - **Frontend Component Tests:**
    - `CampaignsSection.test.js`: ผ่าน 16/16 tests 100%
    - `AuctionScheduleSection.test.js`: ผ่าน 8/8 tests 100%
  - **Environment & Quality Gates:**
    - Node.js Runtime: `v22.16.0` (Host)
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `git diff --check`: ผ่าน 100%
  - **Schema/ER Status:** เพิ่มคอลัมน์ `spent_budget` ในตาราง `campaigns` เรียบร้อยแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`) ห้ามถือว่าปิดเอกสารครบ 100% จนกว่าจะอัปเดตแผนภาพ ER

### 2026-10-09 Update — Auction Round Categories & Atomic Product/AuctionItem Creation (MKT-DEC-024 Code Review Resolved)

- **Overview:**
  - เพิ่มการกำหนดหมวดหมู่สินค้าที่รอบเปิดรับ (`categories String[] @default([])` ในโมเดล `AuctionRound`) โดยฝ่ายการตลาดเลือกได้ว่าจะรับ "ทุกหมวดหมู่" (`categories: []`) หรือ "เฉพาะหมวดหมู่" (`categories: [...]`)
  - โหลดหมวดหมู่จากตาราง `Category` เดิมของระบบ (`GET /api/products/categories`) ห้าม Hardcode และห้ามสร้างตาราง Category ซ้ำ
  - Backend ตรวจสอบหมวดหมู่ว่ามีอยู่จริงในระบบก่อนบันทึก และรักษา Backward Compatibility สำหรับรอบเดิมที่ไม่มีหมวดหมู่ให้ตีความเป็น "ทุกหมวดหมู่"
  - ย้าย Product validation ที่ใช้ร่วมกันไปยังโมดูลกลาง `src/services/productValidation.js` เพื่อไม่ให้ Service มี reverse dependency กลับไปหา Controller
  - ปรับ Flow ผู้ขายให้ส่ง Request เดียวแบบ Atomic ไปยัง `POST /api/products/auctions`
  - Backend ตรวจสอบสิทธิ์ผู้ขาย, การยืนยันตัวตน KYC (`requireVerifiedSeller`), ตรวจสอบรอบที่กำลังเปิดรับสินค้า, ตรวจสอบหมวดหมู่ว่ามีอยู่จริงและรอบเปิดรับ, ตรวจสอบราคาเริ่มต้นและราคาเสนอเพิ่มขั้นต่ำ, ตรวจสอบข้อมูลสินค้า สภาพสินค้า และรูปภาพ (4-8 รูป)
  - สร้าง `Product` (`status: "auction"`) และ `AuctionItem` (`status: "pending_approval"`, ผูกกับ `product.id`, `round.id`, และ `sellerId`) พร้อมกันภายใน PostgreSQL Database Transaction เดียวกัน (`runInTransaction`)
  - ตรวจสอบความถูกต้องของรอบประมูลซ้ำภายใน Database Transaction (`tx`) เพื่อป้องกันกรณีรอบหมดเวลาระหว่างตรวจสอบล่วงหน้ากับการเขียนข้อมูล หากรอบหมดเวลาหรือไม่อนุญาตหมวดหมู่ ให้ Rollback ทันที
  - รักษา Flow สมัครประมูลด้วย `productId` เดิม (Flow A) โดยตรวจสอบ `product.category` จากฐานข้อมูลจริงเทียบกับหมวดหมู่ที่รอบเปิดรับ และเพิกเฉยต่อ category ที่ Client ส่งมา
  - ปรับปรุง Test Suite Isolation ให้จัดการเฉพาะ Fixtures ของตัวเอง (`createdBidIds`, `createdAuctionIds`, `createdProductIds`, `createdRoundIds`) โดยไม่ใช้ `updateMany` กระทบข้อมูลรอบประมูลภายนอก
- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0`
  - **Backend Unit Tests:** `auctionService.test.js` ผ่านครบ 68/68 tests 100%
  - **PostgreSQL Integration Tests:** `auction.integration.test.js` ผ่านครบ 17/17 tests (1 suite + 16 subtests รวม Step 11-16: Atomic Creation, Rollback, Category Rejection, Flow A DB Category, Backward Compatibility, และ In-Transaction Round Expiration Rollback) 100% บน PostgreSQL และ Redis จริง ด้วย `REQUIRE_INTEGRATION=1` ปราศจากการ Skip
  - **Frontend Component Tests:**
    - `AuctionScheduleSection.test.js`: ผ่านครบ 11/11 tests 100%
    - `app/seller/auctions/page.test.js`: ผ่านครบ 5/5 tests 100%
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `git diff --check`: ผ่าน 100%
    - `npm run secret-scan`: ผ่าน 100% (0 potential secrets)
  - **Schema/ER Status:** เพิ่มคอลัมน์ `categories` ในตาราง `auction_rounds` เรียบร้อยแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`)

### 2026-10-09 Update — Marketing Auction Pre-approval UX Improvement (Review Modal & Inspection Flow)

- **Overview & UX Improvement:**
  - ปรับปรุง UX สำหรับฝ่ายการตลาดในการตรวจสอบสินค้าก่อนอนุมัติเข้าประมูล (`pending_approval`) ให้สามารถดูรูปภาพทุกมุมและรายละเอียดสินค้าครบถ้วนได้ใน Modal บนหน้า Marketing เดิม โดยไม่ต้องสลับหน้าไปยัง `/products/[id]` และกลับมายังรายการประมูลเดิมได้ทันทีโดยไม่สูญเสีย Status Filter
  - เพิ่มคอมโพเนนต์ `frontend/components/marketing/sections/AuctionReviewModal.js` ซึ่ง reuse `frontend/components/ui/Modal.js`
  - เพิ่มปุ่ม "ตรวจสอบสินค้า" ในรายการประมูลสถานะ `pending_approval` บนหน้า `AuctionScheduleSection.js`
  - Gallery รูปสินค้า: แสดงรูปภาพหลักแบบ `object-contain` เพื่อรักษาสัดส่วนภาพ และ Thumbnails สำหรับคลิกสลับดูรูปภาพทั้งหมดที่เรียงตาม `position` จาก API พร้อม Fallback "ไม่มีรูปสินค้า" เมื่อไม่มีรูป และแสดง "ไม่ระบุ" เมื่อข้อมูลบางช่องว่าง (เช่น size, brand, startingPrice) ป้องกัน UI crash
  - Modal Controls & Accessibility: รองรับการปิดด้วยปุ่มมุมขวาบน, ปุ่ม "กลับไปหน้ารายการประมูล", และปุ่ม Escape พร้อมคืน Focus สู่ปุ่มเปิด, ใช้ `role="dialog"`, `aria-modal="true"`, และ trap focus อย่างถูกต้อง
  - Unified Approve/Reject Actions: เรียกใช้ Handler กลางและ API เดิม (`PATCH /api/products/auctions/:id/approve` และ `reject`) เดียวกันกับปุ่มในรายการเดิม เมื่อสำเร็จจะปิด Modal และรีเฟรชรายการโดยรักษา `statusFilter` เดิม
  - Loading & Error Guard: ป้องกันการกดซ้ำ (Disable buttons), แสดงสถานะ "กำลังอนุมัติ..." / "กำลังปฏิเสธ...", ล็อกไม่ให้ปิด Modal ขณะส่งคำขอ, และแสดงข้อความ Error ภาษาไทยที่เข้าใจง่ายใน Modal หาก API ล้มเหลว โดยไม่รั่วไหล Technical Stack Trace
  - Scope: ออกแบบสำหรับ Web Browser บนคอมพิวเตอร์และ Laptop เท่านั้น (1024×768, 1366×768, 1440×900, 1920×1080) ออกแบบ Layout เพื่อไม่ให้เกิด Horizontal Scroll ตั้งแต่ 1024px ขึ้นไป ไม่รองรับ Mobile หรือ Tablet ต่ำกว่า 1024px
  - Clean Code & Presentation Sharing: แยก Presentation Constants และ Formatter ที่ใช้ร่วมกันเป็นโมดูลขนาดเล็ก `auctionPresentation.js` (`STATUS_LABEL`, `STATUS_STYLE`, `baht`) ลดความซ้ำซ้อนระหว่าง `AuctionScheduleSection.js` และ `AuctionReviewModal.js`
- **Automated Verification Evidence:**
  - **Frontend Component Tests:**
    - `AuctionScheduleSection.test.js`: ผ่านครบ **29/29 tests 100%** (รวม 18 tests ใหม่สำหรับ Review Modal และ UX Flow ครอบคลุมการเปิด-ปิด Modal, Gallery รูปภาพ, การเลือก Thumbnail, การปิดด้วย Escape/ปุ่มกลับ/ปุ่มปิด, การคง Status Filter, การอนุมัติ/ปฏิเสธจาก Modal, การ Disable ปุ่มขณะส่งคำขอ, Error ภาษาไทย, Fallback เมื่อไม่มีรูป, และ Regression ของปุ่มในรายการเดิม)
    - Frontend Test Suites รวมทั้งระบบ: ผ่านครบ **50/50 suites (328/328 tests passing 100%)**
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npx prettier --check`: ผ่าน 100%
    - `git diff --check`: ผ่าน 100%
- **Status & Scope Note:**
  - Frontend-only UX improvement: ไม่มีการแก้ Backend Logic, Schema หรือ Database
  - ยืนยันการทำงานผ่าน Automated Component Tests ครบถ้วน โดยยังไม่ได้ยืนยันผ่าน Browser จริง หรือยืนยัน Responsive บนหน้าจอจริง เพราะ localhost:8080 ไม่ได้รันในสภาพแวดล้อมนี้ และไม่ถือว่า Responsive/Browser E2E ผ่านจนกว่าจะเปิดตรวจบน Browser จริง

### 2026-10-09 Update — Concurrent Auction Rounds & Explicit Round Selection (MKT-DEC-025)

- **Overview:**
  - ยกเลิกข้อจำกัด Cross-round Overlap Protection ตามมติ `MKT-DEC-025` เพื่อให้ฝ่ายการตลาดสามารถสร้างรอบประมูลที่คาบเกี่ยวหรือทับซ้อนเวลากันได้ทุกกรณี
  - พัฒนาระบบการเลือกรอบแบบชัดแจ้ง (Explicit Round Selection) สำหรับผู้ขายและผู้ซื้อ โดยระบบต้องไม่ผูกรอบหรือเปลี่ยนหน้าอัตโนมัติ
  - แยกรายการสินค้าในแต่ละรอบ (Round Item Isolation) อย่างเด็ดขาด
- **Backend & Database Contracts:**
  - `backend/services/product-service/src/features/auctions/auctionRepository.js`: ปลด Cross-round overlap conflict check โดย `findConflictingRound`, `withRoundLock`, `findActiveSubmissionRound` และ `findCurrentRound` ถูกลบออกจาก Production Code แล้ว, เพิ่ม `findActiveSubmissionRounds(now)`, `findActiveAuctionRounds(now)`, `findUpcomingRounds(now)`, และ `findRoundWithItems(roundId)` (กรองเฉพาะ status `open` และ `scheduled`)
  - `backend/services/product-service/src/features/auctions/auctionService.js`:
    - `createRound` บันทึกรอบและ `MarketingAuditLog` (`AUCTION_ROUND_CREATE`) ร่วมกันแบบ Atomic Transaction
    - `getCurrentRound` คืน `{ round, phase, isSubmissionOpen, isAuctionActive, activeSubmissionRounds, activeAuctionRounds, nextRound }`
    - `submit` บังคับ `input.roundId` (ขาดส่งตอบ 400 Bad Request `"กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"`), ตรวจสอบรอบมีอยู่จริง (400), ยังไม่เปิดรับ (400), ปิดรับแล้ว (400), ตรวจสอบหมวดหมู่ตรงกับที่รอบเปิดรับทั้ง Flow A/B พร้อม re-verify รอบใน Transaction Client (`tx`)
    - เพิ่ม `browseRounds()`, `getRound(roundId)`, และ `listRoundItems(roundId)` (มี lifecycle reconciliation ผ่าน `maybeAdvance` และกรองเฉพาะ visible items)
  - `backend/services/product-service/src/features/auctions/auctionController.js` & `auctionRoutes.js`: เพิ่ม Endpoints: `GET /rounds/browse`, `GET /rounds/:roundId`, `GET /rounds/:roundId/items`
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

### 2026-10-10 Update — Auction Item & Round Cancellation, Seller Recovery Lifecycle, Read-Only Chat Notification & Round Filter in Marketing Approval (MKT-DEC-026)

- **Overview:**
  - แยก 3 การกระทำในระบบประมูลออกจากกันอย่างชัดเจน:
    1. **ปฏิเสธสินค้า (`Reject Auction Item`)**: สำหรับสินค้า `pending_approval` เท่านั้น ใช้ปุ่ม `"ปฏิเสธสินค้า"` แยกจากปุ่มยกเลิกชัดเจน
    2. **ยกเลิกรายการประมูล (`Cancel Auction Item` — `PATCH /api/products/auctions/:id/cancel`)**: สำหรับรายการที่ผ่านการอนุมัติแล้ว (`approved`, `scheduled`, `open`) ยกเลิกเฉพาะรายการที่เลือก รายการอื่นในรอบดำเนินต่อได้ตามปกติ ต้องกรอกเหตุผล (1–500 ตัวอักษร) ปรับ `AuctionItem` เป็น `cancelled` และ `Product` เป็น `auction_action_required` บันทึก Audit Log (`AUCTION_ITEM_CANCEL`) และส่งแจ้งเตือนผ่านห้องแชท `"ระบบฝ่ายการตลาด"`
    3. **ยกเลิกรอบประมูล (`Cancel Auction Round` — `PATCH /api/products/auctions/rounds/:roundId/cancel`)**: ยกเลิกรายการที่ยัง Active ทุกรายการในรอบ ปรับ `Product` เป็น `auction_action_required` บันทึก Audit Log (`AUCTION_ROUND_CANCEL`) และส่งแจ้งเตือนผู้ขายทุกคนในรอบรวมถึงผู้ประมูลเมื่อยกเลิกระหว่างกำลังประมูล
  - ซิงก์ Prisma Schema (`backend/services/product-service/prisma/schema.prisma`) ลง PostgreSQL จริง (`reloop_product`) ผ่าน `prisma db push`: เพิ่ม `cancellationReason`, `cancelledAt`, `cancelledBy` ทั้งใน `AuctionRound` และ `AuctionItem`, เพิ่ม `auction_action_required` ใน `ProductStatus`, และเปลี่ยน `AuctionItem.productId` จาก `@unique` เป็น `@@index([productId])`
  - ซิงก์ Prisma Schema (`backend/services/chat-service/prisma/schema.prisma`) ลง MongoDB จริง (`reloop_chat`) ผ่าน `prisma db push`: เพิ่ม `@unique` บน `Message.idempotencyKey`
  - ป้องกัน Race Conditions ด้วย PostgreSQL Transaction Advisory Locks (`pg_advisory_xact_lock`):
    - `withRoundMutationLock(roundId, fn, { productId })` ล็อก `hashtext(roundId)` เดียวกับ `withRoundLock(roundId)` ใน `auctionService.submit` ทั้ง Flow A (ลำดับ `Round Lock -> Product Lock` เสมอ) และ Flow B พร้อมอ่าน `AuctionRound` ใหม่ใน `tx` ก่อนสร้าง `Product` หรือ `AuctionItem`
    - `withRoundLock(roundId)` ล็อกทั้งรอบและล็อก `AuctionItem` ทุกรายการในรอบเรียงตาม `id ASC` เพื่อ serialize กับ `submit`, `placeBid`, `closeAuction`, และ `cancel` รายสินค้า
    - `closeAuction` ล็อกด้วย `withAuctionLock(auctionId)` และอ่านสถานะ `AuctionItem` + `AuctionRound` ซ้ำภายใน lock เพื่อป้องกันการสร้าง Winner Order บนรายการหรือรอบที่ถูกยกเลิกไปแล้ว
    - `submit` (Flow A) และ `relistAvailable` (Flow B) ล็อกด้วย `withProductLock(productId)` ป้องกันการดำเนินการซ้ำพร้อมกัน
  - แสดงรอบ Upcoming ที่ถูกยกเลิกใน `browseRounds` (`findUpcomingRounds` รับ `{ includeCancelled: true }`) และหน้า `/auctions` จนถึง `auctionEndsAt` เดิม และซ่อนเมื่อพ้น `auctionEndsAt`
  - พัฒนาระบบแจ้งเตือนผ่าน Chat Service ในห้อง `"ระบบฝ่ายการตลาด"` (`senderId: "system-marketing"`, 1-on-1 `AUCTION:${roundId}:${userId}` context) แบบ Atomic DB Idempotent (`Message.idempotencyKey @unique`, `createAndTouch` + `P2002`/`P2034` conflict handler) รองรับการกด `"ลองส่งแจ้งเตือนอีกครั้ง"` บนรายการ/รอบที่ยกเลิกแล้วโดยไม่สร้าง Audit Log ซ้ำ และบังคับ Read-Only (`403 Forbidden` เมื่อผู้ใช้พยายามส่งข้อความหรือไฟล์แนบตอบกลับ)
  - พัฒนา Round Filter (`roundFilter` ค่าเริ่มต้น `"ทุกรอบประมูล"` พร้อมแจ้งเตือนภาษาไทยเมื่อโหลดรอบประมูลไม่สำเร็จ) และ Confirmation Modals แยกชัดเจนสำหรับ `"ยกเลิกรายการประมูล"` และ `"ยกเลิกรอบประมูล"`
- **Automated Verification Evidence:**
  - **Host Node.js Version:** `v22.16.0` บนสภาพแวดล้อม Windows จริง
  - **Backend Unit Tests (0 fail, 0 skip):**
    - `backend/services/product-service/src/features/auctions/auctionService.test.js`: ผ่านครบ **102/102 tests 100%**
    - `backend/services/product-service/src/controllers/productRelist.test.js`: ผ่านครบ **5/5 tests 100%**
    - `backend/services/chat-service/src/features/conversations/contextKey.test.js`: ผ่านครบ **9/9 tests 100%**
    - `backend/services/chat-service/src/features/internal/internalController.test.js`: ผ่านครบ **5/5 tests 100%**
    - `backend/services/chat-service/src/features/messages/messageModel.test.js`: ผ่านครบ **4/4 tests 100%**
    - `backend/services/chat-service/src/features/attachments/attachmentService.test.js`: ผ่านครบ **4/4 tests 100%**
  - **PostgreSQL & Redis Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/product-service/test/auction.integration.test.js`: ผ่านครบ **22/22 tests (1 suite + 21 steps) 100% (0 fail, 0 skip)**
  - **Chat MongoDB & Cross-Service Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/chat-service/test/internal-api.integration.test.js`: ผ่านครบ **17/17 tests (1 suite + 16 subtests) 100% (0 fail, 0 skip)**
  - **Frontend Tests (Jest):**
    - `npm --prefix frontend test -- --watchAll=false`: ผ่านครบ **54/54 suites, 359/359 tests 100% (0 fail, 0 skip)**
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100%
    - Production Build (`next build`): ผ่าน 100%
    - `git diff --check`: ผ่าน 100%
- **Scope & Constraints:**
  - Desktop-only Web (ความกว้างตั้งแต่ 1024px ขึ้นไป) ไม่ทำ Mobile UI
  - Browser E2E บน Browser จริงอยู่ในสถานะ `Pending`
  - ห้าม Commit หรือ Push และรักษา Working Tree เดิมทั้งหมดรวมถึง `docker-compose.yml`
