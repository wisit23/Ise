# Marketing Feature Teach Me

## Round 0 — Campaign ต้องวัดผลย้อนกลับได้

การแสดงโค้ดส่วนลดใน UI ไม่พิสูจน์ Conversion Campaign contract ต้องมี campaign ID ที่ติดกับ
การใช้โปรโมชันและไหลไปยัง Order event โดยไม่ให้ Marketing แก้ Order database โดยตรง

```text
Campaign publish → Buyer sees offer → Order records attribution
→ order.completed.v1 → Marketing aggregate
```

**Teach-back:** เพราะเหตุใด Conversion ต้องอิง completed order ไม่ใช่จำนวนคลิกอย่างเดียว?
