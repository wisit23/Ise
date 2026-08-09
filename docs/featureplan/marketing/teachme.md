# Marketing Feature Teach Me

## Round 0 — Campaign ต้องวัดผลย้อนกลับได้

การแสดงโค้ดส่วนลดใน UI ไม่พิสูจน์ Conversion Campaign contract ต้องมี campaign ID ที่ติดกับ
การใช้โปรโมชันและไหลไปยัง Order event โดยไม่ให้ Marketing แก้ Order database โดยตรง

```text
Campaign publish → Buyer sees offer → Order records attribution
→ order.completed.v1 → Marketing aggregate
```

**Teach-back:** เพราะเหตุใด Conversion ต้องอิง completed order ไม่ใช่จำนวนคลิกอย่างเดียว?

## Round 1 — Requirement owner ไม่จำเป็นต้องเป็น database owner

`UR-11` อยู่ใน Marketing scope แต่ source ของ feed อยู่ใน Seller/Product และหน้าที่ผู้ใช้
อยู่ใน Buyer UI ได้ Marketing ยังต้องกำหนด/ตรวจ acceptance semantics ร่วมกับ provider และ
consumer โดยไม่ย้าย Product database มาเป็นของ Marketing

**Teach-back:** ถ้า feed เปิดดูได้แต่ไม่มี choose event Marketing ควรรายงานเป็น Done หรือ baseline และเพราะอะไร?

## Round 2 — Correctness ของ feed ไม่ได้ปิด Requirement semantics

Refactor แก้ feed ให้แสดงเฉพาะ Product `available` และแก้ชื่อผู้ขายให้เชื่อถือได้แล้ว แต่สิ่งนี้
ยังตอบไม่ได้ว่า “choose” ต้องสร้าง state/event ใด Marketing จึงยังต้อง freeze semantics ก่อน
ยก `UR-11` เป็น Done
