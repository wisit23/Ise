# Buyer Feature Changelog

## 2026-09-05 — BUY-001 PostgreSQL acceptance verified

- Ran the catalog acceptance against an isolated disposable `postgres:16-alpine` container on
  `localhost:55432`, mounting `infra/postgres/init-databases.sql`.
- Applied the Product schema, seeded the database, and passed
  `REQUIRE_INTEGRATION=1 node --test backend/services/product-service/test/catalog.integration.test.js`
  1/1; frontend BUY-001 Jest 2/2 and lint also passed.
- The container was removed automatically. BUY-001 is verified locally; broader Buyer completion is
  not claimed.

## 2026-09-05 — BUY-001 correction review

- Corrected filter apply pagination reset, retained active filters across page changes, and reset control values on clear.
- Named frontend test mocks and flushed initial effects; latest evidence: catalog contract 3/3, frontend 2/2, Prisma validate/generate, targeted formatting and lint passed.
- Forced PostgreSQL catalog integration was attempted but unavailable; BUY-001 remains blocked and no full implementation acceptance is claimed.
- Normalized create/update brands by trimming whitespace and reconciled `ProductSummary` with `brand` and `styleTags`.

## 2026-09-05 — BUY-001 Catalog Search and Filters

- เพิ่ม PostgreSQL catalog query builder ที่ใช้ร่วมกันทั้งค้นหาและกรองโดยไม่มีคำค้น
- รองรับ category, style จาก persisted `tags`, brand, size, condition และ min/max price แบบ AND
- เพิ่มการตรวจราคาที่ไม่ใช่ตัวเลข ติดลบ และช่วงราคากลับด้านให้ตอบ 400 ผ่าน controller
- เพิ่ม controls ที่เข้าถึงได้บนหน้า Products และ contract/frontend tests; ยังไม่ได้อ้างฐานข้อมูลจริง เพราะไม่ได้รัน integration

## 2026-07-30 — Planning Round 0

- Trace `UR-01`–`UR-07` ไปยัง Core/Extended tasks
- ตรวจพบ Buyer prototype เดิม แต่ยังไม่รับเป็น Done
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-01`–`UR-07` พร้อม FR, NFR, `WF-02`–`WF-07` และ Task/Phase
- กำหนด `BUY-001`–`BUY-005` เป็น Buyer vertical slices โดยคง Seller/CS provider boundaries
- เพิ่ม PostgreSQL acceptance สำหรับ catalog, reservation concurrency, Order, PaymentAttempt,
  Review, style profile และ wishlist
- ยืนยัน deterministic Mock Payment และห้าม mock/in-memory database
- ย้าย Security hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Buyer implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `BUY-001`–`BUY-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, Mock Payment, reservation และ deferred security decisions
- ไม่มี Buyer implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull Swipe Consumer Audit

- พบ `/swipe` และ public `GET /api/products/videos/feed` ใน source ที่ pull มา
- ยืนยันจาก source ว่าหน้า Swipe เลื่อน feed/เปิด Product ได้ แต่ไม่ persist choose action
- ปรับ `BUY-005`, progress, handoff และ decision ให้ใช้ baseline โดยไม่อ้างว่า `UR-11` Done
- ไม่ได้แก้ Buyer application code หรือรัน Buyer PostgreSQL acceptance test ในรอบเอกสารนี้

## 2026-08-10 — Swipe Consumer Refactor

- แยก `/swipe` เป็น data-loading page, feed viewer และ video card เพื่อให้ junior ไล่ flow ได้ทีละชั้น
- ให้ browser เล่นเฉพาะ active video และ pause video ที่ไม่ active เพื่อลดงาน decode/playback ที่ไม่จำเป็น
- เพิ่ม tests สำหรับ empty feed, trusted seller/product link และ API error; frontend ผ่าน 5/5 และ build ผ่าน
- ยังไม่มี persisted choose action และยังไม่ได้รัน Buyer PostgreSQL acceptance test จึงไม่ยก `UR-11` เป็น Done

## 2026-08-10 — BUY-002 Atomic Reservation and Cart

- เพิ่ม Product reservation fields และ internal contract สำหรับ reserve/release/complete โดยทุก write
  ใช้ `reservationId` เป็น compare-and-set guard
