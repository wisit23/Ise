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

## Round 3 — A DB function returning `void` breaks `$queryRaw`, not `$executeRaw`

Serializing concurrent bids with `pg_advisory_xact_lock` seemed like the obvious Postgres-native
fix for "two buyers bid the exact same amount at the exact same time" — but calling it through
Prisma's `$queryRaw` failed every time with a deserialization error, because Prisma tries to read
a result row back and `pg_advisory_xact_lock` returns `void`. The fix was mechanical
(`$executeRaw` instead, since we don't need a return value) but it only surfaced by actually
placing two real bids against a running Postgres instance — the mocked unit tests never call the
real database, so they could not have caught it. Manual verification against the real stack
found this in minutes; skipping it would have shipped a 500 on every single bid.

**Teach-back:** ทำไมเทสที่ mock repository ทั้งหมดถึงจับบั๊กนี้ไม่ได้ และควรตรวจอะไรเพิ่มก่อนเชื่อว่า
"ผ่านเทสแล้ว" เท่ากับ "ใช้งานได้จริง"?

## Round 4 — Requirement owner ≠ pricing owner

Marketing เดิมถูกเสนอให้ตั้งราคาเริ่มต้น/เรทการบิดของ auction ด้วย แต่ Product owner ทักว่า Seller
ควรเป็นคนตั้งราคาสินค้าของตัวเองเหมือนตอนลงขายปกติ — ปรับ scope ให้ Marketing คุมแค่ตาราง
เวลา (schedule/cancel) ส่วน Seller ตั้ง `startingPrice`/`bidIncrement` ตอน submit สิ่งนี้สอดคล้อง
กับหลักการเดิมของ Feature นี้ที่ว่า **requirement owner ไม่จำเป็นต้อง own ทุกฟิลด์** (เหมือน Round 1
ที่ `UR-11` ก็ไม่ใช่ Marketing owns ทุกอย่าง) — ดู `MKT-005` ใน `plan.md` และ `decision.md`
