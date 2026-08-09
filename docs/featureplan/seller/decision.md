# Seller Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## SEL-DEC-001 — Vertical Seller ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Seller Owner รับผิดชอบ `UR-32`–`UR-39` แบบ vertical ตั้งแต่ UI, API, KYC/listing rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้ Seller journey มี Owner เดียวตั้งแต่สมัครขายจนถึงจัดส่งและดูผลลัพธ์
- Consequence: Auth/RBAC และ Order contracts ยังต้อง review ร่วมกับ Admin และ Buyer

## SEL-DEC-002 — Synthetic KYC only

- Date: 2026-08-10
- Status: Accepted
- Decision: KYC ใช้บุคคลและเอกสาร synthetic เท่านั้น ไม่มีข้อมูลบัตรหรือเอกสารจริง
- Reason: ต้องการทดสอบ flow โดยไม่ประมวลผลข้อมูลระบุตัวตนจริง
- Consequence: `KycApplication`, document reference และ decision state ต้องบันทึกใน Auth PostgreSQL จริง; ห้ามใช้ mock database เป็น acceptance evidence

## SEL-DEC-003 — Seller owns Product contract

- Date: 2026-08-10
- Status: Accepted
- Decision: Seller/Product เป็น provider ของ Product state, listing และ inventory ให้ Buyer, Marketing และ Admin
- Reason: ป้องกันแต่ละ Feature นิยามสถานะสินค้าแยกกัน
- Consequence: Consumer ห้ามอ่าน Product database โดยตรง และการเปลี่ยน schema/state ต้องผ่าน integration review

## SEL-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/PDPA hardening ของ KYC/media/secrets แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## SEL-DEC-005 — ProductVideo provider baseline needs review

- Date: 2026-08-10
- Status: Needs review
- Decision: เก็บ ProductVideo/feed/upload ที่ pull มาเป็น Seller/Product provider baseline แต่ยังไม่ freeze เป็น shared contract
- Reason: Feed filter ยังรวม `reserved`/`sold`, `sellerName` มาจาก request body และ `UR-11` semantics ยังไม่ชัด
- Consequence: Seller, Buyer และ Marketing ต้อง review allowed states, identity source และ acceptance tests ก่อน Gate 2

## SEL-DEC-006 — ProductVideo feed and seller identity implementation rule

- Date: 2026-08-10
- Status: Accepted for implementation; contract review pending
- Decision: Feed query แสดงเฉพาะ Product `available` และ `sellerName` ต้องมาจาก verified JWT `displayName`; request body ไม่มีอำนาจกำหนดชื่อ
- Reason: ให้ comment/behavior ตรงกัน ป้องกัน sold/reserved item ใน discovery feed และป้องกัน client ปลอมชื่อ
- Consequence: Access token/refresh ต้องสร้าง display name จาก Auth User, ProductVideo service ignore body name และ Prisma index ต้อง apply ก่อน database acceptance
