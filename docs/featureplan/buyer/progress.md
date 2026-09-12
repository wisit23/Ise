# Buyer Feature Progress
> Owner: วิศิษฏ์ เจียมสันต์ · Reviewer: เอกตระการ บุญญกาศ · Updated: 2026-09-07

**Status:** `BUY-001` และ `BUY-002` verified locally with PostgreSQL; `BUY-004` เป็น Partial;
Swipe subset ของ `BUY-005` มี implementation แล้ว แต่ overall Buyer acceptance ยังเปิด

## Slice status

| Slice     | Status           | Evidence ปัจจุบัน                                                                                                              | สิ่งที่ยังขาด                                                                                                    |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `BUY-001` | Verified locally | Catalog filters + hybrid Full-Text/Trigram search; forced PostgreSQL catalog test 1/1                                          | Reviewer acceptance และ performance test กับ dataset ใหญ่                                                        |
| `BUY-002` | Verified locally | Atomic reservation, 10-minute expiry, scoped release, retry/compensation, startup cleanup และ Cart countdown                   | Reviewer acceptance และ deployment schema apply                                                                  |
| `BUY-003` | Not complete     | มี Order routes/UI เดิม                                                                                                        | ไม่มี explicit actor/state table, `PaymentAttempt`, deterministic/idempotent Mock Payment และ restart acceptance |
| `BUY-004` | Partial          | Completed-order review, seller aggregate/list, Product/Storefront rendering, Buyer review form/history และ image/video gallery | Contact Seller, forced create/authorization/duplicate/media PostgreSQL acceptance                                |
| `BUY-005` | Partial          | Public Swipe feed, persisted `SwipeChoice` bookmark, product link, active-video playback และ touch/keyboard navigation         | Choose tests, Buyer-only role enforcement, chosen-state read-back, wishlist, style profile และ recommendation    |

## Confirmed implementation evidence

### BUY-001 — Catalog

Catalog ใช้ PostgreSQL query builder เดียวสำหรับ category, persisted style tags, brand, size,
condition และ price range; query constraints เป็น AND และ public result จำกัด `available`.
Search ใช้ weighted Full-Text ranking ร่วม Trigram/substring fallback เพื่อรองรับภาษาไทยและคำพิมพ์ผิด.
Forced PostgreSQL 16 catalog integration ผ่าน 1/1 เมื่อ 2026-09-05.

### BUY-002 — Reservation and Cart

Product ใช้ compare-and-set พร้อม `reservationId`, `reservedBy` และ 10-minute
`reservationExpiresAt`. Order persist reservation identity เดียวกัน, reuse Order เมื่อ retry และ release
ด้วย reservation token เดิมเมื่อ Order write ล้มเหลว. Cart แสดง countdown และปิด checkout เมื่อหมดอายุ.
PostgreSQL evidence เดิมพิสูจน์ concurrent Buyers `201/409`, expired takeover, stale-release protection
และ startup recovery.

### BUY-004 — Review and trust

`review-service` ตรวจ Order ผ่าน service contract, อนุญาตเฉพาะ Buyer เจ้าของ Order ที่ `completed`
และฐานข้อมูลบังคับ `orderId` unique. Product detail และ Storefront แสดง seller average/list แบบแบ่งหน้า;
Orders page สร้างรีวิว อ่าน `/api/reviews/mine` และแสดง media เดิมหลังส่งแล้ว.

`ReviewPhoto`/`ReviewVideo` เก็บ URL และ position. UI เลือกได้สูงสุด 5 ไฟล์และมี gallery/lightbox;
controller รองรับ metadata สูงสุด 8 รายการ ซึ่งยังเป็น contract mismatch ที่ต้องตัดสินใจ. ไฟล์ใหม่ใช้
`POST /api/reviews/uploads` → `review-service` volume `review_uploads` และ public
`/review-uploads/*`; Product media ยังคงใช้ `/uploads/*` และ `product_uploads`.

### BUY-005 — Swipe consumer

`/swipe` โหลด public `GET /api/products/videos/feed`, แสดง empty/error/product link และเล่นเฉพาะ
active video. Authenticated choose เรียก `POST /api/products/videos/:id/choose`; Product database ใช้
unique `[productVideoId, userId]` เพื่อให้ bookmark เป็น idempotent และไม่เกี่ยวกับ Bid. Viewer รองรับ
native scroll snap, touch swipe threshold และ Arrow/Page keyboard navigation.

## Latest verification

- Review upload/model + Gateway routing focused tests: 15/15 ผ่าน
- Frontend Jest: 15 suites, 47/47 tests ผ่าน
- Frontend production build: ผ่าน และสร้าง route `/swipe` สำเร็จ
- Targeted ESLint, `docker compose config --quiet`, Docker build `review-service gateway`: ผ่าน
- Root backend run: 98 pass, 2 fail; failure อยู่ใน Order checkout integration ที่
  `PrismaClientInitializationError` ขณะ database ไม่ได้รัน จึงไม่ใช่ full-suite acceptance

## Deferred and blockers

- Security hardening `NFR-SP-*`/`NFR-CP-*` ยัง Deferred; functional ownership checks ยังคงบังคับ
- `BUY-003` ยังไม่มี persisted Mock Payment/explicit fulfillment state contract
- `BUY-004` ยังไม่มี Contact Seller และ forced cross-service review-create database gate
- `BUY-005` ยังไม่มี direct SwipeChoice acceptance, Buyer-only role enforcement หรือ chosen-state read-back รวมถึง wishlist/style profile/recommendation
- Review media URL เดิม `/uploads/*` ยังอยู่ Product storage; ยังไม่มี one-time migration

**Next action:** ปิด `BUY-004` ด้วย Contact Seller และ forced PostgreSQL/cross-service tests ก่อน
จากนั้นทำ `BUY-003`; ห้ามยก overall Buyer Done จาก focused UI/unit evidence เท่านั้น
