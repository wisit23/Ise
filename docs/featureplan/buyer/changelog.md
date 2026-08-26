# Buyer Feature Changelog

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
