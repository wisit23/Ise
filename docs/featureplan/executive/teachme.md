# Executive Feature Teach Me

## Round 0 — Dashboard ต้องมีนิยามตัวเลข

GMV ไม่ใช่ยอดรวม Order ทุกสถานะ ต้องรวมเฉพาะ transaction state ที่นิยามไว้ เช่น
`completed`; platform revenue ต้องมี fee rule แยก ไม่เดาจากราคา Seller dashboard

Executive endpoint อ่าน aggregate จาก owner service และเป็น read-only หาก dependency
ล้มเหลวต้องแสดง partial/unavailable ไม่แทนด้วย `0`

**Teach-back:** ค่า `0` ต่างจาก `unavailable` อย่างไรต่อการตัดสินใจของผู้บริหาร?
