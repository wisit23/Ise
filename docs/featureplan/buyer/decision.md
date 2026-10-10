# Buyer Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## BUY-DEC-001 — Vertical Buyer ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Buyer Owner รับผิดชอบ `UR-01`–`UR-07` แบบ vertical ตั้งแต่ UI, API, Order rules, PostgreSQL tests และเอกสาร
- Reason: ลดการรอส่งงานระหว่าง Frontend/Backend/Database และทำให้ตรวจ outcome ได้เป็น Feature
- Consequence: การแก้ Product contract ยังต้อง review ร่วมกับ Seller ซึ่งเป็น provider

## BUY-DEC-002 — Deterministic Mock Payment

- Date: 2026-08-10
- Status: Accepted
- Decision: Checkout ใช้ Mock Payment ที่ให้ผล deterministic และไม่รับเงินจริง
- Reason: รอบนี้ต้องทดสอบ payment journey ได้โดยไม่ผูก external payment provider
- Consequence: `PaymentAttempt`, idempotency และ Order state ต้องบันทึกใน Order PostgreSQL จริง; ห้ามใช้ mock database เป็น acceptance evidence

## BUY-DEC-003 — Atomic reservation window

- Date: 2026-08-10
- Status: Accepted
- Decision: การจองสินค้าต้อง atomic และมีอายุ 10 นาทีตาม Product/Order contract
- Reason: ป้องกันผู้ซื้อหลายคนซื้อสินค้าชิ้นเดียวกันพร้อมกัน
- Consequence: ต้องมี concurrency, expiry และ restart integration tests กับ PostgreSQL จริง

## BUY-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/PDPA/PCI-DSS hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## BUY-DEC-005 — Swipe consumer baseline needs contract decision

- Date: 2026-08-10
- Status: Needs decision
- Decision: ยังไม่ยก `/swipe` ที่ pull มาเป็น `UR-11` acceptance จนกว่าจะนิยาม “choose”, Product state และ provider/consumer contract
- Reason: Source ปัจจุบันเลื่อนดู feed และเปิด Product เท่านั้น ไม่มี persisted user choice
- Consequence: Buyer ใช้ source เป็น baseline ได้ แต่ Marketing และ Seller ต้องร่วม freeze contract ก่อนขยายหรือเปลี่ยนสถานะ

## BUY-DEC-006 — Swipe choose is a bookmark, not a bid

- Date: 2026-09-07
- Status: Accepted; adopts `MKT-DEC-006`
- Decision: การ choose จาก Swipe บันทึก Buyer interest เป็น `SwipeChoice` หนึ่งรายการต่อ user/card และไม่สร้าง Bid หรือ Order
- Reason: Marketing freeze semantics แล้วว่าการสนใจสินค้าและการประมูลเป็นคนละ command และมี contract คนละชุด
- Consequence: รายการนี้ supersede `BUY-DEC-005`; UI ใช้ `POST /api/products/videos/:id/choose`. Endpoint บังคับ authentication แล้ว แต่ service ยังไม่ reject role ที่ไม่ใช่ Buyer; role enforcement, automated contract และ PostgreSQL acceptance ยังเปิดอยู่

## BUY-DEC-007 — Review rates the seller per completed order

- Date: 2026-09-07
- Status: Accepted
- Decision: Review ผูกกับ Order ที่ `completed`, ให้เฉพาะ Buyer ของ Order สร้างได้หนึ่งครั้ง และคะแนนรวมใช้ประเมิน Seller ไม่ใช่ Product ชิ้นเดียว
- Reason: สินค้ามือสองหนึ่ง listing ขายได้ครั้งเดียว แต่ความน่าเชื่อถือของ Seller ถูกใช้ซ้ำใน Product และ Storefront journeys
- Consequence: `orderId` ต้อง unique ใน Review database; Product detail/Storefront แสดง seller aggregate และรายการรีวิว ส่วน Contact Seller ยังเป็นงานแยกที่ไม่เสร็จ

## BUY-DEC-008 — Review media storage belongs to review-service

- Date: 2026-09-07
- Status: Accepted
- Decision: รูปและวิดีโอรีวิวใหม่เก็บใน `review-service` volume `review_uploads`; รูปและคลิปสินค้ายังคงอยู่ใน `product-service` volume `product_uploads`
- Reason: ให้ service ที่เป็นเจ้าของ Review metadata เป็นเจ้าของ lifecycle ของไฟล์รีวิวด้วย และไม่ให้ Buyer review พึ่ง Product upload storage
- Consequence: Upload ใช้ `POST /api/reviews/uploads`, public read ใช้ `/review-uploads/*`; URL เก่า `/uploads/*` ยังอ่านจาก Product storage และต้องใช้ migration แยกหากต้องการย้ายข้อมูลเดิม
