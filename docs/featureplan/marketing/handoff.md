# Marketing Feature Handoff

> อัปเดตล่าสุด: 2026-09-19

## Ownership

- Owner: ศิวกร วรวัฒน์อมรชัย
- Reviewer: อัสนัย เมืองรอด
- Requirement scope: `UR-08`–`UR-16`
- Current status: `MKT-001` (Campaign Domain & Wallet), `MKT-002` (Campaign Workspace & Buyer Hub), `MKT-004 Part A` (Articles & Knowledge Base), `MKT-005` (Auction Core, Rounds, Soft Close, BullMQ Worker & Idempotency), และ `MKT-006` (Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling) พัฒนาและทดสอบผ่านครบถ้วนแล้ว (`MKT-005` Steps 1–4 accepted และ `MKT-006` Steps 1–4 accepted, รอเพียงคำสั่ง commit); `MKT-006` ไม่ได้รอ Attribution database hardening; สำหรับ `MKT-003` / `MKT-007` (Attribution Engine & Metrics Dashboard) ซอร์สโค้ดและ Unit tests ครบถ้วน อยู่ระหว่างเตรียม Cross-service Database Persistence Hardening ใน `reloop_order` / `reloop_product` (Part 3); และ `MKT-004 Part B` อยู่ระหว่างเตรียม Buyer profile persistence hardening (Part 4)

## Scope to hand off

- `MKT-001`: Campaign Domain and Lifecycle (Completed & Verified)
- `MKT-002`: Review, Preview and Publish Workspace (Completed & Verified)
- `MKT-003`: Attribution and Conversion Dashboard (Implementation & Unit Tests exist; DB persistence hardening pending Part 3)
- `MKT-004`: Extended Segmentation and Content (Part A Completed, Part B Rule Engine Implemented; Buyer profile persistence hardening pending Part 4)
- `MKT-005`: Extended Auction and Swipe Contracts (Auction Rounds, Soft Close & Order Idempotency Completed; Steps 1–4 accepted, Step 5 waiting for commit)
- `MKT-006`: Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling (Implementation and automated tests complete; waiting only for commit)
- `MKT-007`: Campaign Attribution Ingestion, Metrics Dashboard & Count Semantics (Implementation & Unit Tests exist; DB persistence hardening pending Part 3)

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ flow อยู่ใน [`teachme.md`](teachme.md) (Round 1–18)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md) (`MKT-DEC-001`–`MKT-DEC-019`)
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
   - `MKT-005`: `feat(marketing): add auction and swipe experience` (Steps 1–4 accepted, Step 5 waiting for commit)
   - `MKT-006`: `feat(marketing): server-side quote-and-hold & admin decoupling` (Steps 1–4 accepted, Step 5 waiting for commit)
2. **Part 3 Hardening:** ดำเนินการต่อยอด `MKT-003` / `MKT-007` (Attribution Database Persistence Hardening) ใน `reloop_order` และ `reloop_product` ด้วย Integration Test จริง
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
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/test/campaignMetrics.test.js` (7/7 tests passing)
    - `node -r ./scripts/test-shim.js --test backend/services/product-service/src/features/products/productPayload.test.js` (3/3 tests passing)
    - รวม Unit Tests ของ Product-Service ทั้งหมด 77/77 tests passing 100%
  - **Marketing Frontend Tests (Jest):**
    - `npm --prefix frontend test -- components/marketing/sections/AuctionScheduleSection.test.js` (7/7 tests passing 100% ครอบคลุมการทดสอบ RoundManagementSection แบบเจาะจง: Current round, Upcoming round, All-rounds table, Empty state, 409 Conflict banner, Refresh after creation, และ Parent AuctionScheduleSection component พร้อม mock API ครบถ้วน)

- **Architectural & Safety Guarantees:**
  - **Auction Round Overlap Protection & Advisory Lock Serialization:** ป้องกันการสร้างรอบประมูลทับซ้อนด้วย Half-Open Interval $[S, E)$ โดยใช้เงื่อนไข $S_1 < E_2 \land S_2 < E_1$ และอนุญาต Back-to-back rounds ($E_1 = S_2$) พร้อมทั้งจัดการ Concurrency Check-and-Create ด้วย PostgreSQL advisory lock `pg_advisory_xact_lock(1001, 1)` ส่งผ่าน Transaction Client `tx` ตลอดทั้ง flow คืนค่า HTTP 409 Conflict พร้อมข้อความสองภาษา และเลือกรอบปัจจุบันแบบ Deterministic ตามเวลาจริง
  - **Safe Idempotency Key Scoping:** ตรวจสอบ `auctionId`, `bidderId`, และ `amount` เมื่อพบ `idempotencyKey` ซ้ำ หากพารามิเตอร์ไม่ตรงกันจะโยน HTTP 409 Conflict ทันทีทั้งใน Phase ตรวจสอบก่อนหน้าและ Phase ฟื้นฟู `P2002` และยอมรับการ Retry บนการประมูลที่ปิดแล้ว
  - **Database Cleanup & Teardown Order:** ใช้ `t.after()` ดำเนินการตามลำดับเข้มงวด: หยุด Worker ก่อน -> ยกเลิกงานใน Redis -> ลบข้อมูลในฐานข้อมูลตามลำดับ Reverse-Dependency (`Bid` -> `AuctionItem` -> `Product` -> `AuctionRound`) -> ปิด Queue -> ตัดการเชื่อมต่อ Prisma พร้อมรวบรวม error ทั้งหมดรายงานหากเกิดข้อผิดพลาด
  - **Queue Cleanup & Worker Shutdown:** เพิ่ม `auctionCloseQueue.closeQueue()` และ `auctionCloseQueue.stopWorker()` เพื่อยกเลิกงานที่ค้างและตัดการเชื่อมต่อ IORedis/BullMQ อย่างสมบูรณ์ ไม่ค้าง Event loop
  - **Mock Boundaries:** Mock เฉพาะ `orderClient.createOrderFromAuction` ภายใน Product-Service เพื่อทดสอบ Outgoing Contract ไม่ข้ามไปแตะฐานข้อมูล `reloop_order`