- เปลี่ยน Order create เป็น Product reserve ก่อน แล้ว persist `reservationId`, 10-minute expiry และ
  `pending_payment`; retry ใช้ Order เดิมและ Order write failure มี compensation
- เพิ่ม Product startup worker สำหรับคืน `reserved → available` เมื่อหมดอายุ และ stale release ไม่สามารถ
  ปลด reservation ใหม่ได้
- เพิ่ม Cart countdown, ปิดการเลือก/checkout รายการหมดอายุ และรองรับ legacy `pending` rows ระหว่างเปลี่ยน contract
- PostgreSQL 16 integration ผ่าน concurrency `201/409`, retry, takeover, stale release และ restart recovery;
  backend 47/47, frontend 7/7, lint, secret scan และ frontend build ผ่าน
- Apply schema เฉพาะฐานข้อมูลทดสอบชั่วคราวที่ port `55432`; ยังไม่มี production/deployment change

## 2026-08-25 — Search แทนที่ Title-Only ด้วย Trigram (pg_trgm)

- Bug report: Search เดิมค้นได้แค่ `title`/`description`/`category` ตรงตัว — ค้นคำที่ตรงกับ Tag เช่น `denim`/`sneakers`/`vintage` ได้ 0 ผลลัพธ์ เพราะ Tag เป็นภาษาอังกฤษแต่ Title เป็นไทย
- ตรวจแล้วพบ Postgres Full-Text Search มาตรฐาน (`tsvector`) ใช้กับภาษาไทยไม่ได้ (ไม่มี Thai Text-Search Config) จึงใช้ `pg_trgm` (Trigram) แทน — ทำงานระดับตัวอักษร ไม่ต้องพึ่ง Word-Break
- เพิ่ม Column `search_text` (Concat ของทุก Field ที่ค้นหาได้) คุมค่าด้วย DB Trigger แทน Generated Column (Postgres ไม่ยอมให้ Generated Column ใช้ `array_to_string()` เพราะเป็น `STABLE`), มี GIN Trigram Index รองรับทั้ง `ILIKE` และ Word-Similarity
- ยืนยัน E2E ผ่าน Browser จริงที่ `/products?q=sneakers` เจอสินค้าที่ Title ไม่มีคำนี้เลยแต่ Tag ตรง
- รายละเอียดและหลักฐานเต็มอยู่ที่ Task `MOCK-TRADE-011` ใน `docs/progress.md`
- ยังไม่ผ่าน AI Reviewer อิสระ, ยังไม่ได้ทดสอบ Performance กับข้อมูลปริมาณมาก (Seed มีแค่ 16 แถว)

## 2026-08-26 — Hybrid Search (Full-Text Ranking + Trigram)

- เพิ่ม `search_vector` ชนิด `tsvector` และ GIN Index โดย DB Trigger เดิมคำนวณ/Backfill ทั้ง `search_text` และ `search_vector`
- Full-Text Search ถ่วงน้ำหนัก `title`/`tags` สูงสุด ตามด้วย `category`, `description` และ metadata อื่นตามลำดับ
- Query ใหม่รับผลจาก FTS, exact substring และ Trigram แล้วจัดอันดับด้วย `65% FTS + 35% Trigram + exact-title boost 0.15`
- ไม่ตัด Trigram ออก เพราะ PostgreSQL `simple` config ไม่สามารถตัดคำไทยที่เขียนติดกัน; ภาษาไทยและคำพิมพ์ผิดจึงยังใช้ Trigram/`ILIKE` ช่วย
- เพิ่ม Integration Test ยืนยันว่า Match ในชื่อสินค้าอยู่เหนือคำเดียวกันที่ Match เฉพาะ description และ Trigger เติม `search_vector` ให้รายการใหม่
- Prisma schema validation และ lint ผ่าน; Product Service tests ผ่าน 8/8 โดย PostgreSQL Integration ถูก Skip ใน environment รอบนี้เพราะไม่มี Database/Docker
- อัปเดต Local Node.js เป็น `22.23.2` และ npm `10.9.8` ให้ตรงกับ engine requirement ของ repository
- รายละเอียดอยู่ที่ Task `MOCK-TRADE-013` ใน `docs/progress.md`

