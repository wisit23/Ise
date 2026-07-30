# RE-LOOP Combined Teach Me

## Round 0 — ทำไมต้องแบ่งแบบ Vertical Feature

การแบ่งแบบเดิมตาม Frontend/Backend/Database ทำให้ Feature เดียวผ่านหลาย Owner และรอกันเป็นทอด
แบบใหม่ให้หนึ่งคนรับผิดชอบ outcome ของ Role หนึ่งกลุ่ม แต่ไม่ได้อนุญาตให้คนนั้นเปลี่ยน shared
contract คนเดียว

ตัวอย่าง Buyer checkout:

```text
Buyer UI
  → Gateway/Auth
  → Order API
  → Product reservation contract
  → Order database
  → response กลับ Buyer UI
```

Buyer Owner ดูแล journey และ Order rule ส่วน Seller Owner ดูแล Product state
จุดเชื่อมต้องถูกล็อกด้วย contract test ก่อนทั้งสองคนทำพร้อมกัน

### เอกสารสี่ชนิดต่างกันอย่างไร

- `plan.md`: จะทำอะไรและผ่านเมื่อไร
- `progress.md`: ตอนนี้อยู่ตรงไหนและทำอะไรต่อ
- `changelog.md`: เกิดอะไรขึ้นจริงตามเวลา
- `teachme.md`: ทีมเรียนรู้อะไรจากสิ่งที่ทำ/ตรวจจริง

### Teach-back

1. ถ้า code เขียนเสร็จแต่ integration test ไม่ผ่าน ควรอยู่สถานะใด?
2. เพราะเหตุใด Changelog จึงไม่ใช่หลักฐานว่า Task Done?
3. ถ้า Product เปลี่ยน status field ใครต้อง review ก่อน Buyer merge?

คำตอบ: `Review` หรือ `Blocked` ตามสาเหตุ; Changelog บอกเพียงว่าเคยเกิดการเปลี่ยนแปลง;
Seller/Product provider และ Buyer consumer ต้อง review contract ร่วมกัน
