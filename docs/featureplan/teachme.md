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

### เอกสารหกชนิดต่างกันอย่างไร

- `plan.md`: จะทำอะไรและผ่านเมื่อไร
- `progress.md`: ตอนนี้อยู่ตรงไหนและทำอะไรต่อ
- `changelog.md`: เกิดอะไรขึ้นจริงตามเวลา
- `teachme.md`: ทีมเรียนรู้อะไรจากสิ่งที่ทำ/ตรวจจริง
- `handoff.md`: คนถัดไปรับช่วงจากจุดไหนและต้องได้รับหลักฐานอะไร
- `decision.md`: ทีมตัดสินใจอะไร เพราะอะไร และมีผลกระทบอย่างไร

### Teach-back

1. ถ้า code เขียนเสร็จแต่ integration test ไม่ผ่าน ควรอยู่สถานะใด?
2. เพราะเหตุใด Changelog จึงไม่ใช่หลักฐานว่า Task Done?
3. ถ้า Product เปลี่ยน status field ใครต้อง review ก่อน Buyer merge?

คำตอบ: `Review` หรือ `Blocked` ตามสาเหตุ; Changelog บอกเพียงว่าเคยเกิดการเปลี่ยนแปลง;
Seller/Product provider และ Buyer consumer ต้อง review contract ร่วมกัน

## Round 1 — หลัง Pull: Source Baseline ไม่เท่ากับ Feature Done

Source ใหม่มีเส้นทางทำงานจริงดังนี้:

```text
Seller /seller/videos/new
  → POST /uploads
  → POST /api/products/videos
  → ProductVideo ใน Product PostgreSQL
  → GET /api/products/videos/feed
  → Buyer-facing /swipe
```

แต่การมีเส้นทางนี้ยังไม่ยืนยัน `UR-11` เพราะหน้า `/swipe` ปัจจุบันเพียงเลื่อนดูคลิปและ
เปิดหน้าสินค้า ไม่มี persisted “choose” action นอกจากนี้ feed filter กับ trusted seller identity
ยังไม่ผ่าน contract review ดังนั้น progress ต้องเขียนว่า “baseline audited” ไม่ใช่ “Done”