## 2026-08-26 — Atomic 10-Minute Buyer Reservation

- เพิ่ม `reservedBy`, unique `reservationId` และ `reservationExpiresAt` ใน Product พร้อมเก็บ
  reservation identity ใน Order
- ย้ายสิทธิ์ตัดสินผู้ชนะไปใช้ atomic conditional update ที่ Product; ผู้ซื้อพร้อมกันสองคนชนะ
  ได้เพียงหนึ่งคน
- เพิ่ม internal reserve/release/confirm contracts ที่ตรวจ `reservationId` และ `buyerId` เพื่อ
  ป้องกัน request เก่าปลดล็อกหรือ confirm reservation รอบใหม่
- รองรับ lazy expiry ตอนมีผู้ซื้อใหม่และ cleanup worker ทุก 30 วินาที
- Checkout สร้าง reservation ก่อน Order และ release token เดิมเป็น compensation เมื่อ Order write
  ล้มเหลว
- PostgreSQL concurrency/expiry/stale-token/cleanup test ผ่าน 1/1 และ checkout compensation unit
  tests ผ่าน 2/2; lint ผ่าน
- ยังไม่ยก process-restart/cross-service checkout test เป็น Done

## 2026-09-02 — UI-SYSTEM-001 (Frontend Design System / Refactor)

- หน้าแรกเคยใช้ `.catch(() => {})` กับ feed: Backend ดับแล้วได้ Hero ลอยอยู่เหนือพื้นที่ว่าง
  ไม่มี Error ไม่มีปุ่มลองใหม่ → `ErrorState` ที่กดลองใหม่ได้จริง (ทดสอบโดยปิด Backend)
- หน้ารายการสินค้า: "ไม่พบสินค้า" ประโยคเดียว → `EmptyState` ที่อธิบายตัวเองและมีปุ่ม
  "ล้างตัวกรอง" เมื่อผลว่างเพราะคำค้นหรือหมวดหมู่; "กำลังโหลด..." → Skeleton รูปทรงการ์ดจริง
- ตะกร้าและคำสั่งซื้อ: Skeleton แทนข้อความ, `EmptyState` ที่มีปุ่ม "เลือกซื้อสินค้า" และ Error/
  Notice ผ่าน `Alert`
- NavBar: ไอคอนของ "ปัดดูสินค้า" และ "ประมูล" เป็น `<span aria-hidden="true"></span>` ว่าง
  มาตั้งแต่ `d98e8a1` (ตอนถอด emoji ออกแล้วยังไม่ได้ใส่ Material Symbols แทน) → ใส่ `swipe`
  และ `gavel`; ทั้งสองลิงก์ซ่อน Label บนจอเล็กจึงเพิ่ม `aria-label` ของตัวเอง
- NavBar profile dropdown: เพิ่ม `aria-expanded`/`aria-haspopup` และปิดด้วย Esc ได้ พร้อมคืน
  Focus ให้ปุ่ม Avatar
- Login/Register: ช่องกรอกเคยมีแต่ placeholder ซึ่งหายทันทีที่พิมพ์ → Label จริง + hint +
  `autoComplete`; ตัวเลือกประเภทบัญชีเปลี่ยนจากปุ่มลอยสองปุ่มเป็น `radiogroup` จริง
- เพิ่ม Footer ที่ Login/Register ตามที่ Journey Map Stage 1 ระบุเองว่าเป็นจุดที่ผู้มาใหม่กำลัง
  ตัดสินใจว่าจะเชื่อใจแพลตฟอร์มหรือไม่
- ProductCard: `text-gray-400` ของหมวดหมู่/สถานที่ (2.85:1) → โทนที่ผ่าน WCAG AA และ
  "ไม่มีรูปภาพ" เปลี่ยนเป็นไอคอน + ข้อความแทนข้อความเทาลอยๆ
- รายละเอียดเต็มและผลตรวจอยู่ที่ [`docs/featureplan/changelog.md`](../changelog.md) และ [`docs/progress.md`](../../progress.md) Task `UI-SYSTEM-001`; กติกา UI อยู่ที่ [`docs/ui-conventions.md`](../../ui-conventions.md)
