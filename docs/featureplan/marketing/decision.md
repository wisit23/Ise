# Marketing Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## MKT-DEC-001 — Vertical Marketing ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Marketing Owner รับผิดชอบ `UR-08`–`UR-16` แบบ vertical ตั้งแต่ UI, API, Campaign rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้ campaign lifecycle และผลลัพธ์มี Owner เดียว
- Consequence: Product, Order และ Executive contracts ยังต้อง review ร่วมกับ Seller, Buyer และ Executive

## MKT-DEC-002 — Marketing owns Campaign data

- Date: 2026-08-10
- Status: Accepted
- Decision: Marketing/Campaign เป็น provider ของ campaign lifecycle และ publish state
- Reason: ป้องกัน Buyer หรือ Executive เปลี่ยน Campaign state ข้าม ownership
- Consequence: Consumer ใช้ API/event contract และห้ามอ่าน Campaign database โดยตรง

## MKT-DEC-003 — Attribution uses provider contracts

- Date: 2026-08-10
- Status: Accepted
- Decision: Conversion/attribution อ่าน Product และ completed Order ผ่าน provider endpoint/event ไม่ query database ของ service อื่น
- Reason: รักษา service ownership และทำให้ metric trace กลับไปยัง source ได้
- Consequence: ต้องมี contract test, idempotent event handling และ unavailable state ที่ชัดเจน

## MKT-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/consent/abuse hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## MKT-DEC-005 — `UR-11` ownership across pulled source

- Date: 2026-08-10
- Status: Needs decision
- Decision: คง Marketing เป็น requirement owner ของ `UR-11`, Seller/Product เป็น provider และ Buyer เป็น consumer จนกว่า Gate 0 จะยืนยัน contract
- Reason: โค้ดที่ pull มาแบ่งอยู่ใน Product service, seller upload UI และ public Buyer-facing Swipe UI แต่ยังไม่มี choose behavior
- Consequence: ห้าม Feature ใดอ้าง `UR-11` Done จากการมี feed อย่างเดียว และการแก้ contract ต้อง review ร่วมสาม Owner
